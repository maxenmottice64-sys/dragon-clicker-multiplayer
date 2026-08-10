const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

let users = {};
let bannedUsers = {}; 

function getSkinBoost(skinLevel) {
  return 1 + (skinLevel * 0.10); 
}

function getDefaultStats() {
  return {
    cash: 0,
    cpc: 1,
    cps: 0,
    goldenTickets: 0,
    totalAscensions: 0,
    activeSkinIcon: '🐉',
    activeSkinName: 'Crimson Drake',
    activeSkinLevel: 1,
    cpcUpgradesCount: {},
    cpsUpgradesCount: {}
  };
}

function resetAllUserAccounts() {
  for (let username in users) {
    users[username] = getDefaultStats();
  }
}

// Generate Top 10 Leaderboard for a specific Room
function getLeaderboardData(roomId = 'public') {
  const roomSockets = Array.from(io.sockets.sockets.values()).filter(s => s.currentRoom === roomId);
  const roomUsers = roomSockets.map(s => {
    const key = s.usernameKey;
    return {
      username: users[key]?.displayName || key,
      cash: users[key]?.cash || 0,
      goldenTickets: users[key]?.goldenTickets || 0
    };
  });

  roomUsers.sort((a, b) => b.cash - a.cash);
  return roomUsers.slice(0, 10);
}

function broadcastLeaderboard(roomId = 'public') {
  io.to(roomId).emit('updateLeaderboard', getLeaderboardData(roomId));
}

function getRoomPlayerList(roomId) {
  const roomSockets = Array.from(io.sockets.sockets.values()).filter(s => s.currentRoom === roomId);
  return roomSockets.map(s => ({
    username: users[s.usernameKey]?.displayName || s.usernameKey,
    activeSkinIcon: users[s.usernameKey]?.activeSkinIcon || '🐉'
  }));
}

function broadcastRoomPlayers(roomId) {
  io.to(roomId).emit('roomPlayersUpdate', getRoomPlayerList(roomId));
}

app.use(express.static('public'));

io.on('connection', (socket) => {
  let currentUsername = null;
  socket.currentRoom = 'public';

  // Login or Register
  socket.on('userLogin', (data) => {
    const rawUsername = data && data.username ? data.username.trim() : '';
    
    if (!rawUsername || rawUsername.length < 3 || rawUsername.length > 16) {
      return socket.emit('loginError', 'Username must be between 3 and 16 characters!');
    }

    const usernameKey = rawUsername.toLowerCase();

    if (bannedUsers[usernameKey]) {
      return socket.emit('userBanned', { reason: bannedUsers[usernameKey] });
    }

    const isAlreadyConnected = Array.from(io.sockets.sockets.values()).some(s => s.usernameKey === usernameKey && s.id !== socket.id);
    if (isAlreadyConnected) {
      return socket.emit('loginError', 'This username is currently active in another session!');
    }

    if (!users[usernameKey]) {
      users[usernameKey] = getDefaultStats();
      users[usernameKey].displayName = rawUsername;
    }

    currentUsername = usernameKey;
    socket.usernameKey = usernameKey;
    socket.currentRoom = 'public';
    socket.join('public');

    socket.emit('loginSuccess', {
      username: users[usernameKey].displayName || rawUsername,
      state: users[usernameKey],
      roomId: 'public'
    });

    broadcastLeaderboard('public');
    broadcastRoomPlayers('public');
  });

  // Switch / Join Server Room (Public or Private)
  socket.on('joinRoom', (targetRoomId) => {
    if (!currentUsername) return;

    const oldRoom = socket.currentRoom;
    socket.leave(oldRoom);

    const roomCode = targetRoomId ? targetRoomId.trim().toUpperCase() : 'PUBLIC';
    socket.currentRoom = roomCode;
    socket.join(roomCode);

    socket.emit('roomJoined', { roomId: roomCode });

    broadcastLeaderboard(oldRoom);
    broadcastRoomPlayers(oldRoom);
    broadcastLeaderboard(roomCode);
    broadcastRoomPlayers(roomCode);
  });

  // Player Click & Broadcast to Room
  socket.on('playerClick', () => {
    if (!currentUsername || !users[currentUsername]) return;
    const user = users[currentUsername];

    const ticketMultiplier = 1 + (user.goldenTickets * 0.10);
    const skinMultiplier = getSkinBoost(user.activeSkinLevel);
    
    const earned = user.cpc * ticketMultiplier * skinMultiplier;
    user.cash += earned;

    socket.emit('syncState', user);
    
    // Broadcast click visual effect to everyone in the same room
    io.to(socket.currentRoom).emit('remotePlayerClick', {
      username: user.displayName,
      earned: earned,
      skinIcon: user.activeSkinIcon
    });

    broadcastLeaderboard(socket.currentRoom);
  });

  // Buy Upgrade
  socket.on('buyUpgrade', (data) => {
    if (!currentUsername || !users[currentUsername]) return;
    const user = users[currentUsername];
    const { id, type, cost, addValue } = data;

    if (user.cash >= cost) {
      user.cash -= cost;
      if (type === 'cpc') {
        user.cpc += addValue;
        user.cpcUpgradesCount[id] = (user.cpcUpgradesCount[id] || 0) + 1;
      } else if (type === 'cps') {
        user.cps += addValue;
        user.cpsUpgradesCount[id] = (user.cpsUpgradesCount[id] || 0) + 1;
      }
      socket.emit('syncState', user);
      broadcastLeaderboard(socket.currentRoom);
    }
  });

  // Equip Skin
  socket.on('equipSkin', (skinData) => {
    if (!currentUsername || !users[currentUsername]) return;
    const user = users[currentUsername];

    user.activeSkinIcon = skinData.icon;
    user.activeSkinName = skinData.name;
    user.activeSkinLevel = skinData.level || 1;
    socket.emit('syncState', user);
    broadcastRoomPlayers(socket.currentRoom);
  });

  // Ascension
  socket.on('performAscension', () => {
    if (!currentUsername || !users[currentUsername]) return;
    const user = users[currentUsername];

    const earnedTickets = Math.floor(Math.sqrt(user.cash / 100000));
    if (earnedTickets > 0) {
      user.goldenTickets += earnedTickets;
      user.totalAscensions += 1;
      
      user.cash = 0;
      user.cpc = 1;
      user.cps = 0;
      user.cpcUpgradesCount = {};
      user.cpsUpgradesCount = {};
      
      socket.emit('syncState', user);
      broadcastLeaderboard(socket.currentRoom);
    }
  });

  // Anti-cheat Alert Handler
  socket.on('cheaterDetected', (data) => {
    if (!currentUsername) return;
    const displayName = users[currentUsername] ? users[currentUsername].displayName : currentUsername;
    
    io.emit('adminCheaterAlert', {
      username: displayName,
      cps: data.cps || 30
    });
  });

  // Admin Broadcast Announcement
  socket.on('adminSendAnnouncement', (message) => {
    if (message && message.trim().length > 0) {
      io.emit('serverAnnouncement', message.trim());
    }
  });

  // Admin Ban User
  socket.on('adminBanUser', (data) => {
    const targetUsername = data.targetUsername ? data.targetUsername.trim().toLowerCase() : '';
    const reason = data.reason ? data.reason.trim() : 'Violation of community guidelines.';

    if (!targetUsername) return;

    bannedUsers[targetUsername] = reason;

    for (let [id, s] of io.sockets.sockets) {
      if (s.usernameKey === targetUsername) {
        s.emit('userBanned', { reason: reason });
        s.disconnect();
      }
    }

    io.emit('serverNotification', `🔨 Player "${data.targetUsername}" has been banned for: ${reason}`);
    broadcastLeaderboard('public');
  });

  // Admin modifications
  socket.on('adminModifyState', (mod) => {
    if (!currentUsername || !users[currentUsername]) return;
    const user = users[currentUsername];

    if (mod.addCash !== undefined) user.cash += mod.addCash;
    if (mod.addCPS !== undefined) user.cps += mod.addCPS;
    if (mod.addCPC !== undefined) user.cpc += mod.addCPC;
    if (mod.addTickets !== undefined) user.goldenTickets += mod.addTickets;

    if (mod.resetAllCash) {
      resetAllUserAccounts();
      io.emit('serverNotification', '🚨 An Admin has completely reset all user stats across all servers!');
      for (let [id, s] of io.sockets.sockets) {
        if (s.usernameKey && users[s.usernameKey]) {
          s.emit('syncState', users[s.usernameKey]);
        }
      }
    } else {
      socket.emit('syncState', user);
    }

    broadcastLeaderboard(socket.currentRoom);
  });

  socket.on('disconnect', () => {
    broadcastLeaderboard(socket.currentRoom);
    broadcastRoomPlayers(socket.currentRoom);
  });
});

// Passive Income Ticker (1 sec)
setInterval(() => {
  for (let [id, socket] of io.sockets.sockets) {
    if (socket.usernameKey && users[socket.usernameKey]) {
      const user = users[socket.usernameKey];
      if (user.cps > 0) {
        const ticketMultiplier = 1 + (user.goldenTickets * 0.10);
        const skinMultiplier = getSkinBoost(user.activeSkinLevel);
        user.cash += (user.cps * ticketMultiplier * skinMultiplier);
        socket.emit('syncState', user);
      }
    }
  }
}, 1000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Dragon Server running on http://localhost:${PORT}`));
