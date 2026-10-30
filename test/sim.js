// Automated smoke test: two players play through all three holes.
const { io } = require('socket.io-client');

const URL = process.env.URL || 'http://localhost:3000';
const a = io(URL);
const b = io(URL);

let code;
let aIsTurn = false;
let bIsTurn = false;
let holesSeen = 0;
let gameOverSeen = false;

function log(...args) { console.log(...args); }

function shootTowardHole(socket, me, course) {
  if (!me || !course) return;
  // Simulate a pull-back: drag point sits behind the ball, opposite the hole.
  const toHoleX = course.hole.x - me.x;
  const toHoleY = course.hole.y - me.y;
  const len = Math.hypot(toHoleX, toHoleY) || 1;
  const dirX = toHoleX / len, dirY = toHoleY / len;
  const jitter = (Math.random() - 0.5) * 0.08; // slight imperfect aim
  const aimX = dirX + jitter, aimY = dirY - jitter * 0.4;
  const dragPointX = me.x - aimX * 120;
  const dragPointY = me.y - aimY * 120;
  const dx = me.x - dragPointX;
  const dy = me.y - dragPointY;
  const power = Math.min(1, len / 500) + 0.15;
  socket.emit('shoot', { dx, dy, power });
}

let courseA = null, courseB = null;
let lastStateA = null, lastStateB = null;

a.on('connect', () => {
  a.emit('create-room', { name: 'Alice' }, (res) => {
    if (!res.ok) { log('A create failed', res); process.exit(1); }
    code = res.code;
    log('Room created:', code);
    b.emit('join-room', { code, name: 'Bob' }, (res2) => {
      if (!res2.ok) { log('B join failed', res2); process.exit(1); }
      log('B joined OK');
      a.emit('start-game');
    });
  });
});

a.on('hole-start', (data) => { courseA = data.course; holesSeen++; log('[A] hole-start', data.course.name); });
b.on('hole-start', (data) => { courseB = data.course; });

let aShotPending = false;
a.on('state-update', (data) => {
  lastStateA = data;
  log('[A state]', data.phase, 'turn=', data.currentTurn === a.id ? 'A' : data.currentTurn === b.id ? 'B' : data.currentTurn);
  if (data.currentTurn === a.id && data.phase === 'aiming' && !aShotPending) {
    aShotPending = true;
    const me = data.players.find(p => p.id === a.id);
    setTimeout(() => { aShotPending = false; shootTowardHole(a, me, courseA); }, 50);
  }
});
b.on('state-update', (data) => {
  lastStateB = data;
  if (data.currentTurn === b.id && data.phase === 'aiming') {
    const me = data.players.find(p => p.id === b.id);
    setTimeout(() => shootTowardHole(b, me, courseB), 50);
  }
});

a.on('hole-complete', (data) => log('[hole-complete]', data.holeIndex, data.players.map(p => `${p.name}:${p.strokes}`)));
a.on('splash', (d) => log('[splash]', d.playerId));

a.on('game-over', (data) => {
  log('[GAME OVER]', data.players.map(p => `${p.name}:${p.strokesTotal}`));
  gameOverSeen = true;
  setTimeout(() => process.exit(0), 200);
});

setTimeout(() => {
  if (!gameOverSeen) {
    log('TIMEOUT - game did not finish. holesSeen=', holesSeen);
    log('lastStateA', JSON.stringify(lastStateA));
    process.exit(1);
  }
}, 420000);
