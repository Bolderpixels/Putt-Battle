// Course definitions for Putt Battle, inspired by Golf Battle (Miniclip).
// Coordinate space is in course units (not pixels); the client maps (x, y) onto
// the 3D ground plane as (x, z).

const BALL_R = 10;
const HOLE_R = 16;
const WALL_HALF = 6; // half the visible wall thickness; balls bounce off the wall surface

function wallsFromRect(x, y, w, h) {
  return [
    { x1: x, y1: y, x2: x + w, y2: y },
    { x1: x + w, y1: y, x2: x + w, y2: y + h },
    { x1: x + w, y1: y + h, x2: x, y2: y + h },
    { x1: x, y1: y + h, x2: x, y2: y },
  ];
}

const courses = [
  {
    id: 'pine-forest',
    name: 'Pine Forest',
    theme: 'forest',
    par: 2,
    width: 900,
    height: 500,
    start: { x: 110, y: 250 },
    hole: { x: 800, y: 250 },
    walls: [
      ...wallsFromRect(0, 0, 900, 500),
      // narrow gate obstacle in the middle
      { x1: 440, y1: 0, x2: 440, y2: 190 },
      { x1: 460, y1: 500, x2: 460, y2: 310 },
    ],
    hazards: [
      { type: 'sand', shape: 'circle', x: 620, y: 360, r: 55 },
    ],
  },
  {
    id: 'desert-canyon',
    name: 'Desert Canyon',
    theme: 'desert',
    par: 3,
    width: 900,
    height: 500,
    start: { x: 110, y: 440 },
    hole: { x: 800, y: 90 },
    walls: [
      ...wallsFromRect(0, 0, 900, 500),
      // dogleg wall forcing a turn around the middle
      { x1: 330, y1: 0, x2: 330, y2: 330 },
      { x1: 330, y1: 330, x2: 620, y2: 330 },
    ],
    hazards: [
      { type: 'water', shape: 'circle', x: 470, y: 420, r: 60 },
      { type: 'sand', shape: 'circle', x: 700, y: 230, r: 50 },
    ],
  },
  {
    id: 'snow-valley',
    name: 'Snow Valley',
    theme: 'snow',
    par: 3,
    width: 900,
    height: 500,
    start: { x: 450, y: 450 },
    hole: { x: 450, y: 70 },
    walls: [
      ...wallsFromRect(0, 0, 900, 500),
      // S-shaped channel
      { x1: 0, y1: 260, x2: 560, y2: 260 },
      { x1: 900, y1: 160, x2: 340, y2: 160 },
    ],
    hazards: [
      { type: 'ice', shape: 'rect', x: 0, y: 0, w: 900, h: 150 },
    ],
  },
  {
    id: 'meadow-zigzag',
    name: 'Meadow Zigzag',
    theme: 'forest',
    par: 4,
    width: 900,
    height: 500,
    start: { x: 90, y: 250 },
    hole: { x: 820, y: 250 },
    walls: [
      ...wallsFromRect(0, 0, 900, 500),
      // three baffles force a zigzag: low, high, low
      { x1: 300, y1: 0, x2: 300, y2: 320 },
      { x1: 520, y1: 500, x2: 520, y2: 180 },
      { x1: 720, y1: 0, x2: 720, y2: 300 },
    ],
    hazards: [
      { type: 'sand', shape: 'circle', x: 410, y: 420, r: 50 },
      { type: 'water', shape: 'circle', x: 620, y: 390, r: 50 },
    ],
  },
  {
    id: 'mesa-maze',
    name: 'Mesa Maze',
    theme: 'desert',
    par: 4,
    width: 900,
    height: 500,
    start: { x: 150, y: 440 },
    hole: { x: 820, y: 80 },
    walls: [
      ...wallsFromRect(0, 0, 900, 500),
      // switchback corridors: up on the left, across the middle, up on the right
      { x1: 0, y1: 170, x2: 600, y2: 170 },
      { x1: 300, y1: 330, x2: 900, y2: 330 },
    ],
    hazards: [
      { type: 'water', shape: 'circle', x: 150, y: 250, r: 40 },
      { type: 'sand', shape: 'circle', x: 700, y: 250, r: 50 },
    ],
  },
  {
    id: 'frozen-lake',
    name: 'Frozen Lake',
    theme: 'snow',
    par: 3,
    width: 900,
    height: 500,
    start: { x: 90, y: 250 },
    hole: { x: 810, y: 250 },
    walls: [
      ...wallsFromRect(0, 0, 900, 500),
      // ice pillars to bank off
      { x1: 300, y1: 60, x2: 300, y2: 200 },
      { x1: 500, y1: 300, x2: 500, y2: 440 },
      { x1: 660, y1: 100, x2: 660, y2: 220 },
    ],
    hazards: [
      // water first: the first matching hazard wins in physics
      { type: 'water', shape: 'circle', x: 420, y: 250, r: 55 },
      { type: 'ice', shape: 'rect', x: 150, y: 0, w: 600, h: 500 },
    ],
  },
];

const courseById = Object.fromEntries(courses.map(c => [c.id, c]));

module.exports = { courses, courseById, BALL_R, HOLE_R, WALL_HALF };
