const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { courses, courseById, BALL_R, HOLE_R, WALL_HALF } = require('./courses');
const { stepBall, applyShot } = require('./physics');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const SKIN_COLORS = ['#ff4b4b', '#33b5ff', '#ffc92b', '#4cd964', '#b36bff', '#ff8a3d', '#ffffff', '#2ee6d6'];
const SKIN_PATTERNS = ['plain', 'stripes', 'hoops', 'dots', 'checker'];
const DEFAULT_COURSE_IDS = ['pine-forest', 'desert-canyon', 'snow-valley'];
const WEATHERS = ['clear', 'cloudy', 'rain', 'snow', 'fog', 'sunset', 'night']; // cosmetic only
const MAX_PLAYERS = 6;
const MAX_STROKES_PER_HOLE = 8;
const TICK_MS = 1000 / 60;

app.use(express.static(path.join(__dirname, 'public')));
app.use('/vendor/three', express.static(path.join(__dirname, 'node_modules', 'three')));

// Static catalogue the client needs before it joins anything.
app.get('/api/courses', (req, res) => {
  res.json({
    courses,
    config: { ballR: BALL_R, holeR: HOLE_R, wallHalf: WALL_HALF, maxStrokes: MAX_STROKES_PER_HOLE, maxPlayers: MAX_PLAYERS },
    skins: { colors: SKIN_COLORS, patterns: SKIN_PATTERNS },
    defaultCourseIds: DEFAULT_COURSE_IDS,
    weathers: WEATHERS,
  });
});

/** rooms: code -> room state */
const rooms = new Map();

function makeRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function cleanName(name) {
  const s = String(name || '').replace(/[<>&"]/g, '').trim().slice(0, 16);
  return s || 'Player';
}

function newRoom(code, hostId) {
  return {
    code,
    hostId,
    players: [], // { id, name, color, pattern, strokesTotal, strokesHole, scores, sunk, x, y, vx, vy, moving }
    courseIds: [...DEFAULT_COURSE_IDS],
    weather: 'clear',
    holeIndex: 0,
    turnOrder: [],
    turnPtr: 0,
    phase: 'lobby', // lobby | aiming | rolling | hole-summary | game-over
    loop: null,
    timers: {},
    lastShotStart: null, // { x, y } for current shooter, used for water penalty reset
  };
}

function newPlayer(room, id, name) {
  const used = new Set(room.players.map(p => p.color));
  const color = SKIN_COLORS.find(c => !used.has(c)) || SKIN_COLORS[room.players.length % SKIN_COLORS.length];
  return {
    id, name: cleanName(name), color, pattern: 'plain',
    strokesTotal: 0, strokesHole: 0, scores: [], sunk: false,
    x: 0, y: 0, vx: 0, vy: 0, moving: false,
  };
}

// ---------- timers (one slot per purpose so a stale callback can never double-fire) ----------
function later(room, key, fn, ms) {
  clearTimeout(room.timers[key]);
  room.timers[key] = setTimeout(() => {
    delete room.timers[key];
    if (rooms.get(room.code) === room) fn();
  }, ms);
}

function clearTimers(room) {
  for (const k of Object.keys(room.timers)) clearTimeout(room.timers[k]);
  room.timers = {};
}

function destroyRoom(room) {
  clearTimers(room);
  if (room.loop) clearInterval(room.loop);
  rooms.delete(room.code);
}

// ---------- state publishing ----------
function publicPlayers(room) {
  return room.players.map(p => ({
    id: p.id, name: p.name, color: p.color, pattern: p.pattern,
    strokesTotal: p.strokesTotal, strokesHole: p.strokesHole, scores: p.scores,
    sunk: p.sunk, x: p.x, y: p.y, moving: p.moving,
  }));
}

function scoreboard(room) {
  return [...room.players]
    .sort((a, b) => (a.strokesTotal + a.strokesHole) - (b.strokesTotal + b.strokesHole))
    .map((p, i) => ({ id: p.id, name: p.name, rank: i + 1 }));
}

function lobbyPayload(room) {
  return { players: publicPlayers(room), hostId: room.hostId, courseIds: room.courseIds, weather: room.weather };
}

function broadcastLobby(room) {
  io.to(room.code).emit('lobby-update', lobbyPayload(room));
}

function broadcastState(room) {
  io.to(room.code).emit('state-update', {
    players: publicPlayers(room),
    scoreboard: scoreboard(room),
    currentTurn: room.turnOrder[room.turnPtr] || null,
    phase: room.phase,
    hostId: room.hostId,
    weather: room.weather,
  });
}

function currentCourse(room) {
  return courseById[room.courseIds[room.holeIndex]];
}

// ---------- hole / turn flow ----------
function startHole(room) {
  clearTimers(room);
  const course = currentCourse(room);
  for (const p of room.players) {
    p.x = course.start.x;
    p.y = course.start.y;
    p.vx = 0; p.vy = 0;
    p.moving = false;
    p.sunk = false;
    p.strokesHole = 0;
  }
  room.turnOrder = room.players.map(p => p.id);
  room.turnPtr = 0;
  room.phase = 'aiming';
  io.to(room.code).emit('hole-start', {
    holeIndex: room.holeIndex,
    totalHoles: room.courseIds.length,
    course,
  });
  broadcastState(room);
}

function nextActivePlayerIndex(room, fromPtr) {
  const n = room.turnOrder.length;
  for (let i = 1; i <= n; i++) {
    const idx = (fromPtr + i) % n;
    const pid = room.turnOrder[idx];
    const p = room.players.find(pl => pl.id === pid);
    if (p && !p.sunk) return idx;
  }
  return -1; // everyone sunk
}

function advanceTurn(room) {
  const idx = nextActivePlayerIndex(room, room.turnPtr);
  if (idx === -1) {
    finishHole(room);
  } else {
    room.turnPtr = idx;
    room.phase = 'aiming';
    broadcastState(room);
  }
}

function finishHole(room) {
  for (const p of room.players) {
    p.scores.push(p.strokesHole);
    p.strokesTotal += p.strokesHole;
  }
  room.phase = 'hole-summary';
  io.to(room.code).emit('hole-complete', {
    holeIndex: room.holeIndex,
    par: currentCourse(room).par,
    players: room.players.map(p => ({ id: p.id, name: p.name, color: p.color, strokes: p.strokesHole, total: p.strokesTotal })),
  });
  broadcastState(room);

  later(room, 'hole', () => {
    room.holeIndex += 1;
    if (room.holeIndex >= room.courseIds.length) {
      room.phase = 'game-over';
      io.to(room.code).emit('game-over', {
        scoreboard: scoreboard(room),
        players: publicPlayers(room),
        holes: room.courseIds.map(id => ({ name: courseById[id].name, par: courseById[id].par })),
      });
      broadcastState(room);
    } else {
      startHole(room);
    }
  }, 4500);
}

function returnToLobby(room) {
  clearTimers(room);
  if (room.loop) { clearInterval(room.loop); room.loop = null; }
  room.phase = 'lobby';
  room.holeIndex = 0;
  room.turnOrder = [];
  room.turnPtr = 0;
  for (const p of room.players) {
    p.strokesTotal = 0; p.strokesHole = 0; p.scores = [];
    p.sunk = false; p.moving = false; p.vx = 0; p.vy = 0;
  }
  io.to(room.code).emit('return-lobby', lobbyPayload(room));
}

function tick(room) {
  if (room.phase !== 'rolling') return;
  const shooter = room.players.find(p => p.id === room.turnOrder[room.turnPtr]);
  if (!shooter || !shooter.moving) return;

  const event = stepBall(shooter, currentCourse(room), TICK_MS / 1000);

  if (event === 'water') {
    const splashAt = { x: shooter.x, y: shooter.y };
    shooter.strokesHole += 1; // penalty stroke
    shooter.x = room.lastShotStart.x;
    shooter.y = room.lastShotStart.y;
    if (shooter.strokesHole >= MAX_STROKES_PER_HOLE) shooter.sunk = true;
    io.to(room.code).emit('splash', { playerId: shooter.id, ...splashAt });
    broadcastState(room);
    later(room, 'advance', () => advanceTurn(room), 400);
  } else if (event === 'sunk') {
    broadcastState(room);
    later(room, 'advance', () => advanceTurn(room), 500);
  } else if (event === 'stopped') {
    if (shooter.strokesHole >= MAX_STROKES_PER_HOLE) shooter.sunk = true; // pick up, counts as finished
    broadcastState(room);
    later(room, 'advance', () => advanceTurn(room), 350);
  } else {
    broadcastState(room);
  }
}

function ensureLoop(room) {
  if (room.loop) return;
  room.loop = setInterval(() => tick(room), TICK_MS);
}

// ---------- membership ----------
function removePlayer(room, id) {
  const idx = room.players.findIndex(p => p.id === id);
  if (idx === -1) return;
  const [gone] = room.players.splice(idx, 1);
  if (room.players.length === 0) { destroyRoom(room); return; }

  if (room.hostId === id) room.hostId = room.players[0].id;
  io.to(room.code).emit('player-left', { id, name: gone.name });

  if (room.phase === 'aiming' || room.phase === 'rolling') {
    const tIdx = room.turnOrder.indexOf(id);
    const wasShooter = tIdx !== -1 && tIdx === room.turnPtr;
    if (tIdx !== -1) {
      room.turnOrder.splice(tIdx, 1);
      if (tIdx <= room.turnPtr) room.turnPtr -= 1; // so "next after turnPtr" lands on whoever followed them
    }
    broadcastLobby(room);
    if (wasShooter) {
      clearTimeout(room.timers.advance);
      delete room.timers.advance;
      advanceTurn(room);
    } else {
      broadcastState(room);
    }
    return;
  }

  broadcastLobby(room);
  if (room.phase !== 'lobby') broadcastState(room);
}

function leaveCurrentRoom(socket) {
  const code = socket.data.roomCode;
  socket.data.roomCode = null;
  if (!code) return;
  socket.leave(code);
  const room = rooms.get(code);
  if (room) removePlayer(room, socket.id);
}

function roomInfo(room, socket) {
  return { ok: true, code: room.code, isHost: room.hostId === socket.id, ...lobbyPayload(room) };
}

function hostRoom(socket) {
  const room = rooms.get(socket.data.roomCode);
  return room && room.hostId === socket.id ? room : null;
}

io.on('connection', (socket) => {
  socket.on('create-room', ({ name } = {}, cb) => {
    leaveCurrentRoom(socket);
    const code = makeRoomCode();
    const room = newRoom(code, socket.id);
    rooms.set(code, room);
    socket.join(code);
    socket.data.roomCode = code;
    room.players.push(newPlayer(room, socket.id, name));
    cb && cb(roomInfo(room, socket));
  });

  socket.on('join-room', ({ code, name } = {}, cb) => {
    const room = rooms.get(String(code || '').toUpperCase());
    if (!room) return cb && cb({ ok: false, error: 'Room not found' });
    if (room.phase !== 'lobby') return cb && cb({ ok: false, error: 'Game already started' });
    if (room.players.length >= MAX_PLAYERS) return cb && cb({ ok: false, error: 'Room is full' });
    if (socket.data.roomCode === room.code) return cb && cb(roomInfo(room, socket));

    leaveCurrentRoom(socket);
    socket.join(room.code);
    socket.data.roomCode = room.code;
    room.players.push(newPlayer(room, socket.id, name));
    broadcastLobby(room);
    cb && cb(roomInfo(room, socket));
  });

  socket.on('leave-room', (_, cb) => {
    leaveCurrentRoom(socket);
    if (typeof cb === 'function') cb({ ok: true });
  });

  // ----- lobby setup -----
  socket.on('set-skin', ({ color, pattern } = {}) => {
    const room = rooms.get(socket.data.roomCode);
    const p = room && room.players.find(pl => pl.id === socket.id);
    if (!p || room.phase !== 'lobby') return;
    if (SKIN_COLORS.includes(color)) p.color = color;
    if (SKIN_PATTERNS.includes(pattern)) p.pattern = pattern;
    broadcastLobby(room);
  });

  socket.on('set-courses', ({ ids } = {}) => {
    const room = hostRoom(socket);
    if (!room || room.phase !== 'lobby' || !Array.isArray(ids)) return;
    const picked = [...new Set(ids)].filter(id => courseById[id]); // keeps the host's order
    if (picked.length === 0) return;
    room.courseIds = picked;
    broadcastLobby(room);
  });

  // weather is cosmetic and can change any time, in the lobby or mid-game
  socket.on('set-weather', ({ weather } = {}, cb) => {
    const room = hostRoom(socket);
    if (!room) return cb && cb({ ok: false, error: 'Only the host can do that' });
    if (!WEATHERS.includes(weather)) return cb && cb({ ok: false, error: 'Unknown weather' });
    room.weather = weather;
    broadcastLobby(room);
    if (room.phase !== 'lobby') broadcastState(room);
    cb && cb({ ok: true });
  });

  socket.on('start-game', () => {
    const room = hostRoom(socket);
    if (!room || room.phase !== 'lobby' || room.players.length < 1) return;
    room.holeIndex = 0;
    for (const p of room.players) { p.strokesTotal = 0; p.scores = []; }
    startHole(room);
    ensureLoop(room);
  });

  // ----- in-game host controls -----
  socket.on('restart-hole', (_, cb) => {
    const room = hostRoom(socket);
    if (!room) return cb && cb({ ok: false, error: 'Only the host can do that' });
    if (room.phase !== 'aiming' && room.phase !== 'rolling') return cb && cb({ ok: false, error: 'Wait for the next hole' });
    startHole(room);
    cb && cb({ ok: true });
  });

  socket.on('change-course', ({ id } = {}, cb) => {
    const room = hostRoom(socket);
    if (!room) return cb && cb({ ok: false, error: 'Only the host can do that' });
    if (room.phase !== 'aiming' && room.phase !== 'rolling') return cb && cb({ ok: false, error: 'Wait for the next hole' });
    if (!courseById[id]) return cb && cb({ ok: false, error: 'Unknown course' });
    room.courseIds[room.holeIndex] = id;
    startHole(room);
    cb && cb({ ok: true });
  });

  socket.on('end-game', (_, cb) => {
    const room = hostRoom(socket);
    if (!room || room.phase === 'lobby') return cb && cb({ ok: false });
    returnToLobby(room);
    cb && cb({ ok: true });
  });

  socket.on('shoot', ({ dx, dy, power } = {}) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.phase !== 'aiming') return;
    if (![dx, dy, power].every(Number.isFinite) || Math.hypot(dx, dy) < 0.001) return;
    if (room.turnOrder[room.turnPtr] !== socket.id) return;
    const shooter = room.players.find(p => p.id === socket.id);
    if (!shooter || shooter.moving || shooter.sunk) return;

    room.lastShotStart = { x: shooter.x, y: shooter.y };
    shooter.strokesHole += 1;
    applyShot(shooter, dx, dy, power);
    room.phase = 'rolling';
    broadcastState(room);
  });

  socket.on('disconnect', () => leaveCurrentRoom(socket));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Putt Battle running on port ${PORT}`));
