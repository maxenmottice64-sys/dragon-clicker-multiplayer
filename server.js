const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

// In-memory data store
const players = {}; // socket.id -> player object
const bannedUsers = new Set();
const roomPasscodes = {}; // roomName -> passcode

function getRoomLeaderboard(roomName) {
  return Object.values(players)
    .filter(p => p.currentRoom === roomName)
    .sort((a, b) => b.cash - a.cash)
    .map(p => ({ username: p.username, cash: p.cash }));
}

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // LOGIN HANDLER
  socket.on('login', (data) => {
    const username = data.username ? data.username.trim() : '';

    if (!username) {
      return socket.emit('loginError', 'Username cannot be empty.');
    }

    if (bannedUsers.has(username.toLowerCase())) {
      return socket.emit('accountBanned', { reason: 'Violation of server rules.' });
    }

    // Default player profile
    players[socket.id] = {
      username: username,
      cash: 0,
      cpc: 1,
      cps: 0,
      tickets: 0,
      equippedSkin: 'Crimson Drake',
      currentRoom: 'Main Global'
    };

    // Join default room
    socket.join('Main Global');

    // Confirm successful login
    socket.emit('loginSuccess', {
      user: players[socket.id],
      currentRoom: 'Main Global'
    });

    // Send initial leaderboard for room
    io.to('Main Global').emit('updateLeaderboard', getRoomLeaderboard('Main Global'));
  });

  // JOIN SERVER ROOM
  socket.on('joinRoom', (data) => {
    const player = players[socket.id];
    if (!player) return;

    const { roomName, passcode } = data;

    // Verify passcode if private
    if (roomPasscodes[roomName] && roomPasscodes[roomName] !== passcode) {
      return socket.emit('roomError', 'Incorrect server passcode!');
    }

    // Leave old room, join new room
    socket.leave(player.currentRoom);
    const oldRoom = player.currentRoom;
    player.currentRoom = roomName;
    socket.join(roomName);

    // Notify new room and update leaderboards
    socket.emit('roomJoined', { roomName });
    io.to(oldRoom).emit('updateLeaderboard', getRoomLeaderboard(oldRoom));
    io.to(roomName).emit('updateLeaderboard', getRoomLeaderboard(roomName));
  });

  // CREATE SERVER ROOM
  socket.on('createRoom', (data) => {
    const { roomName, isPrivate, passcode } = data;
    if (isPrivate && passcode) {
      roomPasscodes[roomName] = passcode;
    }
    // Auto join created room
    socket.emit('roomCreated', { roomName });
  });

  // CLICK EVENT (BROADCASTS TO ENTIRE ROOM)
  socket.on('click', () => {
    const player = players[socket.id];
    if (!player) return;

    const cpc = player.cpc || 1;
    player.cash += cpc;

    const room = player.currentRoom || 'Main Global';

    // Broadcast updated stats & action to everyone in the room
    io.to(room).emit('playerClicked', {
      username: player.username,
      cash: player.cash,
      cpc: cpc
    });

    // Update real-time leaderboard for everyone in the room
    io.to(room).emit('updateLeaderboard', getRoomLeaderboard(room));
  });

  // UPGRADE BUY HANDLER
  socket.on('buyUpgrade', (data) => {
    const player = players[socket.id];
    if (!player) return;

    const { cost, type, value } = data;
    if (player.cash >= cost) {
      player.cash -= cost;
      if (type === 'cpc') player.cpc += value;
      if (type === 'cps') player.cps += value;

      socket.emit('playerUpdated', player);
      io.to(player.currentRoom).emit('updateLeaderboard', getRoomLeaderboard(player.currentRoom));
    }
  });

  // ADMIN COMMANDS
  socket.on('adminAction', (data) => {
    const { action, payload } = data;

    if (action === 'ban') {
      const targetUser = payload.username.toLowerCase();
      bannedUsers.add(targetUser);

      // Disconnect target if online
      for (const [id, p] of Object.entries(players)) {
        if (p.username.toLowerCase() === targetUser) {
          io.to(id).emit('accountBanned', { reason: payload.reason || 'Banned by Administrator.' });
        }
      }
    } else if (action === 'broadcast') {
      io.emit('serverAnnouncement', { message: payload.message });
    } else if (action === 'addCash') {
      const player = players[socket.id];
      if (player) {
        player.cash += payload.amount;
        socket.emit('playerUpdated', player);
        io.to(player.currentRoom).emit('updateLeaderboard', getRoomLeaderboard(player.currentRoom));
      }
    }
  });

  // DISCONNECT HANDLER
  socket.on('disconnect', () => {
    const player = players[socket.id];
    if (player) {
      const room = player.currentRoom;
      delete players[socket.id];
      if (room) {
        io.to(room).emit('updateLeaderboard', getRoomLeaderboard(room));
      }
    }
    console.log(`User disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
