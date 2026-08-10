const socket = io();

let currentAccountUsername = localStorage.getItem('dragon_clicker_username') || '';
let currentServerId = 'public_global';
let pendingTargetServerId = null;

let clickTimestamps = [];
let isAntiCheatTriggered = false;

function checkAntiCheat() {
  if (isAntiCheatTriggered) return true;
  const now = Date.now();
  clickTimestamps.push(now);
  clickTimestamps = clickTimestamps.filter(t => now - t < 1000);
  
  if (clickTimestamps.length >= 30) {
    isAntiCheatTriggered = true;
    document.getElementById('anticheat-screen').classList.remove('hidden');
    socket.emit('cheaterDetected', { username: currentAccountUsername, cps: clickTimestamps.length });
    return true;
  }
  return false;
}

let latestState = { cash: 0, cpc: 1, goldenTickets: 0, activeSkinLevel: 1, cpcUpgradesCount: {}, cpsUpgradesCount: {} };

function submitLogin() {
  const inputEl = document.getElementById('username-input');
  const input = inputEl ? inputEl.value.trim() : '';
  if (!input) return;
  socket.emit('userLogin', { username: input });
}

if (currentAccountUsername) {
  socket.emit('userLogin', { username: currentAccountUsername });
}

function logoutAccount() {
  localStorage.removeItem('dragon_clicker_username');
  location.reload();
}

// DRAGON CLICK
const dragonBtn = document.getElementById('dragon-button');

function triggerClick(e) {
  if (checkAntiCheat()) return;
  socket.emit('playerClick');
}

dragonBtn.addEventListener('click', (e) => {
  triggerClick(e);
  if (e) createFloatingText(e.clientX, e.clientY, latestState.cpc || 1);
});

// CO-OP CLICK BROADCAST VISUAL
socket.on('coopClick', (data) => {
  const rect = dragonBtn.getBoundingClientRect();
  const randomX = rect.left + Math.random() * rect.width;
  const randomY = rect.top + Math.random() * rect.height;
  createCoopFloatingText(randomX, randomY, data.username, data.amount);
});

function createCoopFloatingText(x, y, username, amount) {
  const floatEl = document.createElement('div');
  floatEl.className = 'floating-text text-amber-300 text-sm font-black font-mono';
  floatEl.style.left = `${x}px`;
  floatEl.style.top = `${y}px`;
  floatEl.textContent = `${username}: +$${Math.floor(amount).toLocaleString()}`;
  document.body.appendChild(floatEl);
  setTimeout(() => floatEl.remove(), 900);
}

function createFloatingText(x, y, amount) {
  const floatEl = document.createElement('div');
  floatEl.className = 'floating-text text-amber-300 text-2xl font-black font-mono';
  floatEl.style.left = `${x}px`;
  floatEl.style.top = `${y}px`;
  floatEl.textContent = `+$${Math.floor(amount).toLocaleString()}`;
  document.body.appendChild(floatEl);
  setTimeout(() => floatEl.remove(), 900);
}

// SERVERS FUNCTIONALITY
function toggleCreateServerForm() {
  const panel = document.getElementById('create-server-panel');
  panel.classList.toggle('hidden');
}

function togglePasscodeField(type) {
  const passInput = document.getElementById('new-server-passcode');
  if (type === 'private') {
    passInput.disabled = false;
    passInput.classList.remove('opacity-50');
  } else {
    passInput.disabled = true;
    passInput.classList.add('opacity-50');
    passInput.value = '';
  }
}

function createNewServer() {
  const name = document.getElementById('new-server-name').value;
  const type = document.getElementById('new-server-type').value;
  const passcode = document.getElementById('new-server-passcode').value;

  if (!name.trim()) return alert('Please enter a server name!');

  socket.emit('createRoom', {
    name: name,
    isPrivate: type === 'private',
    passcode: passcode
  });

  document.getElementById('new-server-name').value = '';
  document.getElementById('new-server-passcode').value = '';
  toggleCreateServerForm();
}

function requestJoinServer(roomId, isPrivate) {
  if (isPrivate) {
    pendingTargetServerId = roomId;
    document.getElementById('passcode-modal').classList.remove('hidden');
  } else {
    socket.emit('joinRoom', { roomId: roomId });
  }
}

function closePasscodeModal() {
  document.getElementById('passcode-modal').classList.add('hidden');
  pendingTargetServerId = null;
}

function confirmJoinPrivateServer() {
  const passcode = document.getElementById('server-passcode-input').value;
  if (!passcode) return alert('Enter passcode!');

  socket.emit('joinRoom', {
    roomId: pendingTargetServerId,
    passcode: passcode
  });

  document.getElementById('server-passcode-input').value = '';
  closePasscodeModal();
}

socket.on('updateRoomList', (rooms) => {
  const container = document.getElementById('servers-list');
  if (!container) return;
  container.innerHTML = '';

  rooms.forEach(room => {
    const isCurrent = room.id === currentServerId;
    const el = document.createElement('div');
    el.className = `glass-panel p-4 rounded-2xl flex items-center justify-between border ${isCurrent ? 'border-green-500/50 bg-green-500/10' : 'border-purple-500/20'}`;
    el.innerHTML = `
      <div class="flex items-center space-x-3">
        <div class="p-2.5 rounded-xl ${room.isPrivate ? 'bg-amber-950 text-amber-400' : 'bg-cyan-950 text-cyan-400'}">
          <i class="fa-solid ${room.isPrivate ? 'fa-lock' : 'fa-earth-americas'}"></i>
        </div>
        <div>
          <div class="font-bold text-sm text-white">${room.name}</div>
          <div class="text-xs text-purple-300">${room.playerCount} Players online</div>
        </div>
      </div>
      <button onclick="requestJoinServer('${room.id}', ${room.isPrivate})" ${isCurrent ? 'disabled' : ''} class="px-4 py-2 text-xs font-bold rounded-xl ${isCurrent ? 'bg-green-600 text-white cursor-default' : 'bg-cyan-500 text-slate-950 hover:bg-cyan-400'}">
        ${isCurrent ? 'Connected' : 'Join Server'}
      </button>
    `;
    container.appendChild(el);
  });
});

socket.on('roomJoined', (data) => {
  currentServerId = data.roomId;
  document.getElementById('display-server-header').textContent = data.roomName;
  switchTab('game');
});

socket.on('roomError', (msg) => alert(msg));

// SOCKET UI UPDATES & LEADERBOARD
socket.on('loginSuccess', (data) => {
  currentAccountUsername = data.username;
  localStorage.setItem('dragon_clicker_username', data.username);
  document.getElementById('login-modal').classList.add('hidden');
  document.getElementById('display-user-header').textContent = data.username;
  latestState = data.state;
  updateUI(data.state);
});

socket.on('updateLeaderboard', (leaderboard) => {
  const container = document.getElementById('leaderboard-list');
  if (!container) return;
  container.innerHTML = '';

  leaderboard.forEach((player, idx) => {
    const isMe = player.username.toLowerCase() === currentAccountUsername.toLowerCase();
    const el = document.createElement('div');
    el.className = `glass-panel p-4 rounded-2xl flex items-center justify-between border ${isMe ? 'border-amber-400 bg-amber-500/20' : 'border-purple-500/20'}`;
    el.innerHTML = `
      <div class="flex items-center space-x-4">
        <span class="font-bold font-mono text-amber-400">#${idx + 1}</span>
        <div class="font-bold text-sm text-white">${player.username} ${isMe ? '(YOU)' : ''}</div>
      </div>
      <div class="font-mono font-bold text-amber-400">$${Math.floor(player.cash).toLocaleString()}</div>
    `;
    container.appendChild(el);
  });
});

socket.on('syncState', (state) => updateUI(state));

function updateUI(state) {
  latestState = state;
  document.getElementById('game-cash').textContent = '$' + Math.floor(state.cash).toLocaleString();
  document.getElementById('game-cpc').textContent = '$' + Math.floor(state.cpc).toLocaleString();
  document.getElementById('game-cps').textContent = '$' + Math.floor(state.cps).toLocaleString();
}

function switchTab(tabId) {
  ['game', 'servers', 'shop', 'ascension', 'leaderboard'].forEach(t => {
    document.getElementById(`screen-${t}`).classList.add('hidden');
  });
  document.getElementById(`screen-${tabId}`).classList.remove('hidden');
  if (tabId === 'servers') socket.emit('getRooms');
}
