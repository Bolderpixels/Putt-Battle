// Course definitions for Putt Battle, inspired by Golf Battle (Miniclip).
// Coordinate space is in course units (not pixels); the client maps (x, y) onto
// the 3D ground plane as (x, z).

const BALL_R = 7;
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

// ---------- more courses ----------
// Inspired by the variety on real course lists (Japan, Korea, Thailand, Vietnam, China, USA):
// regional themes and signature hazards, all drawn as small mini-golf layouts.
const S = (x1, y1, x2, y2) => ({ x1, y1, x2, y2 });
const box = (x, y, w, h) => wallsFromRect(x, y, w, h);
const sand = (x, y, r) => ({ type: 'sand', shape: 'circle', x, y, r });
const water = (x, y, r) => ({ type: 'water', shape: 'circle', x, y, r });
const waterRect = (x, y, w, h) => ({ type: 'water', shape: 'rect', x, y, w, h });
const ice = (x, y, w, h) => ({ type: 'ice', shape: 'rect', x, y, w, h });

function make({ id, name, theme, par, w = 900, h = 500, start, hole, walls = [], hazards = [] }) {
  return {
    id, name, theme, par, width: w, height: h, start, hole,
    walls: [...wallsFromRect(0, 0, w, h), ...walls],
    hazards,
  };
}

courses.push(
  make({ id: 'kyoto-garden', name: 'Kyoto Garden', theme: 'autumn', par: 3,
    start: { x: 80, y: 250 }, hole: { x: 820, y: 250 },
    walls: [S(450, 140, 450, 360)],
    hazards: [water(660, 250, 60), sand(300, 90, 40), sand(300, 410, 40)] }),
  make({ id: 'seoul-switchbacks', name: 'Seoul Switchbacks', theme: 'autumn', par: 4, w: 700,
    start: { x: 80, y: 430 }, hole: { x: 80, y: 70 },
    walls: [S(0, 165, 500, 165), S(200, 335, 700, 335)],
    hazards: [sand(620, 250, 35), sand(100, 250, 30)] }),
  make({ id: 'chiang-mai-highlands', name: 'Chiang Mai Highlands', theme: 'tropical', par: 3,
    start: { x: 80, y: 250 }, hole: { x: 830, y: 250 },
    walls: [S(330, 500, 520, 320), S(560, 0, 750, 180)],
    hazards: [water(450, 130, 55), sand(660, 350, 50)] }),
  make({ id: 'mekong-delta', name: 'Mekong Delta', theme: 'tropical', par: 3,
    start: { x: 100, y: 420 }, hole: { x: 820, y: 80 },
    hazards: [waterRect(400, 0, 100, 200), waterRect(400, 300, 100, 200), sand(700, 300, 50)] }),
  make({ id: 'pearl-river', name: 'Pearl River Fortress', theme: 'tropical', par: 3,
    start: { x: 80, y: 250 }, hole: { x: 450, y: 250 },
    walls: [S(350, 150, 550, 150), S(550, 150, 550, 350), S(550, 350, 350, 350), S(350, 150, 350, 215), S(350, 285, 350, 350)],
    hazards: [water(200, 100, 50), water(200, 400, 50), sand(450, 60, 40), sand(450, 440, 40)] }),
  make({ id: 'tianjin-twist', name: 'Tianjin Twist', theme: 'desert', par: 4, w: 700,
    start: { x: 60, y: 420 }, hole: { x: 60, y: 80 },
    walls: [S(0, 250, 520, 250)],
    hazards: [water(610, 250, 40), sand(300, 420, 40), sand(300, 80, 40)] }),
  make({ id: 'aoshima-isles', name: 'Aoshima Isles', theme: 'tropical', par: 3,
    start: { x: 80, y: 250 }, hole: { x: 820, y: 250 },
    hazards: [water(350, 120, 60), water(350, 380, 60), water(550, 250, 70), water(700, 90, 50), water(700, 410, 50)] }),
  make({ id: 'akagi-peaks', name: 'Akagi Peaks', theme: 'snow', par: 3,
    start: { x: 80, y: 100 }, hole: { x: 830, y: 400 },
    walls: [S(300, 500, 450, 220), S(550, 0, 700, 280)],
    hazards: [water(620, 420, 45), ice(0, 0, 900, 500)] }),
  make({ id: 'beppu-springs', name: 'Beppu Hot Springs', theme: 'snow', par: 3, w: 600, h: 800,
    start: { x: 300, y: 740 }, hole: { x: 300, y: 60 },
    hazards: [water(180, 600, 55), water(430, 600, 55), water(300, 450, 55), water(150, 300, 55), water(450, 300, 55), water(300, 170, 55)] }),
  make({ id: 'bay-hill-lagoon', name: 'Bay Hill Lagoon', theme: 'tropical', par: 3,
    start: { x: 80, y: 250 }, hole: { x: 820, y: 250 },
    walls: [S(350, 0, 350, 90), S(350, 500, 350, 410)],
    hazards: [water(450, 250, 125)] }),
  make({ id: 'aviara-canyon', name: 'Aviara Canyon', theme: 'desert', par: 3,
    start: { x: 80, y: 440 }, hole: { x: 820, y: 420 },
    walls: [S(0, 330, 330, 170), ...box(400, 160, 140, 140), ...box(620, 300, 100, 60)],
    hazards: [sand(250, 300, 45), sand(560, 430, 45)] }),
  make({ id: 'southern-dunes', name: 'Southern Dunes', theme: 'desert', par: 4,
    start: { x: 60, y: 250 }, hole: { x: 850, y: 250 },
    hazards: [sand(250, 150, 55), sand(250, 350, 55), sand(450, 250, 60), sand(650, 130, 55), sand(650, 370, 55), sand(790, 250, 35)] }),
  make({ id: 'ak-chin-oasis', name: 'Ak-Chin Oasis', theme: 'desert', par: 3,
    start: { x: 80, y: 420 }, hole: { x: 820, y: 80 },
    walls: [S(200, 0, 200, 330), S(700, 500, 700, 170)],
    hazards: [water(450, 250, 70), sand(450, 430, 40), sand(450, 70, 40)] }),
  make({ id: 'alpensia-slopes', name: 'Alpensia Slopes', theme: 'snow', par: 3, w: 1000, h: 450,
    start: { x: 60, y: 225 }, hole: { x: 940, y: 225 },
    walls: [S(250, 0, 250, 250), S(450, 450, 450, 200), S(650, 0, 650, 250), S(850, 450, 850, 200)],
    hazards: [ice(0, 0, 1000, 450)] }),
  make({ id: 'alpine-pond', name: 'Alpine Pond', theme: 'snow', par: 3,
    start: { x: 80, y: 80 }, hole: { x: 820, y: 420 },
    walls: [S(600, 0, 600, 170)],
    hazards: [water(450, 250, 90), ice(150, 0, 600, 500)] }),
  make({ id: 'amber-hills', name: 'Amber Hills Terraces', theme: 'tropical', par: 3, w: 800, h: 600,
    start: { x: 60, y: 540 }, hole: { x: 740, y: 70 },
    walls: [S(0, 200, 560, 200), S(240, 400, 800, 400)],
    hazards: [water(680, 300, 45), sand(130, 300, 45)] }),
  make({ id: 'jungang-ring', name: 'Jungang Ring Road', theme: 'autumn', par: 3,
    start: { x: 80, y: 250 }, hole: { x: 820, y: 250 },
    walls: box(300, 150, 300, 200),
    hazards: [sand(450, 70, 30), sand(450, 430, 30)] }),
  make({ id: 'anegasaki-bay', name: 'Anegasaki Bay Pier', theme: 'tropical', par: 3,
    start: { x: 80, y: 250 }, hole: { x: 840, y: 250 },
    hazards: [waterRect(600, 0, 300, 210), waterRect(600, 290, 300, 210), sand(400, 150, 45), sand(400, 350, 45)] }),
  make({ id: 'ariji-country', name: 'Ariji Long Hole', theme: 'autumn', par: 5, w: 1000, h: 500,
    start: { x: 60, y: 250 }, hole: { x: 910, y: 430 },
    walls: [S(250, 0, 250, 360), S(500, 500, 500, 140), S(750, 0, 750, 360)],
    hazards: [sand(375, 430, 40), water(620, 60, 45)] }),
  make({ id: 'bear-creek', name: 'Bear Creek Pinball', theme: 'forest', par: 4,
    start: { x: 80, y: 250 }, hole: { x: 820, y: 250 },
    walls: [S(250, 200, 250, 300), S(400, 90, 400, 200), S(400, 300, 400, 410), S(560, 200, 560, 300), S(700, 110, 700, 210), S(700, 290, 700, 390)],
    hazards: [sand(480, 250, 40)] }),
  make({ id: 'orient-pearl', name: 'Orient Pearl', theme: 'autumn', par: 3,
    start: { x: 80, y: 250 }, hole: { x: 820, y: 250 },
    walls: [S(450, 0, 450, 60), S(450, 500, 450, 440)],
    hazards: [water(450, 250, 45), sand(450, 250, 110)] }),
  make({ id: 'tianxing-pearl', name: 'Twin Pearls', theme: 'tropical', par: 3,
    start: { x: 60, y: 420 }, hole: { x: 840, y: 100 },
    walls: [S(450, 0, 450, 170)],
    hazards: [water(300, 160, 40), sand(300, 160, 90), water(600, 340, 40), sand(600, 340, 90), water(780, 430, 40)] }),
  make({ id: 'holiday-links', name: 'Holiday Links', theme: 'forest', par: 3,
    start: { x: 80, y: 250 }, hole: { x: 800, y: 250 },
    walls: [S(300, 0, 300, 120), S(300, 500, 300, 380)],
    hazards: [sand(740, 190, 35), sand(740, 310, 35), sand(700, 250, 30), sand(800, 350, 35), sand(800, 150, 35)] }),
  make({ id: 'bethpage-bunkers', name: 'Black Bunkers', theme: 'forest', par: 3,
    start: { x: 60, y: 250 }, hole: { x: 840, y: 250 },
    walls: [S(480, 0, 480, 100)],
    hazards: [sand(200, 100, 45), sand(300, 380, 55), sand(450, 150, 50), sand(520, 350, 45), sand(650, 220, 55), sand(760, 100, 35), sand(760, 400, 45)] }),
  make({ id: 'apex-challenge', name: 'Apex Challenge', theme: 'desert', par: 5,
    start: { x: 60, y: 440 }, hole: { x: 850, y: 60 },
    walls: [S(220, 500, 320, 150), S(460, 0, 560, 350), S(700, 500, 800, 150)],
    hazards: [water(400, 420, 40), sand(620, 420, 40)] }),
  make({ id: 'acro-court', name: 'Acro Courtyard', theme: 'forest', par: 4, w: 800, h: 700,
    start: { x: 100, y: 640 }, hole: { x: 400, y: 350 },
    walls: [S(250, 200, 550, 200), S(250, 200, 250, 500), S(250, 500, 550, 500), S(550, 200, 550, 310), S(550, 390, 550, 500)],
    hazards: [sand(150, 350, 50), water(680, 200, 40), sand(680, 500, 45)] }),
  make({ id: 'adelscott-cliffs', name: 'Adelscott Cliffs', theme: 'desert', par: 3,
    start: { x: 80, y: 250 }, hole: { x: 820, y: 250 },
    walls: [S(500, 100, 500, 200), S(500, 300, 500, 400)],
    hazards: [waterRect(0, 0, 900, 45), waterRect(0, 455, 900, 45), sand(300, 250, 60), sand(620, 170, 45), sand(620, 330, 45)] }),
  make({ id: 'ashitaka-slalom', name: 'Ashitaka Slalom', theme: 'snow', par: 2, w: 1000, h: 500,
    start: { x: 60, y: 250 }, hole: { x: 930, y: 250 },
    walls: [S(200, 0, 200, 200), S(300, 500, 300, 300), S(420, 0, 420, 200), S(540, 500, 540, 300), S(660, 0, 660, 200), S(780, 500, 780, 300)],
    hazards: [water(870, 380, 40), ice(0, 0, 1000, 500)] }),
);

const courseById = Object.fromEntries(courses.map(c => [c.id, c]));

module.exports = { courses, courseById, BALL_R, HOLE_R, WALL_HALF };
