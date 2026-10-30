// Checks every course is legal and actually playable, using the real server physics.
// Static checks: start/hole inside bounds, clear of walls, not in water.
// Search: breadth-first over many candidate shots (water shots are discarded, as they
// cost a stroke and reset) to find the fewest strokes that can sink the ball.
//   node test/playable.js            all courses
//   node test/playable.js mesa-maze  only the named courses
const { courses, BALL_R, HOLE_R, WALL_HALF } = require('../courses');
const { stepBall, applyShot, terrainAt } = require('../physics');

const MAX_DEPTH = 9;
const CELL = 22;
const MAX_STEPS = 1200;
const DT = 1 / 60;

function distToSeg(px, py, w) {
  const dx = w.x2 - w.x1, dy = w.y2 - w.y1;
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((px - w.x1) * dx + (py - w.y1) * dy) / l2)) : 0;
  return Math.hypot(px - (w.x1 + t * dx), py - (w.y1 + t * dy));
}

function staticChecks(c) {
  const problems = [];
  for (const [label, p] of [['start', c.start], ['hole', c.hole]]) {
    if (p.x < 30 || p.y < 30 || p.x > c.width - 30 || p.y > c.height - 30) problems.push(`${label} too close to the edge`);
    for (const w of c.walls) {
      if (distToSeg(p.x, p.y, w) < BALL_R + WALL_HALF + (label === 'hole' ? HOLE_R : 8)) { problems.push(`${label} touches a wall`); break; }
    }
    const t = terrainAt(p.x, p.y, c);
    if (t && t.type === 'water') problems.push(`${label} is in water`);
  }
  const t = terrainAt(c.hole.x, c.hole.y, c);
  if (t && t.type === 'sand') problems.push('hole is in sand');
  return problems;
}

function shotsFrom(c, x, y) {
  const shots = [];
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * Math.PI * 2;
    for (const p of [0.3, 0.6, 1]) shots.push([Math.cos(a), Math.sin(a), p]);
  }
  const base = Math.atan2(c.hole.y - y, c.hole.x - x);
  const d = Math.hypot(c.hole.x - x, c.hole.y - y);
  const exact = d / 295; // power that rolls about d on plain turf
  for (const da of [0, 0.01, -0.01, 0.025, -0.025, 0.05, -0.05]) {
    for (const k of [0.5, 0.75, 0.9, 1, 1.1, 1.25, 1.5]) {
      shots.push([Math.cos(base + da), Math.sin(base + da), Math.min(1, exact * k)]);
    }
  }
  return shots;
}

function simulate(c, x, y, dx, dy, power) {
  const ball = { x, y, vx: 0, vy: 0, moving: false, sunk: false };
  applyShot(ball, dx, dy, power);
  for (let i = 0; i < MAX_STEPS; i++) {
    const ev = stepBall(ball, c, DT);
    if (ev === 'sunk') return { ev, x: ball.x, y: ball.y };
    if (ev === 'water') return { ev };
    if (ev === 'stopped') return { ev, x: ball.x, y: ball.y };
  }
  return { ev: 'stopped', x: ball.x, y: ball.y };
}

function minStrokes(c) {
  let frontier = [{ x: c.start.x, y: c.start.y }];
  const seen = new Set([`${Math.round(c.start.x / CELL)},${Math.round(c.start.y / CELL)}`]);
  for (let depth = 1; depth <= MAX_DEPTH; depth++) {
    const next = [];
    for (const s of frontier) {
      for (const [dx, dy, p] of shotsFrom(c, s.x, s.y)) {
        const r = simulate(c, s.x, s.y, dx, dy, p);
        if (r.ev === 'sunk') return depth;
        if (r.ev !== 'stopped') continue;
        const key = `${Math.round(r.x / CELL)},${Math.round(r.y / CELL)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        next.push({ x: r.x, y: r.y });
      }
    }
    frontier = next;
    if (!frontier.length) break;
  }
  return null;
}

const only = process.argv.slice(2);
let bad = 0;
for (const c of courses) {
  if (only.length && !only.includes(c.id)) continue;
  const t0 = Date.now();
  const problems = staticChecks(c);
  const best = problems.length ? null : minStrokes(c);
  const ok = !problems.length && best !== null;
  if (!ok) bad++;
  console.log(
    `${ok ? 'ok  ' : 'FAIL'} ${c.id.padEnd(22)} par ${c.par}  best found: ${best === null ? 'none' : best}` +
    `${problems.length ? '  ' + problems.join('; ') : ''}  (${((Date.now() - t0) / 1000).toFixed(1)}s)`,
  );
}
console.log(bad ? `${bad} course(s) failed` : 'ALL COURSES PLAYABLE');
process.exit(bad ? 1 : 0);
