// Server-authoritative ball physics for Putt Battle.
const { BALL_R, HOLE_R } = require('./courses');

const STOP_EPS = 4;       // speed below which a ball is considered stopped (units/sec)
const SINK_SPEED = 260;   // max speed to sink the ball
const MAX_SPEED = 620;    // cap on shot speed
const WALL_RESTITUTION = 0.72;

function hypot(x, y) { return Math.sqrt(x * x + y * y); }

function closestPointOnSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return { x: x1, y: y1 };
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return { x: x1 + t * dx, y: y1 + t * dy };
}

function pointInCircle(px, py, cx, cy, r) {
  return hypot(px - cx, py - cy) <= r;
}

function pointInRect(px, py, rx, ry, rw, rh) {
  return px >= rx && px <= rx + rw && py >= ry && py <= ry + rh;
}

function terrainAt(px, py, course) {
  for (const hz of course.hazards || []) {
    const inside = hz.shape === 'circle'
      ? pointInCircle(px, py, hz.x, hz.y, hz.r)
      : pointInRect(px, py, hz.x, hz.y, hz.w, hz.h);
    if (inside) return hz;
  }
  return null;
}

function frictionFor(terrainType) {
  if (terrainType === 'sand') return 0.82;
  if (terrainType === 'ice') return 0.992;
  return 0.965;
}

// Advances a ball by dt seconds. Mutates and returns ball.
// ball: { x, y, vx, vy, moving, sunk }
// Returns an event string if something notable happened: 'sunk' | 'water' | null
function stepBall(ball, course, dt) {
  if (!ball.moving || ball.sunk) return null;

  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;

  // Wall collisions
  for (const wall of course.walls) {
    const cp = closestPointOnSegment(ball.x, ball.y, wall.x1, wall.y1, wall.x2, wall.y2);
    const dx = ball.x - cp.x, dy = ball.y - cp.y;
    const dist = hypot(dx, dy);
    if (dist < BALL_R && dist > 0.0001) {
      const nx = dx / dist, ny = dy / dist;
      const overlap = BALL_R - dist;
      ball.x += nx * overlap;
      ball.y += ny * overlap;
      const vn = ball.vx * nx + ball.vy * ny;
      if (vn < 0) {
        ball.vx -= 2 * vn * nx;
        ball.vy -= 2 * vn * ny;
        ball.vx *= WALL_RESTITUTION;
        ball.vy *= WALL_RESTITUTION;
      }
    }
  }

  // Terrain friction
  const terrain = terrainAt(ball.x, ball.y, course);
  const terrainType = terrain ? terrain.type : 'normal';

  // Water hazard: splash, reset to last safe spot with penalty (handled by caller)
  if (terrainType === 'water') {
    ball.vx = 0; ball.vy = 0; ball.moving = false;
    return 'water';
  }

  const friction = frictionFor(terrainType);
  ball.vx *= friction;
  ball.vy *= friction;

  const speed = hypot(ball.vx, ball.vy);

  // Hole sink check
  const dToHole = hypot(ball.x - course.hole.x, ball.y - course.hole.y);
  if (dToHole < HOLE_R && speed < SINK_SPEED) {
    ball.x = course.hole.x;
    ball.y = course.hole.y;
    ball.vx = 0; ball.vy = 0;
    ball.moving = false;
    ball.sunk = true;
    return 'sunk';
  }

  if (speed < STOP_EPS) {
    ball.vx = 0; ball.vy = 0;
    ball.moving = false;
    return 'stopped';
  }

  return null;
}

function applyShot(ball, dx, dy, power) {
  const len = hypot(dx, dy) || 1;
  const p = Math.max(0.05, Math.min(1, power));
  const speed = p * MAX_SPEED;
  ball.vx = (dx / len) * speed;
  ball.vy = (dy / len) * speed;
  ball.moving = true;
  ball.sunk = false;
}

module.exports = { stepBall, applyShot, terrainAt, MAX_SPEED, STOP_EPS };
