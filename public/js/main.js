const socket = io();

const screens = {
  home: document.getElementById('screen-home'),
  lobby: document.getElementById('screen-lobby'),
  game: document.getElementById('screen-game'),
};
function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.remove('active'));
  screens[name].classList.add('active');
}

const el = {
  nameInput: document.getElementById('name-input'),
  codeInput: document.getElementById('code-input'),
  btnCreate: document.getElementById('btn-create'),
  btnJoin: document.getElementById('btn-join'),
  homeError: document.getElementById('home-error'),

  roomCodeDisplay: document.getElementById('room-code-display'),
  lobbyPlayers: document.getElementById('lobby-players'),
  btnStart: document.getElementById('btn-start'),
  lobbyHint: document.getElementById('lobby-hint'),

  holeName: document.getElementById('hole-name'),
  holeCounter: document.getElementById('hole-counter'),
  parPill: document.getElementById('par-pill'),
  turnIndicator: document.getElementById('turn-indicator'),
  canvas: document.getElementById('course-canvas'),
  powerMeter: document.getElementById('power-meter'),
  powerFill: document.getElementById('power-fill'),
  toast: document.getElementById('toast'),
  scoreboard: document.getElementById('scoreboard'),
  holeSummary: document.getElementById('hole-summary'),
  holeSummaryList: document.getElementById('hole-summary-list'),
  gameOver: document.getElementById('game-over'),
  podium: document.getElementById('podium'),
  btnPlayAgain: document.getElementById('btn-play-again'),
};

const ctx = el.canvas.getContext('2d');

let myId = null;
let isHost = false;
let roomCode = null;
let players = [];
let course = null;
let currentTurn = null;
let holeIndex = 0, totalHoles = 3;

const THEME_BG = {
  forest: ['#2f8f4e', '#1e5c34'],
  desert: ['#e0b568', '#c98f3c'],
  snow:   ['#dbeffb', '#aad4ea'],
};

function toast(msg) {
  el.toast.textContent = msg;
  el.toast.classList.add('show');
  setTimeout(() => el.toast.classList.remove('show'), 1600);
}

// ---------- HOME ----------
el.btnCreate.addEventListener('click', () => {
  const name = el.nameInput.value.trim() || 'Player';
  socket.emit('create-room', { name }, (res) => {
    if (!res.ok) { el.homeError.textContent = res.error || 'Could not create room'; return; }
    enterLobby(res);
  });
});

el.btnJoin.addEventListener('click', () => {
  const name = el.nameInput.value.trim() || 'Player';
  const code = el.codeInput.value.trim().toUpperCase();
  if (!code) { el.homeError.textContent = 'Enter a room code'; return; }
  socket.emit('join-room', { code, name }, (res) => {
    if (!res.ok) { el.homeError.textContent = res.error || 'Could not join room'; return; }
    enterLobby(res);
  });
});

function enterLobby(res) {
  myId = socket.id;
  isHost = res.isHost;
  roomCode = res.code;
  players = res.players;
  el.roomCodeDisplay.textContent = roomCode;
  el.btnStart.style.display = isHost ? 'block' : 'none';
  el.lobbyHint.style.display = isHost ? 'none' : 'block';
  renderLobbyPlayers();
  showScreen('lobby');
}

function renderLobbyPlayers() {
  el.lobbyPlayers.innerHTML = '';
  players.forEach(p => {
    const li = document.createElement('li');
    li.innerHTML = `<span class="name-wrap"><span class="dot" style="background:${p.color}"></span>${p.name}</span>`;
    el.lobbyPlayers.appendChild(li);
  });
}

socket.on('lobby-update', (data) => {
  players = data.players;
  renderLobbyPlayers();
});

el.btnStart.addEventListener('click', () => socket.emit('start-game'));

// ---------- GAME ----------
socket.on('hole-start', (data) => {
  holeIndex = data.holeIndex;
  totalHoles = data.totalHoles;
  course = data.course;
  el.holeName.textContent = course.name;
  el.holeCounter.textContent = `Hole ${holeIndex + 1}/${totalHoles}`;
  el.parPill.textContent = `Par ${course.par}`;
  el.holeSummary.classList.add('hidden');
  el.gameOver.classList.add('hidden');
  showScreen('game');
});

socket.on('state-update', (data) => {
  players = data.players;
  currentTurn = data.currentTurn;
  renderTurnIndicator();
  renderScoreboard(data.scoreboard);
  draw();
});

socket.on('splash', ({ playerId }) => {
  const p = players.find(pl => pl.id === playerId);
  toast(`${p ? p.name : 'Ball'} splashed into the water! +1 stroke`);
});

socket.on('hole-complete', (data) => {
  el.holeSummaryList.innerHTML = '';
  data.players.forEach(p => {
    const diff = p.strokes - data.par;
    const diffTxt = diff === 0 ? 'Par' : diff > 0 ? `+${diff}` : `${diff}`;
    const li = document.createElement('li');
    li.innerHTML = `<span>${p.name}</span><span>${p.strokes} strokes (${diffTxt})</span>`;
    el.holeSummaryList.appendChild(li);
  });
  el.holeSummary.classList.remove('hidden');
  setTimeout(() => el.holeSummary.classList.add('hidden'), 4300);
});

socket.on('game-over', (data) => {
  el.podium.innerHTML = '';
  const sorted = [...data.players].sort((a, b) => a.strokesTotal - b.strokesTotal);
  sorted.forEach((p, i) => {
    const li = document.createElement('li');
    li.innerHTML = `<span class="rank">#${i + 1}</span><span class="name-wrap"><span class="dot" style="background:${p.color}"></span>${p.name}</span><span>${p.strokesTotal} strokes</span>`;
    el.podium.appendChild(li);
  });
  el.gameOver.classList.remove('hidden');
});

el.btnPlayAgain.addEventListener('click', () => location.reload());

function renderTurnIndicator() {
  if (currentTurn === myId) {
    el.turnIndicator.textContent = 'Your shot — drag the ball to aim';
  } else {
    const p = players.find(pl => pl.id === currentTurn);
    el.turnIndicator.textContent = p ? `${p.name} is putting…` : '';
  }
}

function renderScoreboard(scoreboard) {
  el.scoreboard.innerHTML = '';
  scoreboard.forEach(s => {
    const p = players.find(pl => pl.id === s.id);
    if (!p) return;
    const li = document.createElement('li');
    const ord = ['', '1st', '2nd', '3rd', '4th', '5th', '6th'][s.rank] || `${s.rank}th`;
    li.innerHTML = `<span class="rank">${ord}</span><span class="dot" style="background:${p.color}"></span>${p.name} · ${p.strokesTotal + p.strokesHole}`;
    el.scoreboard.appendChild(li);
  });
}

// ---------- RENDERING ----------
function draw() {
  if (!course) return;
  const { width, height } = course;
  ctx.clearRect(0, 0, width, height);

  const [c1, c2] = THEME_BG[course.theme] || THEME_BG.forest;
  const grad = ctx.createLinearGradient(0, 0, width, height);
  grad.addColorStop(0, c1);
  grad.addColorStop(1, c2);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  // checker pattern for a "fairway" feel
  ctx.globalAlpha = 0.07;
  const cell = 40;
  for (let y = 0; y < height; y += cell) {
    for (let x = 0; x < width; x += cell) {
      if (((x / cell) + (y / cell)) % 2 === 0) {
        ctx.fillStyle = '#000';
        ctx.fillRect(x, y, cell, cell);
      }
    }
  }
  ctx.globalAlpha = 1;

  // hazards
  (course.hazards || []).forEach(hz => {
    ctx.fillStyle = hz.type === 'sand' ? '#e3c98f' : hz.type === 'water' ? '#2e86ff' : '#eaf7ff';
    ctx.globalAlpha = hz.type === 'ice' ? 0.55 : 0.95;
    if (hz.shape === 'circle') {
      ctx.beginPath();
      ctx.ellipse(hz.x, hz.y, hz.r, hz.r * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillRect(hz.x, hz.y, hz.w, hz.h);
    }
    ctx.globalAlpha = 1;
  });

  // walls
  ctx.strokeStyle = '#5a3b1e';
  ctx.lineWidth = 8;
  ctx.lineCap = 'round';
  (course.walls || []).forEach(w => {
    ctx.beginPath();
    ctx.moveTo(w.x1, w.y1);
    ctx.lineTo(w.x2, w.y2);
    ctx.stroke();
  });

  // hole + flag
  ctx.fillStyle = '#0b0b0b';
  ctx.beginPath();
  ctx.ellipse(course.hole.x, course.hole.y, 16, 11, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(course.hole.x, course.hole.y - 6);
  ctx.lineTo(course.hole.x, course.hole.y - 50);
  ctx.stroke();
  ctx.fillStyle = '#ff5252';
  ctx.beginPath();
  ctx.moveTo(course.hole.x, course.hole.y - 50);
  ctx.lineTo(course.hole.x + 22, course.hole.y - 42);
  ctx.lineTo(course.hole.x, course.hole.y - 34);
  ctx.closePath();
  ctx.fill();

  // balls
  players.forEach(p => {
    if (p.sunk) return;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 3;
    ctx.strokeText(p.name, p.x, p.y - 16);
    ctx.fillText(p.name, p.x, p.y - 16);
  });

  // aim line
  if (dragging && currentTurn === myId) {
    const me = players.find(p => p.id === myId);
    if (me) {
      const dx = me.x - dragPoint.x;
      const dy = me.y - dragPoint.y;
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 3;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(me.x, me.y);
      ctx.lineTo(me.x + dx * 2.2, me.y + dy * 2.2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
}

// ---------- INPUT (pull-back slingshot aim) ----------
let dragging = false;
let dragPoint = { x: 0, y: 0 };
const MAX_DRAG = 160; // course units

function canvasPoint(evt) {
  const rect = el.canvas.getBoundingClientRect();
  const scaleX = el.canvas.width / rect.width;
  const scaleY = el.canvas.height / rect.height;
  const clientX = evt.touches ? evt.touches[0].clientX : evt.clientX;
  const clientY = evt.touches ? evt.touches[0].clientY : evt.clientY;
  return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
}

function canShoot() {
  return currentTurn === myId;
}

function onDown(evt) {
  if (!canShoot()) return;
  dragging = true;
  dragPoint = canvasPoint(evt);
  el.powerMeter.classList.add('show');
  evt.preventDefault();
}
function onMove(evt) {
  if (!dragging) return;
  dragPoint = canvasPoint(evt);
  const me = players.find(p => p.id === myId);
  if (me) {
    const dist = Math.hypot(dragPoint.x - me.x, dragPoint.y - me.y);
    const pct = Math.min(1, dist / MAX_DRAG) * 100;
    el.powerFill.style.width = pct + '%';
  }
  draw();
  evt.preventDefault();
}
function onUp(evt) {
  if (!dragging) return;
  dragging = false;
  el.powerMeter.classList.remove('show');
  const me = players.find(p => p.id === myId);
  if (me) {
    const dx = me.x - dragPoint.x;
    const dy = me.y - dragPoint.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 6) {
      const power = Math.min(1, dist / MAX_DRAG);
      socket.emit('shoot', { dx, dy, power });
    }
  }
  draw();
}

el.canvas.addEventListener('mousedown', onDown);
el.canvas.addEventListener('mousemove', onMove);
window.addEventListener('mouseup', onUp);
el.canvas.addEventListener('touchstart', onDown, { passive: false });
el.canvas.addEventListener('touchmove', onMove, { passive: false });
el.canvas.addEventListener('touchend', onUp);

showScreen('home');
