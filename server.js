const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const players = {};
const bannedUsers = new Set();
const roomPasscodes = {};
const createdRooms = new Set(['Main Global']);

function getRoomLeaderboard(roomName) {
  return Object.values(players)
    .filter(p => p.currentRoom === roomName)
    .sort((a, b) => b.cash - a.cash)
    .map(p => ({ username: p.username, cash: p.cash }));
}

function getActiveServers() {
  const roomCounts = {};
  createdRooms.forEach(room => roomCounts[room] = 0);

  Object.values(players).forEach(p => {
    if (p.currentRoom) {
      roomCounts[p.currentRoom] = (roomCounts[p.currentRoom] || 0) + 1;
    }
  });

  return Array.from(createdRooms).map(roomName => ({
    name: roomName,
    isPrivate: !!roomPasscodes[roomName],
    playerCount: roomCounts[roomName] || 0
  }));
}

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // LOGIN
  socket.on('login', (data) => {
    const username = data.username ? data.username.trim() : '';

    if (!username) {
      return socket.emit('loginError', 'Username cannot be empty.');
    }

    if (bannedUsers.has(username.toLowerCase())) {
      return socket.emit('accountBanned', { reason: 'Violation of server rules.' });
    }

    players[socket.id] = {
      username: username,
      cash: 0,
      cpc: 1,
      cps: 0,
      tickets: 0,
      equippedSkin: 'Crimson Drake',
      currentRoom: 'Main Global'
    };

    socket.join('Main Global');

    socket.emit('loginSuccess', {
      user: players[socket.id],
      currentRoom: 'Main Global'
    });

    io.to('Main Global').emit('updateLeaderboard', getRoomLeaderboard('Main Global'));
  });

  // GET SERVERS LIST
  socket.on('getServersList', () => {
    socket.emit('serversList', getActiveServers());
  });

  // JOIN ROOM
  socket.on('joinRoom', (data) => {
    const player = players[socket.id];
    if (!player) return;

    const { roomName, passcode } = data;

    if (roomPasscodes[roomName] && roomPasscodes[roomName] !== passcode) {
      return socket.emit('roomError', 'Incorrect server passcode!');
    }

    socket.leave(player.currentRoom);
    const oldRoom = player.currentRoom;
    player.currentRoom = roomName;
    socket.join(roomName);

    socket.emit('roomJoined', { roomName });
    io.to(oldRoom).emit('updateLeaderboard', getRoomLeaderboard(oldRoom));
    io.to(roomName).emit('updateLeaderboard', getRoomLeaderboard(roomName));
    io.emit('serversList', getActiveServers());
  });

  // CREATE ROOM
  socket.on('createRoom', (data) => {
    const { roomName, isPrivate, passcode } = data;
    if (!roomName) return;

    createdRooms.add(roomName);
    if (isPrivate && passcode) {
      roomPasscodes[roomName] = passcode;
    }
    io.emit('serversList', getActiveServers());
  });

  // CLICK ACTION
  socket.on('click', () => {
    const player = players[socket.id];
    if (!player) return;

    const cpc = player.cpc || 1;
    player.cash += cpc;

    const room = player.currentRoom || 'Main Global';

    io.to(room).emit('playerClicked', {
      username: player.username,
      cash: player.cash,
      cpc: cpc
    });

    io.to(room).emit('updateLeaderboard', getRoomLeaderboard(room));
  });

  // ANTI-CHEAT FLAG EVENT
  socket.on('antiCheatTriggered', (data) => {
    const player = players[socket.id];
    const username = player ? player.username : data.username;
    const room = player ? player.currentRoom : 'Unknown';

    console.log(`[SECURITY] Anti-Cheat Triggered by ${username} (${data.cps} CPS) in ${room}`);

    // Broadcast alert to connected sockets (admin listeners will receive this)
    io.emit('adminAntiCheatAlert', {
      username: username,
      cps: data.cps,
      room: room,
      timestamp: new Date().toLocaleTimeString()
    });
  });

  // ADMIN ACTIONS
  socket.on('adminAction', (data) => {
    const { action, payload } = data;

    if (action === 'ban') {
      const targetUser = payload.username.toLowerCase();
      bannedUsers.add(targetUser);

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

  // DISCONNECT
  socket.on('disconnect', () => {
    const player = players[socket.id];
    if (player) {
      const room = player.currentRoom;
      delete players[socket.id];
      if (room) {
        io.to(room).emit('updateLeaderboard', getRoomLeaderboard(room));
      }
      io.emit('serversList', getActiveServers());
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
