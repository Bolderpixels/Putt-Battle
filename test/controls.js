// Tests lobby setup, host controls, and leaving mid-game. Expects the server on :3000.
const { io } = require('socket.io-client');
const assert = require('assert');

const URL = process.env.URL || 'http://localhost:3000';
const connect = () => new Promise(res => { const s = io(URL, { forceNew: true }); s.on('connect', () => res(s)); });
const call = (s, ev, data) => new Promise(res => s.emit(ev, data, res));
const once = (s, ev, ms = 3000) => new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error(`timeout waiting for ${ev}`)), ms);
  s.once(ev, d => { clearTimeout(t); res(d); });
});
const sleep = ms => new Promise(r => setTimeout(r, ms));

// latest state-update per socket
function trackState(s) { s.latest = null; s.on('state-update', d => { s.latest = d; }); }
async function waitFor(fn, ms = 3000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (fn()) return; await sleep(20); }
  throw new Error('waitFor timed out');
}

(async () => {
  const [a, b, c] = await Promise.all([connect(), connect(), connect()]);
  [a, b, c].forEach(trackState);

  const catalog = await (await fetch(URL + '/api/courses')).json();
  assert(catalog.courses.length >= 30, 'at least 30 courses to choose from, got ' + catalog.courses.length);
  assert(catalog.weathers.includes('rain') && catalog.weathers.includes('night'), 'weather list');

  const created = await call(a, 'create-room', { name: 'Alice<script>' });
  assert(created.ok && created.isHost, 'create');
  assert.strictEqual(created.players[0].name, 'Alicescript', 'name sanitised');
  const code = created.code;
  assert.deepStrictEqual(created.courseIds, ['pine-forest', 'desert-canyon', 'snow-valley']);

  assert((await call(b, 'join-room', { code, name: 'Bob' })).ok, 'b join');
  assert((await call(c, 'join-room', { code, name: 'Cy' })).ok, 'c join');

  // skins: whitelist enforced, picks stick
  b.emit('set-skin', { color: '#ff4b4b', pattern: 'hoops' });
  b.emit('set-skin', { color: 'javascript:1', pattern: 'nope' });
  await sleep(100);
  let lob = await call(c, 'join-room', { code, name: 'Cy' }); // re-join same room is a no-op
  const bob = lob.players.find(p => p.name === 'Bob');
  assert.strictEqual(bob.pattern, 'hoops', 'pattern applied');
  assert.strictEqual(bob.color, '#ff4b4b', 'bad colour ignored');

  // course selection: host only, catalogue order, at least one
  b.emit('set-courses', { ids: ['frozen-lake'] });
  await sleep(100);
  a.emit('set-courses', { ids: ['mesa-maze', 'pine-forest'] });
  await sleep(100);
  a.emit('set-courses', { ids: [] });
  await sleep(100);
  lob = await call(a, 'join-room', { code, name: 'Alice' });
  assert.deepStrictEqual(lob.courseIds, ['mesa-maze', 'pine-forest'], 'host picked courses, in the host order');
  assert.strictEqual(lob.weather, 'clear', 'default weather');

  // weather: host only, validated, visible to everyone, works any time
  b.emit('set-weather', { weather: 'rain' });
  await sleep(100);
  assert.strictEqual((await call(a, 'join-room', { code, name: 'Alice' })).weather, 'clear', 'non-host cannot change weather');
  assert.strictEqual((await call(a, 'set-weather', { weather: 'tornado' })).ok, false, 'unknown weather rejected');
  const heard = once(c, 'lobby-update');
  assert((await call(a, 'set-weather', { weather: 'night' })).ok, 'host sets weather');
  assert.strictEqual((await heard).weather, 'night', 'guests are told');

  // start; host-only
  b.emit('start-game');
  await sleep(150);
  assert(!a.latest, 'non-host cannot start');
  const holeStart = once(a, 'hole-start');
  a.emit('start-game');
  const hs = await holeStart;
  assert.strictEqual(hs.course.id, 'mesa-maze', 'first hole is the host first pick');
  assert.strictEqual(hs.totalHoles, 2);
  await waitFor(() => a.latest && a.latest.phase === 'aiming');

  const wx = once(b, 'state-update');
  assert((await call(a, 'set-weather', { weather: 'snow' })).ok, 'weather mid-game');
  assert.strictEqual((await wx).weather, 'snow', 'state-update carries weather');

  // restart: host only
  assert.strictEqual((await call(b, 'restart-hole')).ok, false, 'non-host restart rejected');
  const again = once(a, 'hole-start');
  assert((await call(a, 'restart-hole')).ok, 'host restart');
  assert.strictEqual((await again).course.id, 'mesa-maze');

  // change course: host only, validated, replaces the current hole
  assert.strictEqual((await call(b, 'change-course', { id: 'frozen-lake' })).ok, false, 'non-host change rejected');
  assert.strictEqual((await call(a, 'change-course', { id: 'bogus' })).ok, false, 'unknown course rejected');
  const changed = once(a, 'hole-start');
  assert((await call(a, 'change-course', { id: 'frozen-lake' })).ok, 'host change');
  assert.strictEqual((await changed).course.id, 'frozen-lake');

  // shooter (A, turn 0) leaves mid-roll: game must not freeze, turn moves on
  const shooterTurn = a.latest.currentTurn;
  assert.strictEqual(shooterTurn, a.id, 'host shoots first');
  const aId = a.id;
  a.emit('shoot', { dx: 100, dy: 0, power: 0.9 });
  await sleep(120);
  await call(a, 'leave-room');
  await waitFor(() => b.latest && !b.latest.players.find(p => p.id === aId));
  await waitFor(() => b.latest.phase === 'aiming' && b.latest.currentTurn && b.latest.currentTurn !== aId, 4000);
  assert.strictEqual(b.latest.hostId, b.id, 'host passed to next player');
  console.log('turn after shooter left ->', b.latest.currentTurn === b.id ? 'Bob' : 'Cy');

  // new host can end the game for everyone -> lobby, scores reset
  const back = once(c, 'return-lobby');
  assert((await call(b, 'end-game')).ok, 'new host ends game');
  const lobbyData = await back;
  assert.strictEqual(lobbyData.players.length, 2);
  assert(lobbyData.players.every(p => p.strokesTotal === 0));

  // a player can quit from the lobby; last player leaving removes the room
  await call(c, 'leave-room');
  await call(b, 'leave-room');
  const d = await connect();
  assert.strictEqual((await call(d, 'join-room', { code, name: 'Dee' })).ok, false, 'empty room is gone');

  console.log('ALL CONTROL TESTS PASSED');
  process.exit(0);
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
