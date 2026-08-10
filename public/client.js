const socket = io();

let currentAccountUsername = localStorage.getItem('dragon_clicker_username') || '';
let currentServerId = 'public_global';
let pendingTargetServerId = null;
let isAdminAuthenticated = false;

// Anti-cheat variables
let clickTimestamps = [];
let isAntiCheatTriggered = false;

function checkAntiCheat() {
  if (isAntiCheatTriggered) return true;
  const now = Date.now();
  clickTimestamps.push(now);
  clickTimestamps = clickTimestamps.filter(t => now - t < 1000);
  
  // Triggered at 30 CPS or higher
  if (clickTimestamps.length >= 30) {
    isAntiCheatTriggered = true;
    document.getElementById('anticheat-screen').classList.remove('hidden');
    
    // Notify server of cheater detection
    socket.emit('cheaterDetected', {
      username: currentAccountUsername,
      cps: clickTimestamps.length
    });
    return true;
  }
  return false;
}

let latestState = { 
  cash: 0, 
  cpc: 1, 
  cps: 0,
  goldenTickets: 0, 
  activeSkinLevel: 1, 
  activeSkinIcon: '🐉',
  activeSkinName: 'Crimson Drake',
  cpcUpgradesCount: {}, 
  cpsUpgradesCount: {} 
};

// 52 CPC UPGRADES
const CPC_UPGRADES = Array.from({ length: 52 }, (_, i) => {
  const level = i + 1;
  const icons = ['🗡️', '⚔️', '🪓', '🔨', '🏹', '🔱', '🛡️', '⚡', '🔥', '🔮'];
  return {
    id: `cpc_${level}`,
    name: `Click Blade Lv.${level}`,
    icon: icons[i % icons.length],
    baseCost: Math.floor(15 * Math.pow(1.3, i)),
    cpcAdd: Math.floor(1 * Math.pow(1.25, i)),
    desc: `+${Math.floor(1 * Math.pow(1.25, i))} Cash per click`
  };
});

// 52 CPS UPGRADES
const CPS_UPGRADES = Array.from({ length: 52 }, (_, i) => {
  const level = i + 1;
  const icons = ['🥚', '🐉', '🌋', '🏰', '💎', '🪐', '🌌', '👑', '☀️', '🌟'];
  return {
    id: `cps_${level}`,
    name: `Dragon Nest Lv.${level}`,
    icon: icons[i % icons.length],
    baseCost: Math.floor(50 * Math.pow(1.35, i)),
    cpsAdd: Math.floor(2 * Math.pow(1.3, i)),
    desc: `+${Math.floor(2 * Math.pow(1.3, i))} Cash per second`
  };
});

// 52 DRAGON SKINS
const DRAGON_SKINS = Array.from({ length: 52 }, (_, i) => {
  const level = i + 1;
  const skinIcons = ['🐉', '🐲', '🦖', '🐍', '🐊', '蜥', '🔥', '⚡', '❄️', '✨', '👑', '☠️'];
  const boostPercent = level * 10;
  return {
    id: `skin_${level}`,
    level: level,
    name: level === 1 ? 'Crimson Drake' : `Realm Dragon #${level}`,
    icon: skinIcons[i % skinIcons.length],
    ticketReq: i * 5,
    boost: boostPercent
  };
});

// SUBMIT LOGIN FUNCTION
function submitLogin() {
  const inputEl = document.getElementById('username-input');
  const input = inputEl ? inputEl.value.trim() : '';
  const errEl = document.getElementById('login-error');

  if (!input) {
    if (errEl) {
      errEl.textContent = 'Please enter a username!';
      errEl.classList.remove('hidden');
    }
    return;
  }

  socket.emit('userLogin', { username: input });
}

// AUTO LOGIN IF USERNAME SAVED
if (currentAccountUsername) {
  socket.emit('userLogin', { username: currentAccountUsername });
}

function logoutAccount() {
  localStorage.removeItem('dragon_clicker_username');
  location.reload();
}

// CLICKING LOGIC
const dragonBtn = document.getElementById('dragon-button');

function triggerClick(x, y) {
  if (checkAntiCheat()) return;
  socket.emit('playerClick');
  
  const ticketMultiplier = 1 + ((latestState.goldenTickets || 0) * 0.10);
  const skinMultiplier = 1 + ((latestState.activeSkinLevel || 1) * 0.10);
  const earnedPerClick = (latestState.cpc || 1) * ticketMultiplier * skinMultiplier;

  if (x !== undefined && y !== undefined) {
    createFloatingText(x, y, earnedPerClick);
  }
}

if (dragonBtn) {
  dragonBtn.addEventListener('click', (e) => {
    triggerClick(e.clientX, e.clientY);
  });
}

// SPACEBAR LISTENER
window.addEventListener('keydown', (e) => {
  const activeElement = document.activeElement;
  const isTyping = activeElement.tagName === 'INPUT' || 
                   activeElement.tagName === 'TEXTAREA' || 
                   activeElement.isContentEditable;

  if (e.code === 'Space' && !isTyping) {
    e.preventDefault(); // Stop page scrolling
    
    if (dragonBtn) {
      const rect = dragonBtn.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      triggerClick(centerX, centerY);
    } else {
      triggerClick();
    }
  }
});

// CO-OP CLICK VISUAL BROADCAST FROM OTHER PLAYERS
socket.on('coopClick', (data) => {
  if (!dragonBtn) return;
  // Don't duplicate text for own clicks
  if (data.username.toLowerCase() === currentAccountUsername.toLowerCase()) return;

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

// SERVERS & ROOMS MANAGEMENT
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
    passInput.value = '';
  }
}

function createNewServer() {
  const nameEl = document.getElementById('new-server-name');
  const typeEl = document.getElementById('new-server-type');
  const passcodeEl = document.getElementById('new-server-passcode');

  const name = nameEl ? nameEl.value : '';
  const type = typeEl ? typeEl.value : 'public';
  const passcode = passcodeEl ? passcodeEl.value : '';

  if (!name.trim()) return alert('Please enter a server name!');

  socket.emit('createRoom', {
    name: name,
    isPrivate: type === 'private',
    passcode: passcode
  });

  if (nameEl) nameEl.value = '';
  if (passcodeEl) passcodeEl.value = '';
  toggleCreateServerForm();
}

function requestJoinServer(roomId, isPrivate) {
  if (isPrivate) {
    pendingTargetServerId = roomId;
    const modal = document.getElementById('passcode-modal');
    if (modal) modal.classList.remove('hidden');
  } else {
    socket.emit('joinRoom', { roomId: roomId });
  }
}

function closePasscodeModal() {
  const modal = document.getElementById('passcode-modal');
  if (modal) modal.classList.add('hidden');
  pendingTargetServerId = null;
}

function confirmJoinPrivateServer() {
  const passcodeEl = document.getElementById('server-passcode-input');
  const passcode = passcodeEl ? passcodeEl.value : '';
  if (!passcode) return alert('Enter passcode!');

  socket.emit('joinRoom', {
    roomId: pendingTargetServerId,
    passcode: passcode
  });

  if (passcodeEl) passcodeEl.value = '';
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
  const headerEl = document.getElementById('display-server-header');
  if (headerEl) headerEl.textContent = data.roomName;
  switchTab('game');
});

socket.on('roomError', (msg) => alert(msg));

// RENDER UPGRADES AND SKINS
function renderDynamicContent() {
  const cpcContainer = document.getElementById('cpc-upgrades-list');
  const cpsContainer = document.getElementById('cps-upgrades-list');
  const skinsContainer = document.getElementById('skins-grid');

  if (cpcContainer) {
    cpcContainer.innerHTML = '';
    CPC_UPGRADES.forEach(item => {
      const owned = (latestState.cpcUpgradesCount && latestState.cpcUpgradesCount[item.id]) || 0;
      const currentCost = Math.floor(item.baseCost * Math.pow(1.15, owned));
      const btn = document.createElement('div');
      btn.className = 'glass-panel p-3 rounded-xl flex items-center justify-between border border-purple-500/20';
      btn.innerHTML = `
        <div class="flex items-center space-x-3">
          <span class="text-2xl">${item.icon}</span>
          <div>
            <div class="font-bold text-sm text-green-300">${item.name} <span class="text-xs text-purple-300">(${owned})</span></div>
            <div class="text-xs text-purple-200">${item.desc}</div>
          </div>
        </div>
        <button onclick="buyUpgrade('${item.id}', 'cpc', ${currentCost}, ${item.cpcAdd})" class="px-3 py-1.5 bg-purple-700 hover:bg-purple-600 font-bold text-xs rounded-lg text-amber-300 font-mono">
          $${currentCost.toLocaleString()}
        </button>
      `;
      cpcContainer.appendChild(btn);
    });
  }

  if (cpsContainer) {
    cpsContainer.innerHTML = '';
    CPS_UPGRADES.forEach(item => {
      const owned = (latestState.cpsUpgradesCount && latestState.cpsUpgradesCount[item.id]) || 0;
      const currentCost = Math.floor(item.baseCost * Math.pow(1.15, owned));
      const btn = document.createElement('div');
      btn.className = 'glass-panel p-3 rounded-xl flex items-center justify-between border border-purple-500/20';
      btn.innerHTML = `
        <div class="flex items-center space-x-3">
          <span class="text-2xl">${item.icon}</span>
          <div>
            <div class="font-bold text-sm text-cyan-300">${item.name} <span class="text-xs text-purple-300">(${owned})</span></div>
            <div class="text-xs text-purple-200">${item.desc}</div>
          </div>
        </div>
        <button onclick="buyUpgrade('${item.id}', 'cps', ${currentCost}, ${item.cpsAdd})" class="px-3 py-1.5 bg-purple-700 hover:bg-purple-600 font-bold text-xs rounded-lg text-amber-300 font-mono">
          $${currentCost.toLocaleString()}
        </button>
      `;
      cpsContainer.appendChild(btn);
    });
  }

  if (skinsContainer) {
    skinsContainer.innerHTML = '';
    DRAGON_SKINS.forEach(skin => {
      const isUnlocked = (latestState.goldenTickets || 0) >= skin.ticketReq;
      const isEquipped = latestState.activeSkinName === skin.name;

      const btn = document.createElement('div');
      btn.className = `p-4 rounded-2xl text-center border transition ${isEquipped ? 'bg-amber-500/30 border-amber-400' : isUnlocked ? 'bg-amber-950/40 border-amber-500/30' : 'bg-slate-900/40 border-slate-700 opacity-60'}`;
      btn.innerHTML = `
        <div class="text-4xl mb-1">${skin.icon}</div>
        <div class="text-xs font-bold text-amber-200">${skin.name}</div>
        <div class="text-[11px] font-bold text-green-400 mt-1">+${skin.boost}% Boost</div>
        <div class="text-[10px] text-purple-300 mb-2">Req: 🎫 ${skin.ticketReq}</div>
        <button onclick="equipSkin('${skin.icon}', '${skin.name}', ${skin.level})" ${!isUnlocked ? 'disabled' : ''} class="w-full py-1 text-xs font-bold rounded-lg ${isEquipped ? 'bg-green-600 text-white cursor-default' : isUnlocked ? 'bg-amber-500 text-slate-950 hover:bg-amber-400' : 'bg-slate-800 text-slate-500 cursor-not-allowed'}">
          ${isEquipped ? 'Equipped' : isUnlocked ? 'Equip' : 'Locked'}
        </button>
      `;
      skinsContainer.appendChild(btn);
    });
  }
}

// LOGIN & BANNED RESPONSE HANDLERS
socket.on('loginSuccess', (data) => {
  currentAccountUsername = data.username;
  localStorage.setItem('dragon_clicker_username', data.username);
  
  const modal = document.getElementById('login-modal');
  if (modal) modal.classList.add('hidden');
  
  const headerUser = document.getElementById('display-user-header');
  if (headerUser) headerUser.textContent = data.username;

  latestState = data.state;
  updateUI(data.state);
});

socket.on('loginError', (msg) => {
  const errEl = document.getElementById('login-error');
  if (errEl) {
    errEl.textContent = msg;
    errEl.classList.remove('hidden');
  }
});

socket.on('userBanned', (data) => {
  const loginModal = document.getElementById('login-modal');
  if (loginModal) loginModal.classList.add('hidden');
  
  const banReasonText = document.getElementById('ban-reason-text');
  if (banReasonText) banReasonText.textContent = data.reason || 'Violation of server rules.';
  
  const banModal = document.getElementById('banned-modal');
  if (banModal) banModal.classList.remove('hidden');
});

function updateUI(state) {
  latestState = state;

  const cashElements = ['game-cash', 'shop-cash'];
  cashElements.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = '$' + Math.floor(state.cash).toLocaleString();
  });

  const cpcEl = document.getElementById('game-cpc');
  if (cpcEl) cpcEl.textContent = '$' + Math.floor(state.cpc).toLocaleString();

  const cpsEl = document.getElementById('game-cps');
  if (cpsEl) cpsEl.textContent = '$' + Math.floor(state.cps).toLocaleString();

  const ticketsElements = ['game-tickets', 'ascension-tickets'];
  ticketsElements.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = '🎫 ' + (state.goldenTickets || 0).toLocaleString();
  });

  const boostPctEl = document.getElementById('ticket-boost-pct');
  if (boostPctEl) boostPctEl.textContent = ((state.goldenTickets || 0) * 10).toString();

  const dragonBtn = document.getElementById('dragon-button');
  if (dragonBtn) dragonBtn.textContent = state.activeSkinIcon;

  const eqIcon = document.getElementById('equipped-skin-icon');
  if (eqIcon) eqIcon.textContent = state.activeSkinIcon;

  const eqName = document.getElementById('equipped-skin-name');
  if (eqName) eqName.textContent = state.activeSkinName;
  
  const currentSkinLevel = state.activeSkinLevel || 1;
  const eqBoost = document.getElementById('equipped-skin-boost');
  if (eqBoost) eqBoost.textContent = `+${currentSkinLevel * 10}% Boost`;

  const pendingTickets = document.getElementById('pending-tickets');
  if (pendingTickets) {
    const pending = Math.floor(Math.sqrt(state.cash / 100000));
    pendingTickets.textContent = `+${pending} 🎫`;
  }

  renderDynamicContent();
}

// SOCKET LEADERBOARD HANDLER
socket.on('updateLeaderboard', (leaderboard) => {
  const container = document.getElementById('leaderboard-list');
  if (!container) return;

  container.innerHTML = '';
  if (!leaderboard || leaderboard.length === 0) {
    container.innerHTML = `<div class="text-center text-xs text-purple-300">No players registered in this server yet.</div>`;
    return;
  }

  leaderboard.forEach((player, idx) => {
    const isMe = player.username.toLowerCase() === currentAccountUsername.toLowerCase();
    const rankColors = ['text-yellow-400', 'text-slate-300', 'text-amber-600'];
    const rankBadges = ['🥇', '🥈', '🥉'];

    const el = document.createElement('div');
    el.className = `glass-panel p-4 rounded-2xl flex items-center justify-between border ${isMe ? 'border-amber-400 bg-amber-500/20' : 'border-purple-500/20'}`;
    el.innerHTML = `
      <div class="flex items-center space-x-4">
        <span class="text-lg font-black font-mono ${rankColors[idx] || 'text-purple-400'} w-8">
          ${rankBadges[idx] || `#${idx + 1}`}
        </span>
        <div>
          <div class="font-bold text-sm text-white ${isMe ? 'text-amber-300 font-black' : ''}">
            ${player.username} ${isMe ? '<span class="text-[10px] bg-amber-500 text-slate-950 px-1.5 py-0.5 rounded ml-1">YOU</span>' : ''}
          </div>
          <div class="text-xs text-purple-300">🎫 ${(player.goldenTickets || 0).toLocaleString()} Golden Tickets</div>
        </div>
      </div>
      <div class="text-right font-mono font-bold text-amber-400 text-base">
        $${Math.floor(player.cash).toLocaleString()}
      </div>
    `;
    container.appendChild(el);
  });
});

// CHEATER ALERT FOR ADMINS
socket.on('adminCheaterAlert', (data) => {
  if (isAdminAuthenticated) {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(data.username).catch(() => {});
    }

    const banInput = document.getElementById('admin-ban-username');
    if (banInput) banInput.value = data.username;

    alert(`🚨 CHEATER DETECTED!\nPlayer: ${data.username}\nCPS: ${data.cps}\n\nTheir username has been copied to your clipboard & pasted into the ban field!`);
  }
});

socket.on('syncState', (state) => updateUI(state));

socket.on('serverNotification', (msg) => alert(msg));

socket.on('serverAnnouncement', (msg) => {
  const textEl = document.getElementById('announcement-text');
  const modal = document.getElementById('announcement-modal');
  if (textEl) textEl.textContent = msg;
  if (modal) modal.classList.remove('hidden');
});

function closeAnnouncementModal() {
  const modal = document.getElementById('announcement-modal');
  if (modal) modal.classList.add('hidden');
}

function buyUpgrade(id, type, cost, addValue) {
  socket.emit('buyUpgrade', { id, type, cost, addValue });
}

function equipSkin(icon, name, level) {
  socket.emit('equipSkin', { icon, name, level });
}

function performAscension() {
  socket.emit('performAscension');
}

function switchTab(tabId) {
  const screens = ['game', 'servers', 'shop', 'ascension', 'leaderboard'];
  screens.forEach(s => {
    const el = document.getElementById(`screen-${s}`);
    if (el) el.classList.add('hidden');
  });

  const activeScreen = document.getElementById(`screen-${tabId}`);
  if (activeScreen) activeScreen.classList.remove('hidden');

  if (tabId === 'servers') {
    socket.emit('getRooms');
  }
}

// ADMIN CONTROLS
function openAdminModal() { 
  const modal = document.getElementById('admin-modal');
  if (modal) modal.classList.remove('hidden'); 
}

function closeAdminModal() { 
  const modal = document.getElementById('admin-modal');
  if (modal) modal.classList.add('hidden'); 
}

function verifyAdminPasscode() {
  const codeEl = document.getElementById('admin-passcode-input');
  const code = codeEl ? codeEl.value : '';
  if (code === '6021') {
    isAdminAuthenticated = true;
    const passView = document.getElementById('admin-passcode-view');
    const toolsView = document.getElementById('admin-tools-view');
    if (passView) passView.classList.add('hidden');
    if (toolsView) toolsView.classList.remove('hidden');
  } else {
    alert('Incorrect Admin Passcode!');
  }
}

function adminBanUser() {
  const userEl = document.getElementById('admin-ban-username');
  const reasonEl = document.getElementById('admin-ban-reason');
  const targetUsername = userEl ? userEl.value : '';
  const reason = reasonEl ? reasonEl.value : '';

  if (targetUsername.trim().length > 0) {
    socket.emit('adminBanUser', { targetUsername, reason });
    if (userEl) userEl.value = '';
    if (reasonEl) reasonEl.value = '';
  } else {
    alert('Please enter a username to ban.');
  }
}

function adminSendAnnouncement() {
  const input = document.getElementById('admin-announcement-input');
  const message = input ? input.value : '';
  if (message.trim().length > 0) {
    socket.emit('adminSendAnnouncement', message);
    if (input) input.value = '';
  }
}

function adminResetAllCash() { socket.emit('adminModifyState', { resetAllCash: true }); }
function adminAddCash(amount) { socket.emit('adminModifyState', { addCash: amount }); }
function adminAddCPS(amount) { socket.emit('adminModifyState', { addCPS: amount }); }
function adminAddCPC(amount) { socket.emit('adminModifyState', { addCPC: amount }); }
function adminAddTickets(amount) { socket.emit('adminModifyState', { addTickets: amount }); }
