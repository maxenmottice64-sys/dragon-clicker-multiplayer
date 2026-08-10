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
});

socket.on('loginError', (msg) => {
  showLoginError(msg);
});

socket.on('accountBanned', (data) => {
  document.getElementById('ban-reason-text').innerText = data.reason || 'Rules violation.';
  document.getElementById('banned-modal').classList.remove('hidden');
});

// DRAGON CLICK ACTION
const dragonBtn = document.getElementById('click-area');
if (dragonBtn) {
  dragonBtn.addEventListener('click', () => {
    socket.emit('click');
  });
}

// REALTIME MULTIPLAYER CLICK RECEIVER
socket.on('playerClicked', (data) => {
  // Update local client's cash display if it's us
  if (data.username === currentUser) {
    myData.cash = data.cash;
    updateUI();
  }

  // Floating text popups for clicks in the room
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
  if (pass === '6021') { // Default admin passcode
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
