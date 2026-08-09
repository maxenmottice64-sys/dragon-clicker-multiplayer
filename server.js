const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// Storage for user accounts and banned users
// users[username] = { cash, cpc, cps, goldenTickets, totalAscensions, activeSkinIcon, activeSkinName, activeSkinLevel, cpcUpgradesCount, cpsUpgradesCount }
let users = {};
let bannedUsers = {}; // bannedUsers[username] = reason

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

// Reset stats for all accounts
function resetAllUserAccounts() {
  for (let username in users) {
    users[username] = getDefaultStats();
  }
}

app.use(express.static('public'));

io.on('connection', (socket) => {
  let currentUsername = null;

  // Login or Register attempt
  socket.on('userLogin', (data) => {
    const rawUsername = data && data.username ? data.username.trim() : '';
    
    if (!rawUsername || rawUsername.length < 3 || rawUsername.length > 16) {
      return socket.emit('loginError', 'Username must be between 3 and 16 characters!');
    }

    const usernameKey = rawUsername.toLowerCase();

    // Check if banned
    if (bannedUsers[usernameKey]) {
      return socket.emit('userBanned', { reason: bannedUsers[usernameKey] });
    }

    // Check if another active connection is using this username
    const isAlreadyConnected = Array.from(io.sockets.sockets.values()).some(s => s.usernameKey === usernameKey && s.id !== socket.id);
    if (isAlreadyConnected) {
      return socket.emit('loginError', 'This username is currently active in another session!');
    }

    // Assign account (create new if doesn't exist)
    if (!users[usernameKey]) {
      users[usernameKey] = getDefaultStats();
      users[usernameKey].displayName = rawUsername;
    }

    currentUsername = usernameKey;
    socket.usernameKey = usernameKey;

    socket.emit('loginSuccess', {
      username: users[usernameKey].displayName || rawUsername,
      state: users[usernameKey]
    });
  });

  // Player click
  socket.on('playerClick', () => {
    if (!currentUsername || !users[currentUsername]) return;
    const user = users[currentUsername];

    const ticketMultiplier = 1 + (user.goldenTickets * 0.10);
    const skinMultiplier = getSkinBoost(user.activeSkinLevel);
    
    const earned = user.cpc * ticketMultiplier * skinMultiplier;
    user.cash += earned;

    socket.emit('syncState', user);
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
    }
  });

  // Admin Broadcast Announcement
  socket.on('adminSendAnnouncement', (message) => {
    if (message && message.trim().length > 0) {
      io.emit('serverAnnouncement', message.trim());
    }
  });

  // Admin Ban User System
  socket.on('adminBanUser', (data) => {
    const targetUsername = data.targetUsername ? data.targetUsername.trim().toLowerCase() : '';
    const reason = data.reason ? data.reason.trim() : 'Violation of community guidelines.';

    if (!targetUsername) return;

    bannedUsers[targetUsername] = reason;

    // Disconnect active socket if currently online
    for (let [id, s] of io.sockets.sockets) {
      if (s.usernameKey === targetUsername) {
        s.emit('userBanned', { reason: reason });
        s.disconnect();
      }
    }

    io.emit('serverNotification', `🔨 Player "${data.targetUsername}" has been banned for: ${reason}`);
  });

  // Admin modifications
  socket.on('adminModifyState', (mod) => {
    if (!currentUsername || !users[currentUsername]) return;
    const user = users[currentUsername];

    if (mod.addCash !== undefined) user.cash += mod.addCash;
    if (mod.addCPS !== undefined) user.cps += mod.addCPS;
    if (mod.addCPC !== undefined) user.cpc += mod.addCPC;
    if (mod.addTickets !== undefined) user.goldenTickets += mod.addTickets;

    // Global Reset Trigger
    if (mod.resetAllCash) {
      resetAllUserAccounts();
      io.emit('serverNotification', '🚨 An Admin has completely reset all user stats, Golden Tickets, and unlocked skins!');
      for (let [id, s] of io.sockets.sockets) {
        if (s.usernameKey && users[s.usernameKey]) {
          s.emit('syncState', users[s.usernameKey]);
        }
      }
    } else {
      socket.emit('syncState', user);
    }
  });
});

// Passive Income Ticker (1 second interval)
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

// AUTOMATIC FULL STATS RESET EVERY 30 MINUTES
setInterval(() => {
  resetAllUserAccounts();
  io.emit('serverNotification', '⏰ 30-Minute Automated Reset: All cash, upgrades, Golden Tickets, and skins have been wiped across all accounts!');
  for (let [id, socket] of io.sockets.sockets) {
    if (socket.usernameKey && users[socket.usernameKey]) {
      socket.emit('syncState', users[socket.usernameKey]);
    }
  }
}, 30 * 60 * 1000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Dragon Server running on http://localhost:${PORT}`));
