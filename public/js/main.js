import { GolfScene } from './scene.js';
import { skinIcon } from './skins.js';

const $ = (id) => document.getElementById(id);
const socket = io();

const el = {
  nameInput: $('name-input'), codeInput: $('code-input'),
  btnCreate: $('btn-create'), btnJoin: $('btn-join'), homeError: $('home-error'),
  roomCode: $('room-code-display'), btnCopy: $('btn-copy'), btnLobbyLeave: $('btn-lobby-leave'),
  playerCount: $('player-count'), lobbyPlayers: $('lobby-players'),
  swatches: $('color-swatches'), patternPicks: $('pattern-picks'),
  courseStrip: $('course-strip'), courseHint: $('course-hint'),
  btnStart: $('btn-start'), lobbyHint: $('lobby-hint'),
  holeName: $('hole-name'), holeMeta: $('hole-meta'),
  btnMenu: $('btn-menu'), btnRank: $('btn-rank'), rankText: $('rank-text'), scoreboard: $('scoreboard'),
  powerMeter: $('power-meter'), powerFill: $('power-fill'),
  turnRibbon: $('turn-ribbon'), turnText: $('turn-text'), toast: $('toast'),
  menuModal: $('menu-modal'), menuNote: $('menu-note'),
  courseModal: $('course-modal'), courseGrid: $('course-grid'),
  confirmModal: $('confirm-modal'), confirmText: $('confirm-text'),
  holeSummary: $('hole-summary'), holeSummaryTitle: $('hole-summary-title'), holeSummaryList: $('hole-summary-list'),
  gameOver: $('game-over'), podium: $('podium'), btnPlayAgain: $('btn-play-again'), gameOverHint: $('gameover-hint'),
};

const screens = { home: $('screen-home'), lobby: $('screen-lobby'), game: $('screen-game') };
let currentScreen = 'home';
function showScreen(name) {
  currentScreen = name;
  Object.entries(screens).forEach(([k, s]) => s.classList.toggle('active', k === name));
}

// ---------- state ----------
let catalog = { courses: [], config: {}, skins: { colors: [], patterns: [] }, defaultCourseIds: [] };
let myId = null;
let hostId = null;
let roomCode = null;
let players = [];
let courseIds = [];
let course = null;
let currentTurn = null;
let phase = 'lobby';
let previewId = null;
let holeSummaryTimer = null;
let toastTimer = null;

const isHost = () => myId !== null && hostId === myId;
const me = () => players.find(p => p.id === myId);
const ordinal = (n) => ['', '1st', '2nd', '3rd'][n] || `${n}th`;
const courseOf = (id) => catalog.courses.find(c => c.id === id);

function toast(msg) {
  el.toast.textContent = msg;
  el.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.toast.classList.remove('show'), 2200);
}

function make(tag, props = {}, children = []) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v);
  }
  for (const c of [].concat(children)) if (c) n.append(c);
  return n;
}

const openModal = (m) => m.classList.remove('hidden');
const closeModal = (m) => m.classList.add('hidden');
const anyModalOpen = () => [el.menuModal, el.courseModal, el.confirmModal, el.gameOver].some(m => !m.classList.contains('hidden'));

// ---------- 3D scene ----------
const scene = new GolfScene($('gl'), $('labels'));

function showcase(id) {
  const c = courseOf(id) || catalog.courses[0];
  if (!c || (course && course.id === c.id && scene.mode === 'showcase')) return;
  course = c;
  scene.setMode('showcase');
  scene.loadCourse(c);
}

// ---------- course thumbnails (drawn from the same data the server plays on) ----------
const THUMB = {
  forest: { a: '#5cc23f', b: '#4aad33', rim: '#3b8f2c', wall: '#8a5a33' },
  desert: { a: '#a39a35', b: '#8e862b', rim: '#c27a3c', wall: '#7a4a2a' },
  snow: { a: '#23a39b', b: '#1b8d86', rim: '#eaf4fb', wall: '#7a4c2b' },
};
function courseThumb(c, width = 170) {
  const cv = document.createElement('canvas');
  const s = width / c.width;
  cv.width = Math.round(width * 2); cv.height = Math.round(c.height * s * 2);
  const g = cv.getContext('2d');
  g.scale(2 * s, 2 * s);
  const th = THUMB[c.theme] || THUMB.forest;
  g.fillStyle = th.rim;
  g.fillRect(0, 0, c.width, c.height);
  const cell = 50;
  for (let r = 0; r < c.height / cell; r++) {
    for (let q = 0; q < c.width / cell; q++) {
      g.fillStyle = (r + q) % 2 ? th.a : th.b;
      g.fillRect(q * cell, r * cell, cell, cell);
    }
  }
  for (const hz of c.hazards || []) {
    g.fillStyle = hz.type === 'water' ? '#2d9bff' : hz.type === 'ice' ? 'rgba(201,240,255,0.65)' : '#efd9a0';
    if (hz.shape === 'circle') { g.beginPath(); g.arc(hz.x, hz.y, hz.r, 0, Math.PI * 2); g.fill(); }
    else g.fillRect(hz.x, hz.y, hz.w, hz.h);
  }
  g.strokeStyle = th.wall; g.lineCap = 'round'; g.lineWidth = 16;
  for (const w of c.walls) { g.beginPath(); g.moveTo(w.x1, w.y1); g.lineTo(w.x2, w.y2); g.stroke(); }
  g.fillStyle = '#111'; g.beginPath(); g.arc(c.hole.x, c.hole.y, 24, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#fff'; g.lineWidth = 6;
  g.beginPath(); g.moveTo(c.hole.x, c.hole.y); g.lineTo(c.hole.x, c.hole.y - 70); g.stroke();
  g.fillStyle = '#e8322e'; g.beginPath(); g.moveTo(c.hole.x, c.hole.y - 70); g.lineTo(c.hole.x + 44, c.hole.y - 56); g.lineTo(c.hole.x, c.hole.y - 42); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.85)'; g.beginPath(); g.arc(c.start.x, c.start.y, 22, 0, Math.PI * 2); g.fill();
  return cv;
}

// ---------- HOME ----------
try { el.nameInput.value = localStorage.getItem('putt-name') || ''; } catch (e) { /* storage unavailable */ }
const urlRoom = new URLSearchParams(location.search).get('room');
if (urlRoom) el.codeInput.value = urlRoom.toUpperCase().slice(0, 4);

const playerName = () => {
  const n = el.nameInput.value.trim() || 'Player';
  try { localStorage.setItem('putt-name', el.nameInput.value.trim()); } catch (e) { /* ignore */ }
  return n;
};

el.codeInput.addEventListener('input', () => { el.codeInput.value = el.codeInput.value.toUpperCase(); });

el.btnCreate.addEventListener('click', () => {
  el.homeError.textContent = '';
  socket.emit('create-room', { name: playerName() }, (res) => {
    if (!res.ok) { el.homeError.textContent = res.error || 'Could not create room'; return; }
    enterLobby(res);
  });
});

el.btnJoin.addEventListener('click', () => {
  el.homeError.textContent = '';
  const code = el.codeInput.value.trim().toUpperCase();
  if (!code) { el.homeError.textContent = 'Enter a room code'; return; }
  socket.emit('join-room', { code, name: playerName() }, (res) => {
    if (!res.ok) { el.homeError.textContent = res.error || 'Could not join room'; return; }
    enterLobby(res);
  });
});

function goHome(message) {
  roomCode = null; hostId = null; players = []; currentTurn = null; phase = 'lobby';
  [el.menuModal, el.courseModal, el.confirmModal, el.holeSummary, el.gameOver].forEach(closeModal);
  el.scoreboard.classList.add('hidden');
  clearTimeout(holeSummaryTimer);
  scene.setPlayers([]);
  scene.hideAim();
  showcase(catalog.defaultCourseIds[0]);
  el.homeError.textContent = message || '';
  showScreen('home');
}

// ---------- LOBBY ----------
function enterLobby(res) {
  myId = socket.id;
  roomCode = res.code;
  applyLobby(res);
  el.roomCode.textContent = roomCode;
  buildSkinPickers();
  showScreen('lobby');
}

function applyLobby(data) {
  players = data.players;
  hostId = data.hostId;
  courseIds = data.courseIds;
  renderLobby();
}

function renderLobby() {
  el.playerCount.textContent = `${players.length}/${catalog.config.maxPlayers || 6}`;
  el.lobbyPlayers.replaceChildren(...players.map(p => make('li', { class: p.id === myId ? 'me' : '' }, [
    skinIcon(p.color, p.pattern, 80),
    make('span', { class: 'grow', text: p.name }),
    p.id === hostId ? make('span', { class: 'chip', text: 'HOST' }) : null,
    p.id === myId ? make('span', { class: 'chip you', text: 'YOU' }) : null,
  ])));

  const host = isHost();
  el.btnStart.style.display = host ? 'block' : 'none';
  el.lobbyHint.style.display = host ? 'none' : 'block';
  el.courseHint.textContent = host ? 'tap to pick which holes you play' : `${courseIds.length} hole${courseIds.length === 1 ? '' : 's'} chosen by the host`;
  renderCourseStrip();
  refreshSkinSelection();

  // 3D lobby preview: everyone lined up on the tee
  const preview = courseOf(previewId) || courseOf(courseIds[0]);
  if (preview && currentScreen !== 'game') {
    showcase(preview.id);
    const down = preview.start.y > preview.height / 2 ? -1 : 1;
    scene.setPlayers(players.map((p, i) => ({
      ...p, sunk: false,
      x: preview.start.x + (i % 2 ? 26 : -4),
      y: preview.start.y + down * i * 30 - down * 30,
    })));
    scene.setTurn(null, 'lobby');
  }
}

function renderCourseStrip() {
  const host = isHost();
  el.courseStrip.replaceChildren(...catalog.courses.map(c => {
    const idx = courseIds.indexOf(c.id);
    const card = make('button', {
      class: `course-card ${idx >= 0 ? 'on' : 'off'} ${host ? '' : 'static'}`,
      onclick: () => {
        previewId = c.id;
        if (host) {
          const next = idx >= 0 ? courseIds.filter(id => id !== c.id) : [...courseIds, c.id];
          if (next.length === 0) { toast('Keep at least one hole'); return; }
          socket.emit('set-courses', { ids: next });
        }
        renderLobby();
      },
    }, [
      courseThumb(c),
      make('span', { class: 'order', text: idx >= 0 ? String(idx + 1) : '' }),
      make('span', { class: 'cname', text: c.name }),
      make('span', { class: 'cmeta', text: `Par ${c.par}` }),
    ]);
    return card;
  }));
}

function buildSkinPickers() {
  el.swatches.replaceChildren(...catalog.skins.colors.map(color => make('button', {
    class: 'swatch', 'data-color': color, style: `background:${color}`, 'aria-label': 'Ball colour',
    onclick: () => socket.emit('set-skin', { color }),
  })));
  el.patternPicks.replaceChildren(...catalog.skins.patterns.map(pattern => make('button', {
    class: 'pattern-btn', 'data-pattern': pattern, 'aria-label': `${pattern} pattern`,
    onclick: () => socket.emit('set-skin', { pattern }),
  })));
}

function refreshSkinSelection() {
  const mine = me();
  if (!mine) return;
  el.swatches.querySelectorAll('.swatch').forEach(b => b.classList.toggle('sel', b.dataset.color === mine.color));
  el.patternPicks.querySelectorAll('.pattern-btn').forEach(b => {
    b.classList.toggle('sel', b.dataset.pattern === mine.pattern);
    b.replaceChildren(skinIcon(mine.color, b.dataset.pattern, 96));
  });
}

socket.on('lobby-update', (data) => {
  if (!roomCode) return;
  applyLobby(data);
  if (currentScreen === 'game') updateMenuForRole();
});

socket.on('return-lobby', (data) => {
  if (!roomCode) return;
  [el.menuModal, el.courseModal, el.confirmModal, el.holeSummary, el.gameOver].forEach(closeModal);
  el.scoreboard.classList.add('hidden');
  clearTimeout(holeSummaryTimer);
  scene.hideAim();
  phase = 'lobby';
  currentTurn = null;
  previewId = null;
  course = null; // force the showcase to reload
  applyLobby(data);
  showScreen('lobby');
});

socket.on('player-left', ({ name }) => { if (roomCode) toast(`${name} left the game`); });

el.btnStart.addEventListener('click', () => socket.emit('start-game'));
el.btnLobbyLeave.addEventListener('click', () => leaveRoom());

el.btnCopy.addEventListener('click', async () => {
  const link = `${location.origin}/?room=${roomCode}`;
  try { await navigator.clipboard.writeText(link); toast('Invite link copied!'); }
  catch (e) { toast(`Share code ${roomCode}`); }
});

function leaveRoom() {
  socket.emit('leave-room', null, () => {});
  goHome('');
}

// ---------- GAME ----------
socket.on('hole-start', (data) => {
  course = data.course;
  const idx = data.holeIndex;
  el.holeName.textContent = course.name;
  el.holeMeta.textContent = `HOLE ${idx + 1}/${data.totalHoles}  ·  PAR ${course.par}`;
  closeModal(el.holeSummary);
  closeModal(el.gameOver);
  clearTimeout(holeSummaryTimer);
  scene.setMode('play');
  scene.loadCourse(course);
  scene.hideAim();
  dragging = false;
  el.powerMeter.classList.remove('show');
  showScreen('game');
});

socket.on('state-update', (data) => {
  if (!roomCode) return;
  players = data.players;
  currentTurn = data.currentTurn;
  phase = data.phase;
  hostId = data.hostId;
  if (currentScreen === 'game') {
    scene.setPlayers(players);
    scene.setTurn(currentTurn, phase);
    renderTurn();
    renderScoreboard(data.scoreboard);
  }
});

socket.on('splash', ({ playerId, x, y }) => {
  const p = players.find(pl => pl.id === playerId);
  scene.splash(x, y);
  toast(`${p ? p.name : 'Ball'} splashed into the water! +1 stroke`);
});

function renderTurn() {
  const mine = currentTurn === myId && phase === 'aiming';
  el.turnRibbon.classList.toggle('mine', mine);
  if (phase === 'hole-summary') el.turnText.textContent = 'Hole complete!';
  else if (phase === 'game-over') el.turnText.textContent = 'Game over';
  else if (currentTurn === myId) el.turnText.textContent = phase === 'aiming' ? 'Your shot!' : 'Nice putt…';
  else {
    const p = players.find(pl => pl.id === currentTurn);
    el.turnText.textContent = p ? `${p.name} is putting` : ' ';
  }
}

function renderScoreboard(board) {
  const rows = board.map(s => {
    const p = players.find(pl => pl.id === s.id);
    if (!p) return null;
    return make('li', { class: `${p.id === myId ? 'me' : ''} ${p.id === currentTurn ? 'turn' : ''}` }, [
      make('span', { class: 'rk', text: ordinal(s.rank) }),
      skinIcon(p.color, p.pattern, 56),
      make('span', { class: 'nm', text: p.name }),
      make('span', { text: String(p.strokesTotal + p.strokesHole) }),
    ]);
  }).filter(Boolean);
  el.scoreboard.replaceChildren(...rows);
  const mine = board.find(s => s.id === myId);
  el.rankText.textContent = mine ? ordinal(mine.rank) : '-';
}

let camMode = 'overview';
try { camMode = localStorage.getItem('putt-cam') === 'follow' ? 'follow' : 'overview'; } catch (e) { /* ignore */ }
scene.setCamMode(camMode);
$('btn-cam').addEventListener('click', () => {
  camMode = camMode === 'follow' ? 'overview' : 'follow';
  scene.setCamMode(camMode);
  try { localStorage.setItem('putt-cam', camMode); } catch (e) { /* ignore */ }
  toast(camMode === 'follow' ? 'Follow camera' : 'Course view');
});

el.btnRank.addEventListener('click', () => el.scoreboard.classList.toggle('hidden'));

socket.on('hole-complete', (data) => {
  el.holeSummaryTitle.textContent = `Hole ${data.holeIndex + 1} complete!`;
  const sorted = [...data.players].sort((a, b) => a.strokes - b.strokes);
  el.holeSummaryList.replaceChildren(...sorted.map(p => {
    const diff = p.strokes - data.par;
    const label = p.strokes === 1 ? 'Hole in one!' : diff <= -2 ? 'Eagle' : diff === -1 ? 'Birdie' : diff === 0 ? 'Par' : diff === 1 ? 'Bogey' : `+${diff}`;
    const pl = players.find(q => q.id === p.id);
    return make('li', { class: p.id === myId ? 'me' : '' }, [
      pl ? skinIcon(pl.color, pl.pattern, 80) : null,
      make('span', { class: 'grow' }, [p.name, make('span', { class: 'sub', text: label })]),
      make('span', { class: 'score', text: `${p.strokes}` }),
    ]);
  }));
  el.scoreboard.classList.add('hidden');
  openModal(el.holeSummary);
  clearTimeout(holeSummaryTimer);
  holeSummaryTimer = setTimeout(() => closeModal(el.holeSummary), 4300);
});

socket.on('game-over', (data) => {
  closeModal(el.holeSummary);
  el.scoreboard.classList.add('hidden');
  const sorted = [...data.players].sort((a, b) => a.strokesTotal - b.strokesTotal);
  el.podium.replaceChildren(...sorted.map((p, i) => make('li', { class: p.id === myId ? 'me' : '' }, [
    make('span', { class: 'medal', text: ['🥇', '🥈', '🥉'][i] || `#${i + 1}` }),
    skinIcon(p.color, p.pattern, 80),
    make('span', { class: 'grow' }, [p.name, make('span', { class: 'sub', text: p.scores.join('  ·  ') })]),
    make('span', { class: 'score', text: `${p.strokesTotal}` }),
  ])));
  el.btnPlayAgain.style.display = isHost() ? 'block' : 'none';
  el.gameOverHint.textContent = isHost() ? '' : 'Waiting for the host to play again…';
  openModal(el.gameOver);
});

el.btnPlayAgain.addEventListener('click', () => socket.emit('end-game', null, () => {}));
$('btn-gameover-leave').addEventListener('click', () => leaveRoom());

// ---------- pause menu: resume / restart / change course / quit ----------
function updateMenuForRole() {
  const host = isHost();
  el.menuModal.querySelectorAll('.host-only').forEach(b => { b.style.display = host ? 'block' : 'none'; });
  el.menuNote.style.display = host ? 'none' : 'block';
}

function openMenu() {
  if (currentScreen !== 'game') return;
  updateMenuForRole();
  el.scoreboard.classList.add('hidden');
  openModal(el.menuModal);
}

el.btnMenu.addEventListener('click', openMenu);
$('menu-resume').addEventListener('click', () => closeModal(el.menuModal));
el.menuModal.addEventListener('click', (e) => { if (e.target === el.menuModal) closeModal(el.menuModal); });

$('menu-restart').addEventListener('click', () => {
  socket.emit('restart-hole', null, (res) => {
    if (res && res.ok) { closeModal(el.menuModal); toast('Hole restarted'); }
    else toast((res && res.error) || 'Could not restart');
  });
});

$('menu-end').addEventListener('click', () => {
  socket.emit('end-game', null, (res) => { if (res && res.ok) closeModal(el.menuModal); });
});

$('menu-course').addEventListener('click', () => {
  const playing = course ? course.id : null;
  el.courseGrid.replaceChildren(...catalog.courses.map(c => make('button', {
    class: `course-card ${c.id === playing ? 'current' : ''}`,
    onclick: () => {
      if (c.id === playing) { closeModal(el.courseModal); return; }
      socket.emit('change-course', { id: c.id }, (res) => {
        if (res && res.ok) { closeModal(el.courseModal); closeModal(el.menuModal); toast(`Now playing ${c.name}`); }
        else toast((res && res.error) || 'Could not change course');
      });
    },
  }, [
    courseThumb(c, 160),
    c.id === playing ? make('span', { class: 'badge-now', text: 'PLAYING' }) : null,
    make('span', { class: 'cname', text: c.name }),
    make('span', { class: 'cmeta', text: `Par ${c.par}` }),
  ])));
  closeModal(el.menuModal);
  openModal(el.courseModal);
});
$('course-cancel').addEventListener('click', () => { closeModal(el.courseModal); openModal(el.menuModal); });

$('menu-quit').addEventListener('click', () => {
  closeModal(el.menuModal);
  openModal(el.confirmModal);
});
$('confirm-no').addEventListener('click', () => { closeModal(el.confirmModal); openModal(el.menuModal); });
$('confirm-yes').addEventListener('click', () => { closeModal(el.confirmModal); leaveRoom(); });

window.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || currentScreen !== 'game') return;
  if (!el.confirmModal.classList.contains('hidden')) { closeModal(el.confirmModal); openModal(el.menuModal); }
  else if (!el.courseModal.classList.contains('hidden')) { closeModal(el.courseModal); openModal(el.menuModal); }
  else if (!el.menuModal.classList.contains('hidden')) closeModal(el.menuModal);
  else openMenu();
});

socket.on('disconnect', () => {
  if (roomCode) goHome('Connection lost. Please rejoin.');
});

// ---------- INPUT: pull back and release, like a slingshot ----------
const MAX_DRAG = 170; // course units for full power
const glCanvas = $('gl');
let dragging = false;
let aim = null; // { dx, dy, power }
let dragStart = null; // ground point where the finger landed

const canShoot = () => currentScreen === 'game' && phase === 'aiming' && currentTurn === myId && !anyModalOpen();

function updateAim(evt) {
  const mine = me();
  const g = scene.groundPoint(evt.clientX, evt.clientY);
  if (!mine || !g || !dragStart) return;
  // slingshot: pull back from where the finger landed; the ball flies the opposite way
  const dx = dragStart.x - g.x, dy = dragStart.y - g.y;
  const dist = Math.hypot(dx, dy);
  const power = Math.min(1, dist / MAX_DRAG);
  el.powerFill.style.width = `${power * 100}%`;
  if (dist < 10) { aim = null; scene.hideAim(); return; }
  aim = { dx, dy, power };
  scene.showAim(mine.x, mine.y, dx / dist, dy / dist, power);
}

glCanvas.addEventListener('pointerdown', (e) => {
  if (!canShoot()) return;
  dragStart = scene.groundPoint(e.clientX, e.clientY);
  if (!dragStart) return;
  dragging = true;
  aim = null;
  glCanvas.setPointerCapture(e.pointerId);
  el.powerMeter.classList.add('show');
  el.scoreboard.classList.add('hidden');
  updateAim(e);
  e.preventDefault();
});
glCanvas.addEventListener('pointermove', (e) => { if (dragging) updateAim(e); });

function endDrag(shoot) {
  if (!dragging) return;
  dragging = false;
  el.powerMeter.classList.remove('show');
  scene.hideAim();
  if (shoot && aim && canShoot()) socket.emit('shoot', aim);
  aim = null;
}
glCanvas.addEventListener('pointerup', () => endDrag(true));
glCanvas.addEventListener('pointercancel', () => endDrag(false));
glCanvas.addEventListener('lostpointercapture', () => endDrag(false));

// ---------- boot ----------
async function boot() {
  catalog = await (await fetch('/api/courses')).json();
  scene.setConfig(catalog.config);
  previewId = null;
  showcase(catalog.defaultCourseIds[0]);
}
boot();
