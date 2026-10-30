const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { courses } = require('./courses');
const { stepBall, applyShot } = require('./physics');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(__dirname + '/public'));

const PLAYER_COLORS = ['#ff5252', '#4fc3f7', '#ffca28', '#66bb6a', '#ba68c8', '#ff8a65'];
const MAX_PLAYERS = 6;
const MAX_STROKES_PER_HOLE = 8;
const TICK_MS = 1000 / 60;

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

function newRoom(code, hostId) {
  return {
    code,
    hostId,
    players: [], // { id, name, color, strokesTotal, strokesHole, sunk, ballx, bally }
    holeIndex: 0,
    turnOrder: [],
    turnPtr: 0,
    phase: 'lobby', // lobby | aiming | rolling | hole-summary | game-over
    loop: null,
    lastShotStart: null, // { x, y } for current shooter, used for water penalty reset
  };
}

function publicPlayers(room) {
  return room.players.map(p => ({
    id: p.id, name: p.name, color: p.color,
    strokesTotal: p.strokesTotal, strokesHole: p.strokesHole,
    sunk: p.sunk, x: p.x, y: p.y, moving: p.moving,
  }));
}

function scoreboard(room) {
  // Rank by (holes completed desc is implicit since same holeIndex) strokesTotal+strokesHole asc
  return [...room.players]
    .sort((a, b) => (a.strokesTotal + a.strokesHole) - (b.strokesTotal + b.strokesHole))
    .map((p, i) => ({ id: p.id, name: p.name, rank: i + 1 }));
}

function broadcastState(room) {
  io.to(room.code).emit('state-update', {
    players: publicPlayers(room),
    scoreboard: scoreboard(room),
    currentTurn: room.turnOrder[room.turnPtr] || null,
    phase: room.phase,
  });
}

function currentCourse(room) {
  return courses[room.holeIndex];
}

function startHole(room) {
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
    totalHoles: courses.length,
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
  for (const p of room.players) p.strokesTotal += p.strokesHole;
  room.phase = 'hole-summary';
  io.to(room.code).emit('hole-complete', {
    holeIndex: room.holeIndex,
    par: currentCourse(room).par,
    players: room.players.map(p => ({ id: p.id, name: p.name, strokes: p.strokesHole, total: p.strokesTotal })),
  });
  broadcastState(room);

  setTimeout(() => {
    if (!rooms.has(room.code)) return;
    room.holeIndex += 1;
    if (room.holeIndex >= courses.length) {
      room.phase = 'game-over';
      io.to(room.code).emit('game-over', { scoreboard: scoreboard(room), players: room.players });
    } else {
      startHole(room);
    }
  }, 4500);
}

function ensureLoop(room) {
  if (room.loop) return;
  room.loop = setInterval(() => {
    const course = currentCourse(room);
    const shooterId = room.turnOrder[room.turnPtr];
    const shooter = room.players.find(p => p.id === shooterId);
    if (!shooter || !shooter.moving) return;

    const dt = TICK_MS / 1000;
    const event = stepBall(shooter, course, dt);

    if (event === 'water') {
      shooter.strokesHole += 1;
      shooter.x = room.lastShotStart.x;
      shooter.y = room.lastShotStart.y;
      io.to(room.code).emit('splash', { playerId: shooter.id });
      broadcastState(room);
      maybeForceAdvance(room, shooter);
      return;
    }

    if (event === 'sunk') {
      broadcastState(room);
      setTimeout(() => advanceTurn(room), 500);
      return;
    }

    if (event === 'stopped') {
      if (shooter.strokesHole >= MAX_STROKES_PER_HOLE) {
        shooter.sunk = true; // pick up ball, counts as finished
      }
      broadcastState(room);
      setTimeout(() => advanceTurn(room), 350);
      return;
    }

    broadcastState(room);
  }, TICK_MS);
}

function maybeForceAdvance(room, shooter) {
  if (shooter.strokesHole >= MAX_STROKES_PER_HOLE) {
    shooter.sunk = true;
    setTimeout(() => advanceTurn(room), 400);
  } else {
    setTimeout(() => advanceTurn(room), 400);
  }
}

io.on('connection', (socket) => {
  socket.on('create-room', ({ name }, cb) => {
    const code = makeRoomCode();
    const room = newRoom(code, socket.id);
    rooms.set(code, room);
    socket.join(code);
    socket.data.roomCode = code;
    const color = PLAYER_COLORS[0];
    room.players.push({
      id: socket.id, name: (name || 'Player').slice(0, 16), color,
      strokesTotal: 0, strokesHole: 0, sunk: false, x: 0, y: 0, vx: 0, vy: 0, moving: false,
    });
    cb && cb({ ok: true, code, players: publicPlayers(room), isHost: true });
  });

  socket.on('join-room', ({ code, name }, cb) => {
    const room = rooms.get((code || '').toUpperCase());
    if (!room) return cb && cb({ ok: false, error: 'Room not found' });
    if (room.phase !== 'lobby') return cb && cb({ ok: false, error: 'Game already started' });
    if (room.players.length >= MAX_PLAYERS) return cb && cb({ ok: false, error: 'Room is full' });

    socket.join(room.code);
    socket.data.roomCode = room.code;
    const color = PLAYER_COLORS[room.players.length % PLAYER_COLORS.length];
    room.players.push({
      id: socket.id, name: (name || 'Player').slice(0, 16), color,
      strokesTotal: 0, strokesHole: 0, sunk: false, x: 0, y: 0, vx: 0, vy: 0, moving: false,
    });
    io.to(room.code).emit('lobby-update', { players: publicPlayers(room) });
    cb && cb({ ok: true, code: room.code, players: publicPlayers(room), isHost: false });
  });

  socket.on('start-game', () => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.hostId !== socket.id || room.players.length < 1) return;
    room.holeIndex = 0;
    for (const p of room.players) { p.strokesTotal = 0; }
    startHole(room);
    ensureLoop(room);
  });

  socket.on('shoot', ({ dx, dy, power }) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.phase !== 'aiming') return;
    const shooterId = room.turnOrder[room.turnPtr];
    if (shooterId !== socket.id) return;
    const shooter = room.players.find(p => p.id === socket.id);
    if (!shooter || shooter.moving || shooter.sunk) return;

    room.lastShotStart = { x: shooter.x, y: shooter.y };
    shooter.strokesHole += 1;
    applyShot(shooter, dx, dy, power);
    room.phase = 'rolling';
    broadcastState(room);
  });

  socket.on('disconnect', () => {
    const code = socket.data.roomCode;
    const room = rooms.get(code);
    if (!room) return;
    room.players = room.players.filter(p => p.id !== socket.id);
    room.turnOrder = room.turnOrder.filter(id => id !== socket.id);
    if (room.players.length === 0) {
      if (room.loop) clearInterval(room.loop);
      rooms.delete(code);
      return;
    }
    if (room.hostId === socket.id) room.hostId = room.players[0].id;
    if (room.turnPtr >= room.turnOrder.length) room.turnPtr = 0;
    io.to(room.code).emit('lobby-update', { players: publicPlayers(room) });
    broadcastState(room);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Putt Battle running on port ${PORT}`));
