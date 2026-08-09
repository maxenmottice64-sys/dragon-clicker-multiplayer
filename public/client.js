const socket = io();

let currentAccountUsername = localStorage.getItem('dragon_clicker_username') || '';
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

let latestState = { cash: 0, cpc: 1, goldenTickets: 0, activeSkinLevel: 1, cpcUpgradesCount: {}, cpsUpgradesCount: {} };

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
    icon: skinIcons[(i) % skinIcons.length],
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

function renderDynamicContent() {
  const cpcContainer = document.getElementById('cpc-upgrades-list');
  const cpsContainer = document.getElementById('cps-upgrades-list');
  const skinsContainer = document.getElementById('skins-grid');

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

// Interaction Listeners
const dragonBtn = document.getElementById('dragon-button');

function triggerClick(e) {
  if (checkAntiCheat()) return;
  socket.emit('playerClick');
  
  const ticketMultiplier = 1 + ((latestState.goldenTickets || 0) * 0.10);
  const skinMultiplier = 1 + ((latestState.activeSkinLevel || 1) * 0.10);
  const earnedPerClick = (latestState.cpc || 1) * ticketMultiplier * skinMultiplier;

  if (e) createFloatingText(e.clientX, e.clientY, earnedPerClick);
}

dragonBtn.addEventListener('click', (e) => triggerClick(e));

window.addEventListener('keydown', (e) => {
  const activeElement = document.activeElement;
  const isTyping = activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA';

  if (e.code === 'Space' && !isTyping) {
    e.preventDefault();
    const rect = dragonBtn.getBoundingClientRect();
    triggerClick({ clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 });
  }
});

// LOGIN RESPONSE HANDLERS
socket.on('loginSuccess', (data) => {
  currentAccountUsername = data.username;
  localStorage.setItem('dragon_clicker_username', data.username);
  
  document.getElementById('login-modal').classList.add('hidden');
  document.getElementById('display-user-header').textContent = data.username;

  latestState = data.state;
  updateUI(data.state);
});

socket.on('loginError', (msg) => {
  const errEl = document.getElementById('login-error');
  errEl.textContent = msg;
  errEl.classList.remove('hidden');
});

socket.on('userBanned', (data) => {
  document.getElementById('login-modal').classList.add('hidden');
  document.getElementById('ban-reason-text').textContent = data.reason || 'Violation of server rules.';
  document.getElementById('banned-modal').classList.remove('hidden');
});

function updateUI(state) {
  latestState = state;
  document.getElementById('game-cash').textContent = '$' + Math.floor(state.cash).toLocaleString();
  document.getElementById('shop-cash').textContent = '$' + Math.floor(state.cash).toLocaleString();
  document.getElementById('game-cpc').textContent = '$' + Math.floor(state.cpc).toLocaleString();
  document.getElementById('game-cps').textContent = '$' + Math.floor(state.cps).toLocaleString();
  document.getElementById('game-tickets').textContent = '🎫 ' + state.goldenTickets.toLocaleString();
  document.getElementById('ascension-tickets').textContent = '🎫 ' + state.goldenTickets.toLocaleString();
  document.getElementById('ticket-boost-pct').textContent = (state.goldenTickets * 10).toString();

  document.getElementById('dragon-button').textContent = state.activeSkinIcon;
  document.getElementById('equipped-skin-icon').textContent = state.activeSkinIcon;
  document.getElementById('equipped-skin-name').textContent = state.activeSkinName;
  
  const currentSkinLevel = state.activeSkinLevel || 1;
  document.getElementById('equipped-skin-boost').textContent = `+${currentSkinLevel * 10}% Boost`;

  const pending = Math.floor(Math.sqrt(state.cash / 100000));
  document.getElementById('pending-tickets').textContent = `+${pending} 🎫`;

  renderDynamicContent();
}

// SOCKET LEADERBOARD HANDLER
socket.on('updateLeaderboard', (leaderboard) => {
  const container = document.getElementById('leaderboard-list');
  if (!container) return;

  container.innerHTML = '';
  if (leaderboard.length === 0) {
    container.innerHTML = `<div class="text-center text-xs text-purple-300">No players registered yet.</div>`;
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
          <div class="text-xs text-purple-300">🎫 ${player.goldenTickets.toLocaleString()} Golden Tickets</div>
        </div>
      </div>
      <div class="text-right font-mono font-bold text-amber-400 text-base">
        $${Math.floor(player.cash).toLocaleString()}
      </div>
    `;
    container.appendChild(el);
  });
});

// SOCKET CHEATER ALERT FOR ADMINS
socket.on('adminCheaterAlert', (data) => {
  if (isAdminAuthenticated) {
    // Automatically copy username to admin clipboard
    if (navigator.clipboard) {
      navigator.clipboard.writeText(data.username).catch(() => {});
    }

    // Populate ban input with cheater username
    const banInput = document.getElementById('admin-ban-username');
    if (banInput) banInput.value = data.username;

    // Show popup
    alert(`🚨 CHEATER DETECTED!\nPlayer: ${data.username}\nCPS: ${data.cps}\n\nTheir username has been copied to your clipboard & pasted into the ban field!`);
  }
});

socket.on('syncState', (state) => {
  updateUI(state);
});

socket.on('serverNotification', (msg) => {
  alert(msg);
});

socket.on('serverAnnouncement', (msg) => {
  document.getElementById('announcement-text').textContent = msg;
  document.getElementById('announcement-modal').classList.remove('hidden');
});

function closeAnnouncementModal() {
  document.getElementById('announcement-modal').classList.add('hidden');
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
  document.getElementById('screen-game').classList.add('hidden');
  document.getElementById('screen-shop').classList.add('hidden');
  document.getElementById('screen-ascension').classList.add('hidden');
  document.getElementById('screen-leaderboard').classList.add('hidden');

  document.getElementById(`screen-${tabId}`).classList.remove('hidden');
}

// Admin Controls
function openAdminModal() { document.getElementById('admin-modal').classList.remove('hidden'); }
function closeAdminModal() { document.getElementById('admin-modal').classList.add('hidden'); }

function verifyAdminPasscode() {
  const code = document.getElementById('admin-passcode-input').value;
  if (code === '6021') {
    isAdminAuthenticated = true;
    document.getElementById('admin-passcode-view').classList.add('hidden');
    document.getElementById('admin-tools-view').classList.remove('hidden');
  } else {
    alert('Incorrect Admin Passcode!');
  }
}

function adminBanUser() {
  const targetUsername = document.getElementById('admin-ban-username').value;
  const reason = document.getElementById('admin-ban-reason').value;

  if (targetUsername.trim().length > 0) {
    socket.emit('adminBanUser', { targetUsername, reason });
    document.getElementById('admin-ban-username').value = '';
    document.getElementById('admin-ban-reason').value = '';
  } else {
    alert('Please enter a username to ban.');
  }
}

function adminSendAnnouncement() {
  const input = document.getElementById('admin-announcement-input');
  const message = input.value;
  if (message.trim().length > 0) {
    socket.emit('adminSendAnnouncement', message);
    input.value = '';
  }
}

function adminResetAllCash() {
  socket.emit('adminModifyState', { resetAllCash: true });
}

function adminAddCash(amount) { socket.emit('adminModifyState', { addCash: amount }); }
function adminAddCPS(amount) { socket.emit('adminModifyState', { addCPS: amount }); }
function adminAddCPC(amount) { socket.emit('adminModifyState', { addCPC: amount }); }
function adminAddTickets(amount) { socket.emit('adminModifyState', { addTickets: amount }); }
