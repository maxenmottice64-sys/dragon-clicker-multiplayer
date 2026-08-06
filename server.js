const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// Helper to calculate skin boost multiplier
function getSkinBoost(skinLevel) {
  // Level 1 = 5% (0.05), Level 52 = 515% (5.15)
  return 1 + (skinLevel * 0.10); 
}

let globalGameState = {
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

app.use(express.static('public'));

// Helper function to handle a full economy wipe
function resetAllStats() {
  globalGameState.cash = 0;
  globalGameState.cpc = 1;
  globalGameState.cps = 0;
  globalGameState.cpcUpgradesCount = {};
  globalGameState.cpsUpgradesCount = {};
}

io.on('connection', (socket) => {
  socket.emit('syncState', globalGameState);

  // Player click
  socket.on('playerClick', () => {
    const ticketMultiplier = 1 + (globalGameState.goldenTickets * 0.10);
    const skinMultiplier = getSkinBoost(globalGameState.activeSkinLevel);
    
    const earned = globalGameState.cpc * ticketMultiplier * skinMultiplier;
    globalGameState.cash += earned;

    io.emit('clickBroadcast', {
      newCash: globalGameState.cash,
      earned: earned
    });
  });

  // Buying an upgrade
  socket.on('buyUpgrade', (data) => {
    const { id, type, cost, addValue } = data;
    if (globalGameState.cash >= cost) {
      globalGameState.cash -= cost;
      if (type === 'cpc') {
        globalGameState.cpc += addValue;
        globalGameState.cpcUpgradesCount[id] = (globalGameState.cpcUpgradesCount[id] || 0) + 1;
      } else if (type === 'cps') {
        globalGameState.cps += addValue;
        globalGameState.cpsUpgradesCount[id] = (globalGameState.cpsUpgradesCount[id] || 0) + 1;
      }
      io.emit('syncState', globalGameState);
    }
  });

  // Equipping skin with boost properties
  socket.on('equipSkin', (skinData) => {
    globalGameState.activeSkinIcon = skinData.icon;
    globalGameState.activeSkinName = skinData.name;
    globalGameState.activeSkinLevel = skinData.level || 1;
    io.emit('syncState', globalGameState);
  });

  // Ascension execution
  socket.on('performAscension', () => {
    const earnedTickets = Math.floor(Math.sqrt(globalGameState.cash / 100000));
    if (earnedTickets > 0) {
      globalGameState.goldenTickets += earnedTickets;
      globalGameState.totalAscensions += 1;
      resetAllStats();
      io.emit('syncState', globalGameState);
    }
  });

  // Admin Broadcast Announcement Event
  socket.on('adminSendAnnouncement', (message) => {
    if (message && message.trim().length > 0) {
      io.emit('serverAnnouncement', message.trim());
    }
  });

  // Admin modifications
  socket.on('adminModifyState', (mod) => {
    if (mod.addCash !== undefined) globalGameState.cash += mod.addCash;
    if (mod.setCash !== undefined) globalGameState.cash = mod.setCash;

    if (mod.addCPS !== undefined) globalGameState.cps += mod.addCPS;
    if (mod.setCPS !== undefined) globalGameState.cps = mod.setCPS;

    if (mod.addCPC !== undefined) globalGameState.cpc += mod.addCPC;
    if (mod.setCPC !== undefined) globalGameState.cpc = mod.setCPC;

    if (mod.addTickets !== undefined) globalGameState.goldenTickets += mod.addTickets;
    if (mod.setTickets !== undefined) globalGameState.goldenTickets = mod.setTickets;

    // Manual Full Reset via Admin Panel (Cash, CPC, CPS, and Upgrades)
    if (mod.resetAllCash) {
      resetAllStats();
      io.emit('serverNotification', 'An Admin has reset all global stats (Cash, CPC, & CPS) back to base values!');
    }

    io.emit('syncState', globalGameState);
  });
});

// Passive Income Ticker (1 second interval)
setInterval(() => {
  if (globalGameState.cps > 0) {
    const ticketMultiplier = 1 + (globalGameState.goldenTickets * 0.10);
    const skinMultiplier = getSkinBoost(globalGameState.activeSkinLevel);
    
    globalGameState.cash += (globalGameState.cps * ticketMultiplier * skinMultiplier);
    io.emit('syncState', globalGameState);
  }
}, 1000);

// AUTOMATIC FULL STATS RESET EVERY 30 MINUTES (1,800,000 ms)
setInterval(() => {
  resetAllStats();
  io.emit('syncState', globalGameState);
  io.emit('serverNotification', '⏰ 30-Minute Automated Reset: All cash, CPC, and CPS stats have been cleared!');
}, 30 * 60 * 1000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Dragon Server running on http://localhost:${PORT}`));