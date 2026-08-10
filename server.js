const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

let users = {};
let bannedUsers = {}; 

// Rooms state
// rooms[roomId] = { name: string, isPrivate: bool, passcode: string, members: Set }
let rooms = {
  'public_global': { name: 'Main Global Server', isPrivate: false, passcode: '', members: new Set() }
};

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

function getLeaderboardData(roomId = 'public_global') {
  const roomMembers = rooms[roomId] ? Array.from(rooms[roomId].members) : [];
  const userList = roomMembers.map(usernameKey => ({
    username: users[usernameKey] ? users[usernameKey].displayName || usernameKey : usernameKey,
    cash: users[usernameKey] ? users[usernameKey].cash || 0 : 0,
    goldenTickets: users[usernameKey] ? users[usernameKey].goldenTickets || 0 : 0
  }));

  userList.sort((a, b) => b.cash - a.cash);
  return userList.slice(0, 10);
}

function broadcastLeaderboard(roomId) {
  if (!roomId) return;
  io.to(roomId).emit('updateLeaderboard', getLeaderboardData(roomId));
}

function getRoomList() {
  const list = [];
  for (let id in rooms) {
    list.push({
      id: id,
      name: rooms[id].name,
      isPrivate: rooms[id].isPrivate,
      playerCount: rooms[id].members.size
    });
  }
  return list;
}

function broadcastRoomList() {
  io.emit('updateRoomList', getRoomList());
}

app.use(express.static('public'));

io.on('connection', (socket) => {
  let currentUsername = null;
  let currentRoom = 'public_global';

  // Login handler
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

    // Default join global public room
    joinRoom(socket, 'public_global');

    socket.emit('loginSuccess', {
      username: users[usernameKey].displayName || rawUsername,
      state: users[usernameKey],
      currentRoom: currentRoom
    });

    broadcastRoomList();
  });

  // Helper room join function
  function joinRoom(sock, roomId) {
    if (currentRoom && rooms[currentRoom]) {
      rooms[currentRoom].members.delete(currentUsername);
      sock.leave(currentRoom);
      broadcastLeaderboard(currentRoom);
    }

    currentRoom = roomId;
    sock.join(roomId);
    rooms[roomId].members.add(currentUsername);

    sock.emit('roomJoined', { roomId: roomId, roomName: rooms[roomId].name });
    broadcastLeaderboard(roomId);
    broadcastRoomList();
  }

  // Create Server
  socket.on('createRoom', (data) => {
    const { name, isPrivate, passcode } = data;
    if (!name || name.trim().length === 0) return socket.emit('roomError', 'Server name is required!');

    const roomId = 'room_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
    rooms[roomId] = {
      name: name.trim(),
      isPrivate: !!isPrivate,
      passcode: passcode ? passcode.trim() : '',
      members: new Set()
    };

    joinRoom(socket, roomId);
  });

  // Join Server
  socket.on('joinRoom', (data) => {
    const { roomId, passcode } = data;
    const targetRoom = rooms[roomId];

    if (!targetRoom) return socket.emit('roomError', 'Server does not exist!');

    if (targetRoom.isPrivate) {
      if (targetRoom.passcode !== passcode) {
        return socket.emit('roomError', 'Incorrect server password!');
      }
    }

    joinRoom(socket, roomId);
  });

  // Fetch Rooms
  socket.on('getRooms', () => {
    socket.emit('updateRoomList', getRoomList());
  });

  // Player click
  socket.on('playerClick', () => {
    if (!currentUsername || !users[currentUsername]) return;
    const user = users[currentUsername];

    const ticketMultiplier = 1 + (user.goldenTickets * 0.10);
    const skinMultiplier = getSkinBoost(user.activeSkinLevel);
    
    const earned = user.cpc * ticketMultiplier * skinMultiplier;
    user.cash += earned;

    // Broadcast click animation to everyone in the same room
    io.to(currentRoom).emit('coopClick', {
      username: user.displayName || currentUsername,
      amount: earned
    });

    socket.emit('syncState', user);
    broadcastLeaderboard(currentRoom);
  });

  // Buying an upgrade
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
      broadcastLeaderboard(currentRoom);
    }
  });

  // Equipping skin
  socket.on('equipSkin', (skinData) => {
    if (!currentUsername || !users[currentUsername]) return;
    const user = users[currentUsername];

    user.activeSkinIcon = skinData.icon;
    user.activeSkinName = skinData.name;
    user.activeSkinLevel = skinData.level || 1;
    socket.emit('syncState', user);
  });

  // Ascension execution
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
      broadcastLeaderboard(currentRoom);
    }
  });

  // Anti-cheat alert
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
    broadcastLeaderboard(currentRoom);
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
      io.emit('serverNotification', '🚨 An Admin has completely reset all user stats!');
      for (let [id, s] of io.sockets.sockets) {
        if (s.usernameKey && users[s.usernameKey]) {
          s.emit('syncState', users[s.usernameKey]);
        }
      }
    } else {
      socket.emit('syncState', user);
    }

    broadcastLeaderboard(currentRoom);
  });

  socket.on('disconnect', () => {
    if (currentUsername && rooms[currentRoom]) {
      rooms[currentRoom].members.delete(currentUsername);
      broadcastLeaderboard(currentRoom);
      broadcastRoomList();
    }
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
