const socket = io();

let currentUser = null;
let currentRoom = 'Main Global';
let myData = { cash: 0, cpc: 1, cps: 0, tickets: 0 };

// LOGIN
function submitLogin() {
  const usernameInput = document.getElementById('username-input');
  const username = usernameInput ? usernameInput.value.trim() : '';

  if (!username) {
    showLoginError('Please enter a valid username!');
    return;
  }

  socket.emit('login', { username });
}

function showLoginError(msg) {
  const errDiv = document.getElementById('login-error');
  if (errDiv) {
    errDiv.innerText = msg;
    errDiv.classList.remove('hidden');
  }
}

// SOCKET LISTENERS - LOGIN
socket.on('loginSuccess', (data) => {
  currentUser = data.user.username;
  currentRoom = data.currentRoom;
  myData = data.user;

  document.getElementById('login-modal').classList.add('hidden');
  document.getElementById('display-user-header').innerText = currentUser;
  document.getElementById('display-server-header').innerText = currentRoom;

  updateUI();
  socket.emit('getServersList');
});

socket.on('loginError', (msg) => {
  showLoginError(msg);
});

socket.on('accountBanned', (data) => {
  document.getElementById('ban-reason-text').innerText = data.reason || 'Rules violation.';
  document.getElementById('banned-modal').classList.remove('hidden');
});

// CLICK ACTION FUNCTION
function triggerClick() {
  if (!currentUser) return;
  socket.emit('click');
}

// DRAGON CLICK ACTION (MOUSE)
const dragonBtn = document.getElementById('click-area');
if (dragonBtn) {
  dragonBtn.addEventListener('click', triggerClick);
}

// SPACEBAR CLICK HANDLER
window.addEventListener('keydown', (e) => {
  // Prevent spacebar clicking if user is typing in an input field
  const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
  if (activeTag === 'input' || activeTag === 'textarea') return;

  if (e.code === 'Space' || e.key === ' ') {
    e.preventDefault(); // Stop page scrolling
    triggerClick();
  }
});

// REALTIME MULTIPLAYER CLICK RECEIVER
socket.on('playerClicked', (data) => {
  if (data.username === currentUser) {
    myData.cash = data.cash;
    updateUI();
  }

  spawnFloatingText(`+$${data.cpc}`, data.username === currentUser ? '#4ade80' : '#f59e0b');
});

// LEADERBOARD UPDATES
socket.on('updateLeaderboard', (leaderboard) => {
  const list = document.getElementById('leaderboard-list');
  if (!list) return;

  list.innerHTML = leaderboard.map((player, idx) => `
    <div class="flex justify-between items-center bg-purple-950/40 p-3 rounded-xl border border-purple-500/20">
      <div class="flex items-center space-x-3">
        <span class="font-black text-amber-400">#${idx + 1}</span>
        <span class="font-bold text-white">${player.username} ${player.username === currentUser ? '(You)' : ''}</span>
      </div>
      <span class="font-mono font-bold text-green-400">$${player.cash.toLocaleString()}</span>
    </div>
  `).join('');
});

// SERVERS LIST DISPLAY
socket.on('serversList', (servers) => {
  const serversListContainer = document.getElementById('servers-list');
  if (!serversListContainer) return;

  if (!servers || servers.length === 0) {
    serversListContainer.innerHTML = `<p class="text-sm text-purple-300 text-center py-4">No servers active. Create one!</p>`;
    return;
  }

  serversListContainer.innerHTML = servers.map(server => `
    <div class="flex justify-between items-center bg-purple-950/40 p-4 rounded-xl border border-purple-500/20">
      <div>
        <div class="font-bold text-white flex items-center space-x-2">
          <span>${server.name}</span>
          ${server.isPrivate ? '<i class="fa-solid fa-lock text-amber-400 text-xs"></i>' : ''}
        </div>
        <div class="text-xs text-purple-300">${server.playerCount} Players online</div>
      </div>
      <button onclick="joinServerRoom('${server.name}', ${server.isPrivate})" class="px-4 py-2 ${server.name === currentRoom ? 'bg-slate-700 text-slate-400' : 'bg-cyan-500 hover:bg-cyan-400 text-slate-950'} font-bold text-xs rounded-xl transition">
        ${server.name === currentRoom ? 'Connected' : 'Join Server'}
      </button>
    </div>
  `).join('');
});

function joinServerRoom(roomName, isPrivate) {
  if (roomName === currentRoom) return;
  
  if (isPrivate) {
    const pass = prompt('Enter Server Passcode:');
    if (!pass) return;
    socket.emit('joinRoom', { roomName, passcode: pass });
  } else {
    socket.emit('joinRoom', { roomName, passcode: '' });
  }
}

socket.on('roomJoined', (data) => {
  currentRoom = data.roomName;
  document.getElementById('display-server-header').innerText = currentRoom;
  socket.emit('getServersList');
});

function toggleCreateServerForm() {
  const panel = document.getElementById('create-server-panel');
  if (panel) panel.classList.toggle('hidden');
}

function togglePasscodeField(type) {
  const passInput = document.getElementById('new-server-passcode');
  if (!passInput) return;
  if (type === 'private') {
    passInput.disabled = false;
    passInput.classList.remove('opacity-50');
  } else {
    passInput.disabled = true;
    passInput.classList.add('opacity-50');
  }
}

function createNewServer() {
  const nameInput = document.getElementById('new-server-name');
  const typeSelect = document.getElementById('new-server-type');
  const passInput = document.getElementById('new-server-passcode');

  const roomName = nameInput ? nameInput.value.trim() : '';
  const isPrivate = typeSelect ? typeSelect.value === 'private' : false;
  const passcode = passInput ? passInput.value : '';

  if (!roomName) return alert('Enter a server name!');

  socket.emit('createRoom', { roomName, isPrivate, passcode });
  joinServerRoom(roomName, isPrivate);
  toggleCreateServerForm();
}

// FLOATING TEXT ANIMATION
function spawnFloatingText(text, color) {
  const container = document.getElementById('click-area');
  if (!container) return;

  const el = document.createElement('div');
  el.className = 'floating-text';
  el.style.color = color;
  el.style.left = `${Math.random() * 60 + 20}%`;
  el.style.top = `${Math.random() * 40 + 30}%`;
  el.innerText = text;

  container.appendChild(el);
  setTimeout(() => el.remove(), 900);
}

// UI SYNC
function updateUI() {
  document.getElementById('game-cash').innerText = `$${myData.cash.toLocaleString()}`;
  document.getElementById('game-cpc').innerText = `$${myData.cpc.toLocaleString()}`;
  document.getElementById('game-cps').innerText = `$${myData.cps.toLocaleString()}`;
  if (document.getElementById('shop-cash')) {
    document.getElementById('shop-cash').innerText = `$${myData.cash.toLocaleString()}`;
  }
}

// NAVIGATION TABS
function switchTab(tabName) {
  const screens = ['game', 'servers', 'shop', 'ascension', 'leaderboard'];
  screens.forEach(s => {
    const el = document.getElementById(`screen-${s}`);
    if (el) el.classList.add('hidden');
  });

  const targetScreen = document.getElementById(`screen-${tabName}`);
  if (targetScreen) targetScreen.classList.remove('hidden');

  if (tabName === 'servers') {
    socket.emit('getServersList');
  }
}

// ADMIN MODAL LOGIC
function openAdminModal() {
  document.getElementById('admin-modal').classList.remove('hidden');
}

function closeAdminModal() {
  document.getElementById('admin-modal').classList.add('hidden');
}

function verifyAdminPasscode() {
  const pass = document.getElementById('admin-passcode-input').value;
  if (pass === '6021') {
    document.getElementById('admin-passcode-view').classList.add('hidden');
    document.getElementById('admin-tools-view').classList.remove('hidden');
  } else {
    alert('Incorrect Admin Passcode!');
  }
}

function adminBanUser() {
  const username = document.getElementById('admin-ban-username').value;
  const reason = document.getElementById('admin-ban-reason').value;
  socket.emit('adminAction', { action: 'ban', payload: { username, reason } });
}

function adminSendAnnouncement() {
  const msg = document.getElementById('admin-announcement-input').value;
  socket.emit('adminAction', { action: 'broadcast', payload: { message: msg } });
}

function adminAddCash(amount) {
  socket.emit('adminAction', { action: 'addCash', payload: { amount } });
}

socket.on('serverAnnouncement', (data) => {
  document.getElementById('announcement-text').innerText = data.message;
  document.getElementById('announcement-modal').classList.remove('hidden');
});

function closeAnnouncementModal() {
  document.getElementById('announcement-modal').classList.add('hidden');
}

function logoutAccount() {
  location.reload();
}
