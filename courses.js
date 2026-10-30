// Course definitions for Putt Battle — three themed holes inspired by
// Golf Battle (Miniclip): Pine Forest, Desert Canyon, Snow Valley.
// Coordinate space is in course units (not pixels); client scales to canvas.

const BALL_R = 10;
const HOLE_R = 16;

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
];

module.exports = { courses, BALL_R, HOLE_R };
