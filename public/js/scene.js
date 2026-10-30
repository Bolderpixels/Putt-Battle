// 3D rendering for Putt Battle (three.js). Course coordinates (x, y) map to the
// ground plane as world (x, 0, y). The server stays authoritative for physics;
// this file only draws, plus turns pointer positions into course coordinates.
import * as THREE from 'three';
import { skinTexture } from './skins.js';

const THEMES = {
  forest: {
    skyTop: '#3d9be0', skyBottom: '#cdeeff', fog: '#cdeeff',
    turfA: '#5cc23f', turfB: '#4aad33', border: '#3b8f2c', dirt: '#8a5a33', far: '#4fae3a',
    wall: '#9a6232', wallTop: '#c0844a', sand: '#efd9a0', sandEdge: '#d9bf82',
  },
  desert: {
    skyTop: '#5aa9ea', skyBottom: '#f6dcae', fog: '#f1d3a0',
    turfA: '#a39a35', turfB: '#8e862b', border: '#6f6a24', dirt: '#b8612f', far: '#d28a4c',
    wall: '#8a5330', wallTop: '#b97b4a', sand: '#f0d596', sandEdge: '#d9b66f',
  },
  snow: {
    skyTop: '#86c4ee', skyBottom: '#eef8ff', fog: '#e6f4ff',
    turfA: '#23a39b', turfB: '#1b8d86', border: '#e9f4fb', dirt: '#8a6a50', far: '#f2f8ff',
    wall: '#7a4c2b', wallTop: '#a67242', sand: '#eef3f6', sandEdge: '#c9d9e3',
  },
  tropical: {
    skyTop: '#2fb0ea', skyBottom: '#d6f7ff', fog: '#d6f7ff',
    turfA: '#7fdc4a', turfB: '#6acb3d', border: '#ecd9a0', dirt: '#c9a469', far: '#f0dfaa',
    wall: '#a8693a', wallTop: '#d08d52', sand: '#f6e7b4', sandEdge: '#e2cd8c',
  },
  autumn: {
    skyTop: '#6fa8e6', skyBottom: '#ffe6c2', fog: '#ffe0b8',
    turfA: '#a9bd3c', turfB: '#94a82f', border: '#c4621f', dirt: '#7a4a2a', far: '#b9772f',
    wall: '#8a5733', wallTop: '#b57c46', sand: '#f0dca6', sandEdge: '#d6bd80',
  },
};

// Cosmetic only: the host picks one and everybody sees it. Physics never changes.
const WEATHER = {
  clear:  { sky: null, fog: null, near: 1600, far: 4600, hemi: 1.55, sun: 2.3, sunColor: '#fff3dc', hemiColor: '#ffffff', precip: null },
  cloudy: { sky: ['#8aa2b8', '#dde5ec'], fog: '#cbd5de', near: 1200, far: 3800, hemi: 1.9, sun: 0.9, sunColor: '#e8eef5', hemiColor: '#f2f6fa', precip: null },
  rain:   { sky: ['#46535f', '#95a2ae'], fog: '#8a96a1', near: 650, far: 2700, hemi: 1.45, sun: 0.55, sunColor: '#c9d6e2', hemiColor: '#dbe6f0', precip: 'rain' },
  snow:   { sky: ['#9aacbf', '#eef3f8'], fog: '#e3ebf2', near: 800, far: 3000, hemi: 1.9, sun: 1.0, sunColor: '#f3f7ff', hemiColor: '#f4f8ff', precip: 'snow' },
  fog:    { sky: ['#bfc9d0', '#e1e6e9'], fog: '#d0d8dc', near: 120, far: 1400, hemi: 1.8, sun: 0.8, sunColor: '#f2f2f2', hemiColor: '#f4f4f4', precip: null },
  sunset: { sky: ['#3a49a0', '#ffae68'], fog: '#f1a66e', near: 1400, far: 4200, hemi: 1.2, sun: 2.0, sunColor: '#ff9a52', hemiColor: '#ffd2a6', precip: null, sunLow: true },
  night:  { sky: ['#060b22', '#1c2d63'], fog: '#0f1b3f', near: 900, far: 3600, hemi: 1.3, sun: 1.25, sunColor: '#8fb0ff', hemiColor: '#8aa2ff', precip: null, stars: true },
};
const PRECIP_DROPS = 900;

const WALL_H = 18;
const PLATFORM_MARGIN = 46;
const PLATFORM_DEPTH = 70;
const TRAIL_POINTS = 30;
const AIM_DOTS = 26;
const PARTICLES = 480;

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function canvasTexture(canvas, { repeat = false } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export class GolfScene {
  constructor(canvas, labelsEl) {
    this.canvas = canvas;
    this.labelsEl = labelsEl;
    this.config = { ballR: 10, holeR: 16, wallHalf: 6 };
    this.mode = 'showcase';
    this.camMode = 'overview';
    this.weather = 'clear';
    this.theme = null;
    this.precip = null;
    this.course = null;
    this.pad = { top: 84, bottom: 124, side: 12 };
    this.turn = { id: null, phase: 'lobby' };
    this.time = 0;
    this.orbit = 0.6;
    this.disposables = [];
    this.balls = new Map();
    this.skinTextures = new Map();
    this.tmpV = new THREE.Vector3();
    this.raycaster = new THREE.Raycaster();
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, 1, 10, 7000);

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x7a9a5a, 1.55);
    this.sun = new THREE.DirectionalLight(0xfff3dc, 2.3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.6;
    this.scene.add(this.hemi, this.sun, this.sun.target);

    this.ballGroup = new THREE.Group();
    this.scene.add(this.ballGroup);

    this._buildParticles();
    this._buildAim();
    this._buildTurnRing();
    this.setConfig(this.config);

    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
    this.resize();

    this._last = performance.now();
    const frame = (now) => {
      const dt = Math.min(0.05, (now - this._last) / 1000);
      this._last = now;
      this._update(dt);
      this.renderer.render(this.scene, this.camera);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  setConfig(config) {
    this.config = { ...this.config, ...config };
    if (this.ballGeo) this.ballGeo.dispose();
    this.ballGeo = new THREE.SphereGeometry(this.config.ballR, 32, 22);
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    if (this.mode === 'play') this._applyPlayCamera();
    else this.camera.updateProjectionMatrix();
  }

  setMode(mode) {
    if (this.mode === mode) return;
    this.mode = mode;
    if (mode === 'play') this._applyPlayCamera();
    else { this.camera.clearViewOffset(); this.camera.fov = 40; this.camera.updateProjectionMatrix(); }
    if (mode !== 'play') this.hideAim();
  }

  // ---------- course ----------
  loadCourse(course) {
    this._disposeCourse();
    this.course = course;
    const th = THEMES[course.theme] || THEMES.forest;
    const { width: w, height: h } = course;
    const group = this.courseGroup = new THREE.Group();
    this.scene.add(group);
    this.waterRipples = [];
    this.flag = null;

    this.theme = th;
    this.hemi.groundColor.set(th.border);

    // turf: big checkerboard like the reference game
    const cell = 50;
    const cols = Math.ceil(w / cell), rows = Math.ceil(h / cell);
    const tc = document.createElement('canvas');
    tc.width = cols * 32; tc.height = rows * 32;
    const tg = tc.getContext('2d');
    for (let r = 0; r < rows; r++) {
      for (let q = 0; q < cols; q++) {
        tg.fillStyle = (r + q) % 2 ? th.turfA : th.turfB;
        tg.fillRect(q * 32, r * 32, 32, 32);
      }
    }
    const turfTex = this._track(canvasTexture(tc));
    const turf = new THREE.Mesh(
      this._track(new THREE.PlaneGeometry(cols * cell, rows * cell).rotateX(-Math.PI / 2)),
      this._track(new THREE.MeshLambertMaterial({ map: turfTex })),
    );
    turf.position.set(cols * cell / 2, 0, rows * cell / 2);
    turf.receiveShadow = true;
    group.add(turf);

    // raised platform with a turf border and rocky sides
    const side = this._track(new THREE.MeshLambertMaterial({ color: th.dirt }));
    const top = this._track(new THREE.MeshLambertMaterial({ color: th.border }));
    const platform = new THREE.Mesh(
      this._track(new THREE.BoxGeometry(w + PLATFORM_MARGIN * 2, PLATFORM_DEPTH, h + PLATFORM_MARGIN * 2)),
      [side, side, top, side, side, side],
    );
    platform.position.set(w / 2, -PLATFORM_DEPTH / 2 - 0.6, h / 2);
    platform.receiveShadow = true;
    group.add(platform);

    const farGround = new THREE.Mesh(
      this._track(new THREE.PlaneGeometry(9000, 9000).rotateX(-Math.PI / 2)),
      this._track(new THREE.MeshLambertMaterial({ color: th.far })),
    );
    farGround.position.set(w / 2, -PLATFORM_DEPTH - 2, h / 2);
    group.add(farGround);

    this._buildHazards(course, th, group);
    this._buildWalls(course, th, group);
    this._buildHole(course, group);
    this._buildTee(course, group);
    this._buildScenery(course, th, group);

    // light + shadow frustum covering the course
    const half = Math.hypot(w, h) / 2 + 40;
    const sc = this.sun.shadow.camera;
    sc.left = -half; sc.right = half; sc.top = half; sc.bottom = -half;
    sc.near = 50; sc.far = 2200;
    sc.updateProjectionMatrix();
    this.sun.target.position.set(w / 2, 0, h / 2);
    this._applyWeather(); // sky, fog, light and precipitation for the current weather

    for (const e of this.balls.values()) e.snap = true;
    if (this.mode === 'play') this._applyPlayCamera();
  }

  _track(obj) { this.disposables.push(obj); return obj; }

  _disposeCourse() {
    if (this.courseGroup) this.scene.remove(this.courseGroup);
    for (const d of this.disposables) d.dispose && d.dispose();
    this.disposables = [];
    this.courseGroup = null;
    if (this.scene.background && this.scene.background.dispose) this.scene.background.dispose();
  }

  setWeather(id) {
    const next = WEATHER[id] ? id : 'clear';
    if (this.weather === next) return;
    this.weather = next;
    this._applyWeather();
  }

  _applyWeather() {
    const th = this.theme;
    if (!th) return;
    const wx = WEATHER[this.weather] || WEATHER.clear;
    const [top, bottom] = wx.sky || [th.skyTop, th.skyBottom];
    this._buildSky(top, bottom, wx.stars);
    this.scene.fog = new THREE.Fog(new THREE.Color(wx.fog || th.fog), wx.near, wx.far);
    this.hemi.intensity = wx.hemi;
    this.hemi.color.set(wx.hemiColor);
    this.sun.intensity = wx.sun;
    this.sun.color.set(wx.sunColor);
    if (this.course) {
      const { width: w, height: h } = this.course;
      this.sun.position.set(w / 2 - (wx.sunLow ? 950 : 380), wx.sunLow ? 360 : 900, h / 2 + 300);
    }
    this._buildPrecip(wx.precip);
  }

  _buildSky(top, bottom, stars) {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 512;
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0, top);
    grad.addColorStop(1, bottom);
    g.fillStyle = grad;
    g.fillRect(0, 0, 512, 512);
    if (stars) {
      const rnd = mulberry32(99);
      for (let i = 0; i < 90; i++) {
        g.fillStyle = `rgba(255,255,255,${0.35 + rnd() * 0.65})`;
        g.beginPath();
        g.arc(rnd() * 512, rnd() * 300, 0.6 + rnd() * 1.3, 0, Math.PI * 2);
        g.fill();
      }
    }
    if (this.scene.background && this.scene.background.dispose) this.scene.background.dispose();
    this.scene.background = canvasTexture(c);
  }

  // rain = slanted streaks, snow = drifting flakes, both in a box around the course
  _buildPrecip(kind) {
    if (this.precip) {
      this.scene.remove(this.precip.obj);
      this.precip.obj.geometry.dispose();
      this.precip.obj.material.dispose();
      this.precip = null;
    }
    if (!kind) return;
    const w = this.course ? this.course.width : 900, h = this.course ? this.course.height : 500;
    const drops = [];
    for (let i = 0; i < PRECIP_DROPS; i++) {
      drops.push({ x: -200 + Math.random() * (w + 400), y: Math.random() * 520, z: -200 + Math.random() * (h + 400), s: Math.random() });
    }
    let obj;
    if (kind === 'rain') {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(PRECIP_DROPS * 6), 3).setUsage(THREE.DynamicDrawUsage));
      obj = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: '#d4e6f7', transparent: true, opacity: 0.55, fog: false }));
    } else {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(PRECIP_DROPS * 3), 3).setUsage(THREE.DynamicDrawUsage));
      obj = new THREE.Points(geo, new THREE.PointsMaterial({
        size: 6, color: '#ffffff', map: this.points.material.map, transparent: true, depthWrite: false, sizeAttenuation: true, fog: false,
      }));
    }
    obj.frustumCulled = false;
    this.scene.add(obj);
    this.precip = { kind, obj, drops, w, h };
  }

  _updatePrecip(dt) {
    const p = this.precip;
    if (!p) return;
    const pos = p.obj.geometry.attributes.position.array;
    for (let i = 0; i < p.drops.length; i++) {
      const d = p.drops[i];
      if (p.kind === 'rain') {
        d.y -= (560 + d.s * 220) * dt;
        d.x -= 70 * dt;
        if (d.y < 0) { d.y = 520; d.x = -200 + Math.random() * (p.w + 400); }
        const o = i * 6;
        pos[o] = d.x; pos[o + 1] = d.y; pos[o + 2] = d.z;
        pos[o + 3] = d.x + 5; pos[o + 4] = d.y + 26; pos[o + 5] = d.z;
      } else {
        d.y -= (35 + d.s * 40) * dt;
        d.x += Math.sin(this.time * 0.8 + d.s * 20) * 18 * dt;
        if (d.y < 0) { d.y = 520; d.x = -200 + Math.random() * (p.w + 400); }
        pos[i * 3] = d.x; pos[i * 3 + 1] = d.y; pos[i * 3 + 2] = d.z;
      }
    }
    p.obj.geometry.attributes.position.needsUpdate = true;
  }

  _buildHazards(course, th, group) {
    const hazards = course.hazards || [];
    const n = hazards.length;
    hazards.forEach((hz, i) => {
      const y = 0.35 + (n - i) * 0.3; // earlier hazards win in physics, so draw them on top
      if (hz.shape === 'rect') {
        const mat = hz.type === 'ice'
          ? new THREE.MeshPhongMaterial({ color: '#c9f0ff', specular: '#ffffff', shininess: 140, transparent: true, opacity: 0.62 })
          : hz.type === 'water'
            ? new THREE.MeshPhongMaterial({ color: '#2d9bff', specular: '#ffffff', shininess: 110, transparent: true, opacity: 0.94 })
            : new THREE.MeshLambertMaterial({ color: th.sand });
        const m = new THREE.Mesh(
          this._track(new THREE.PlaneGeometry(hz.w, hz.h).rotateX(-Math.PI / 2)),
          this._track(mat),
        );
        m.position.set(hz.x + hz.w / 2, y, hz.y + hz.h / 2);
        m.receiveShadow = true;
        group.add(m);
        return;
      }
      const isWater = hz.type === 'water';
      const disc = new THREE.Mesh(
        this._track(new THREE.CircleGeometry(hz.r, 48).rotateX(-Math.PI / 2)),
        this._track(isWater
          ? new THREE.MeshPhongMaterial({ color: '#2d9bff', specular: '#ffffff', shininess: 110, transparent: true, opacity: 0.94 })
          : new THREE.MeshLambertMaterial({ color: th.sand })),
      );
      disc.position.set(hz.x, y, hz.y);
      disc.receiveShadow = true;
      group.add(disc);

      const rim = new THREE.Mesh(
        this._track(new THREE.RingGeometry(hz.r - 1, hz.r + 5, 48).rotateX(-Math.PI / 2)),
        this._track(new THREE.MeshLambertMaterial({ color: isWater ? '#e6f6ff' : th.sandEdge })),
      );
      rim.position.set(hz.x, y - 0.1, hz.y);
      group.add(rim);

      if (isWater) {
        for (let k = 0; k < 2; k++) {
          const mat = this._track(new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.4, depthWrite: false }));
          const ring = new THREE.Mesh(this._track(new THREE.RingGeometry(hz.r * 0.86, hz.r * 0.92, 48).rotateX(-Math.PI / 2)), mat);
          ring.position.set(hz.x, y + 0.15, hz.y);
          group.add(ring);
          this.waterRipples.push({ ring, mat, phase: k * 0.5 });
        }
      }
    });
  }

  _woodTexture(th) {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = th.wall;
    g.fillRect(0, 0, 256, 64);
    const rnd = mulberry32(7);
    for (let i = 0; i < 26; i++) {
      g.strokeStyle = `rgba(40,20,5,${0.1 + rnd() * 0.18})`;
      g.lineWidth = 1 + rnd() * 1.4;
      const y = rnd() * 64;
      g.beginPath();
      g.moveTo(0, y);
      g.bezierCurveTo(80, y + rnd() * 6 - 3, 170, y + rnd() * 6 - 3, 256, y);
      g.stroke();
    }
    g.strokeStyle = 'rgba(30,14,4,0.55)';
    g.lineWidth = 2;
    for (const x of [0, 128]) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 64); g.stroke(); }
    return this._track(canvasTexture(c, { repeat: true }));
  }

  _buildWalls(course, th, group) {
    const wood = this._woodTexture(th);
    const topMat = this._track(new THREE.MeshLambertMaterial({ color: th.wallTop }));
    const thick = this.config.wallHalf * 2;
    for (const wl of course.walls) {
      const dx = wl.x2 - wl.x1, dy = wl.y2 - wl.y1;
      const len = Math.hypot(dx, dy);
      const tex = this._track(wood.clone());
      tex.needsUpdate = true;
      tex.repeat.set(Math.max(1, (len + thick) / 110), 1);
      const sideMat = this._track(new THREE.MeshLambertMaterial({ map: tex }));
      const mesh = new THREE.Mesh(
        this._track(new THREE.BoxGeometry(len + thick, WALL_H, thick)),
        [sideMat, sideMat, topMat, topMat, sideMat, sideMat],
      );
      mesh.position.set((wl.x1 + wl.x2) / 2, WALL_H / 2, (wl.y1 + wl.y2) / 2);
      mesh.rotation.y = -Math.atan2(dy, dx);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
  }

  _buildHole(course, group) {
    const { holeR } = this.config;
    const { x, y } = course.hole;
    const cup = new THREE.Mesh(
      this._track(new THREE.CircleGeometry(holeR, 40).rotateX(-Math.PI / 2)),
      this._track(new THREE.MeshBasicMaterial({ color: '#0b0b10' })),
    );
    cup.position.set(x, 1.4, y);
    const rim = new THREE.Mesh(
      this._track(new THREE.RingGeometry(holeR, holeR + 4, 40).rotateX(-Math.PI / 2)),
      this._track(new THREE.MeshLambertMaterial({ color: '#e9e9ee' })),
    );
    rim.position.set(x, 1.3, y);
    group.add(cup, rim);

    const stripes = document.createElement('canvas');
    stripes.width = 8; stripes.height = 64;
    const sg = stripes.getContext('2d');
    for (let i = 0; i < 8; i++) { sg.fillStyle = i % 2 ? '#ffffff' : '#e8322e'; sg.fillRect(0, i * 8, 8, 8); }
    const pole = new THREE.Mesh(
      this._track(new THREE.CylinderGeometry(1.7, 1.7, 84, 10)),
      this._track(new THREE.MeshLambertMaterial({ map: this._track(canvasTexture(stripes, { repeat: true })) })),
    );
    pole.position.set(x, 42, y);
    pole.castShadow = true;
    group.add(pole);

    const flagGeo = this._track(new THREE.PlaneGeometry(34, 20, 10, 1));
    flagGeo.translate(17, 0, 0);
    const flag = new THREE.Mesh(
      flagGeo,
      this._track(new THREE.MeshLambertMaterial({ color: '#e8322e', side: THREE.DoubleSide })),
    );
    flag.position.set(x + 1.5, 72, y);
    flag.castShadow = true;
    group.add(flag);
    this.flag = { mesh: flag, base: flagGeo.attributes.position.array.slice() };

    const cap = new THREE.Mesh(
      this._track(new THREE.SphereGeometry(3, 12, 8)),
      this._track(new THREE.MeshLambertMaterial({ color: '#ffd23f' })),
    );
    cap.position.set(x, 85, y);
    group.add(cap);
  }

  _buildTee(course, group) {
    const { x, y } = course.start;
    const mat = this._track(new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.38, depthWrite: false }));
    const disc = new THREE.Mesh(this._track(new THREE.CircleGeometry(22, 36).rotateX(-Math.PI / 2)), mat);
    disc.position.set(x, 0.9, y);
    const ring = new THREE.Mesh(
      this._track(new THREE.RingGeometry(22, 25, 36).rotateX(-Math.PI / 2)),
      this._track(new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.7, depthWrite: false })),
    );
    ring.position.set(x, 0.95, y);
    group.add(disc, ring);
  }

  // ---------- scenery ----------
  _buildScenery(course, th, group) {
    const rnd = mulberry32(hashString(course.id));
    const { width: w, height: h } = course;
    const baseY = -PLATFORM_DEPTH - 2;
    const lam = (color) => this._track(new THREE.MeshLambertMaterial({ color, flatShading: true }));
    const put = (obj, x, y, z, s, ry) => {
      obj.position.set(x, y, z); obj.scale.setScalar(s); obj.rotation.y = ry;
      group.add(obj);
    };
    const cone = (r, hgt, y, mat, seg = 7) => {
      const m = new THREE.Mesh(this._track(new THREE.ConeGeometry(r, hgt, seg)), mat);
      m.position.y = y;
      return m;
    };
    const cyl = (rt, rb, hgt, y, mat, seg = 7) => {
      const m = new THREE.Mesh(this._track(new THREE.CylinderGeometry(rt, rb, hgt, seg)), mat);
      m.position.y = y;
      return m;
    };
    const trunk = lam('#6b4423');
    const greens = ['#2f9a3c', '#38ad47', '#44bd55'].map(lam);
    const snowTop = lam('#f4fbff');
    const snowGreens = ['#1f7a52', '#27895c'].map(lam);

    const makers = {
      pine: () => {
        const g = new THREE.Group();
        g.add(cyl(2.6, 3.4, 10, 5, trunk, 6));
        g.add(cone(15, 24, 20, greens[0]), cone(12, 20, 33, greens[1]), cone(8.5, 17, 45, greens[2]));
        return g;
      },
      snowPine: () => {
        const g = new THREE.Group();
        g.add(cyl(2.6, 3.4, 10, 5, trunk, 6));
        g.add(cone(15, 24, 20, snowGreens[0]), cone(12, 20, 33, snowGreens[1]), cone(8.5, 17, 45, snowTop));
        return g;
      },
      bush: () => {
        const g = new THREE.Group();
        const b = new THREE.Mesh(this._track(new THREE.IcosahedronGeometry(9, 0)), greens[Math.floor(rnd() * 3)]);
        b.position.y = 6; b.scale.y = 0.8;
        g.add(b);
        return g;
      },
      rock: (color) => {
        const g = new THREE.Group();
        const r = new THREE.Mesh(this._track(new THREE.IcosahedronGeometry(8, 0)), lam(color));
        r.position.y = 4; r.scale.set(1 + rnd() * 0.5, 0.7 + rnd() * 0.4, 1 + rnd() * 0.4);
        r.rotation.y = rnd() * 3;
        g.add(r);
        return g;
      },
      cactus: () => {
        const g = new THREE.Group();
        const m = lam('#3f9f4a');
        g.add(cyl(3.4, 3.8, 30, 15, m, 8));
        const cap = new THREE.Mesh(this._track(new THREE.SphereGeometry(3.4, 8, 6)), m);
        cap.position.y = 30;
        g.add(cap);
        const armL = cyl(2.3, 2.3, 10, 16, m, 8); armL.rotation.z = Math.PI / 2; armL.position.set(-7, 16, 0);
        const armLu = cyl(2.3, 2.3, 11, 22, m, 8); armLu.position.set(-12, 22, 0);
        const armR = cyl(2.3, 2.3, 9, 12, m, 8); armR.rotation.z = Math.PI / 2; armR.position.set(6.5, 12, 0);
        const armRu = cyl(2.3, 2.3, 9, 17, m, 8); armRu.position.set(11, 17, 0);
        g.add(armL, armLu, armR, armRu);
        return g;
      },
      palm: () => {
        const g = new THREE.Group();
        const bark = lam('#a9794a');
        const trunkM = cyl(2.2, 3.4, 34, 17, bark, 6);
        trunkM.rotation.z = 0.12;
        g.add(trunkM);
        const leaf = lam('#2fb84a');
        for (let i = 0; i < 7; i++) {
          const l = cone(3.6, 28, 0, leaf, 4);
          const a = (i / 7) * Math.PI * 2;
          l.geometry.translate(0, 14, 0);
          l.rotation.set(Math.cos(a) * 1.15, 0, Math.sin(a) * 1.15);
          l.position.set(3, 33, 0);
          g.add(l);
        }
        return g;
      },
      maple: () => {
        const g = new THREE.Group();
        g.add(cyl(2.6, 3.6, 16, 8, trunk, 6));
        const cols = ['#e8741c', '#d9441f', '#f0a020', '#c8321c'];
        const mk = (r, x, y, z) => {
          const m = new THREE.Mesh(this._track(new THREE.IcosahedronGeometry(r, 0)), lam(cols[Math.floor(rnd() * cols.length)]));
          m.position.set(x, y, z);
          m.rotation.y = rnd() * 3;
          return m;
        };
        g.add(mk(15, 0, 28, 0), mk(11, 9, 22, 4), mk(10, -8, 24, -4), mk(9, 1, 40, 1));
        return g;
      },
      mesa: () => {
        const g = new THREE.Group();
        g.add(cyl(26, 34, 46, 23, lam('#c6652f'), 7));
        g.add(cyl(22, 26, 24, 58, lam('#d9824a'), 7));
        g.add(cyl(14, 22, 14, 77, lam('#e59a5c'), 7));
        return g;
      },
    };

    const farKinds = {
      forest: [['pine', 5], ['rock', 1]],
      desert: [['mesa', 3], ['cactus', 3], ['rock', 1]],
      snow: [['snowPine', 5], ['rock', 1]],
      tropical: [['palm', 5], ['bush', 1], ['rock', 1]],
      autumn: [['maple', 5], ['pine', 1], ['rock', 1]],
    }[course.theme] || [['pine', 1]];
    const bag = farKinds.flatMap(([k, n]) => Array(n).fill(k));
    const rockColor = { forest: '#8d96a0', desert: '#b0663a', snow: '#a9d3ec', tropical: '#9aa3a8', autumn: '#8f8478' }[course.theme] || '#8d96a0';
    const make = (kind) => (kind === 'rock' ? makers.rock(rockColor) : makers[kind]());

    // distant ring of props
    const cx = w / 2, cz = h / 2;
    const clear = { x: w / 2 + PLATFORM_MARGIN + 60, z: h / 2 + PLATFORM_MARGIN + 60 };
    let placed = 0, guard = 0;
    while (placed < 70 && guard++ < 600) {
      const ang = rnd() * Math.PI * 2;
      const rad = 380 + rnd() * 1300;
      const px = cx + Math.cos(ang) * rad * 1.35, pz = cz + Math.sin(ang) * rad;
      if (Math.abs(px - cx) < clear.x && Math.abs(pz - cz) < clear.z) continue;
      const kind = bag[Math.floor(rnd() * bag.length)];
      const big = kind === 'mesa' ? 1.6 + rnd() * 2.2 : 2.2 + rnd() * 2.6;
      put(make(kind), px, baseY, pz, big, rnd() * 6.28);
      placed++;
    }

    // small props on the platform rim, just outside the walls
    const rimKinds = {
      forest: ['bush', 'rock', 'pine'],
      desert: ['cactus', 'rock', 'cactus'],
      snow: ['snowPine', 'rock', 'snowPine'],
      tropical: ['palm', 'bush', 'rock'],
      autumn: ['maple', 'bush', 'rock'],
    }[course.theme] || ['bush'];
    const mid = PLATFORM_MARGIN / 2 + 4;
    for (let i = 0; i < 16; i++) {
      const t = rnd();
      const side = Math.floor(rnd() * 4);
      let px, pz;
      if (side === 0) { px = t * w; pz = -mid; }
      else if (side === 1) { px = t * w; pz = h + mid; }
      else if (side === 2) { px = -mid; pz = t * h; }
      else { px = w + mid; pz = t * h; }
      const kind = rimKinds[Math.floor(rnd() * rimKinds.length)];
      const tall = kind === 'pine' || kind === 'snowPine' || kind === 'palm' || kind === 'maple';
      put(make(kind), px, -0.6, pz, tall ? 0.62 : 0.8, rnd() * 6.28);
    }
  }

  // ---------- balls ----------
  _skinTex(color, pattern) {
    const key = `${color}|${pattern}`;
    if (!this.skinTextures.has(key)) {
      this.skinTextures.set(key, canvasTexture(skinTexture(color, pattern)));
    }
    return this.skinTextures.get(key);
  }

  _ensureBall(p) {
    let e = this.balls.get(p.id);
    const skinKey = `${p.color}|${p.pattern}`;
    if (e && e.skinKey === skinKey) return e;
    const { ballR } = this.config;

    if (!e) {
      e = { id: p.id, x: p.x, z: p.y, tx: p.x, tz: p.y, snap: true, sunk: false, sinkT: -1, hidden: false, trail: [], moving: false };
      e.mesh = new THREE.Mesh(this.ballGeo, new THREE.MeshPhongMaterial({ specular: 0x888888, shininess: 80 }));
      e.mesh.castShadow = true;
      this.ballGroup.add(e.mesh);

      const pos = new Float32Array(TRAIL_POINTS * 2 * 3);
      const col = new Float32Array(TRAIL_POINTS * 2 * 4);
      const idx = [];
      for (let i = 0; i < TRAIL_POINTS - 1; i++) {
        const a = i * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
      geo.setAttribute('color', new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage));
      geo.setIndex(idx);
      e.trailMesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
        vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      }));
      e.trailMesh.frustumCulled = false;
      e.trailMesh.visible = false;
      this.ballGroup.add(e.trailMesh);

      e.label = document.createElement('div');
      e.label.className = 'name-tag';
      this.labelsEl.appendChild(e.label);
      this.balls.set(p.id, e);
    }
    e.skinKey = skinKey;
    e.color = new THREE.Color(p.color);
    e.mesh.material.map = this._skinTex(p.color, p.pattern);
    e.mesh.material.needsUpdate = true;
    e.mesh.position.y = ballR;
    return e;
  }

  setPlayers(list) {
    const seen = new Set();
    for (const p of list) {
      seen.add(p.id);
      const e = this._ensureBall(p);
      e.tx = p.x; e.tz = p.y;
      e.name = p.name;
      if (e.label.textContent !== p.name) e.label.textContent = p.name;
      if (p.sunk && !e.sunk) {
        e.sunk = true;
        e.sinkT = 0;
        const course = this.course;
        const near = course && Math.hypot(p.x - course.hole.x, p.y - course.hole.y) < this.config.holeR * 1.6;
        e.sinkIntoHole = near;
        if (near) this._burst(course.hole.x, 20, course.hole.y, 36, ['#ffd23f', '#ffffff', e.color.getStyle()]);
      } else if (!p.sunk && e.sunk) {
        e.sunk = false; e.sinkT = -1; e.hidden = false;
        e.mesh.visible = true; e.mesh.scale.setScalar(1);
        e.snap = true;
      }
    }
    for (const [id, e] of this.balls) {
      if (seen.has(id)) continue;
      this.ballGroup.remove(e.mesh, e.trailMesh);
      e.trailMesh.geometry.dispose();
      e.trailMesh.material.dispose();
      e.mesh.material.dispose();
      e.label.remove();
      this.balls.delete(id);
    }
  }

  setTurn(id, phase) {
    this.turn = { id, phase };
    for (const [bid, e] of this.balls) e.label.classList.toggle('turn', bid === id && phase === 'aiming');
  }

  splash(x, y) {
    this._burst(x, 4, y, 46, ['#8fd3ff', '#ffffff', '#4aa8ff'], 1);
  }

  // ---------- aim line ----------
  _buildAim() {
    this.aimGroup = new THREE.Group();
    this.aimGroup.visible = false;
    this.aimMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.95, depthWrite: false });
    const dotGeo = new THREE.CircleGeometry(1, 16).rotateX(-Math.PI / 2);
    this.aimDots = [];
    for (let i = 0; i < AIM_DOTS; i++) {
      const d = new THREE.Mesh(dotGeo, this.aimMat);
      this.aimDots.push(d);
      this.aimGroup.add(d);
    }
    this.aimArrow = new THREE.Mesh(new THREE.ConeGeometry(8, 18, 3), this.aimMat);
    this.aimGroup.add(this.aimArrow);
    this.scene.add(this.aimGroup);
  }

  showAim(x, y, dirX, dirY, power) {
    const len = 30 + power * 230;
    const color = power < 0.5 ? new THREE.Color('#7dff6a').lerp(new THREE.Color('#ffe14a'), power * 2)
      : new THREE.Color('#ffe14a').lerp(new THREE.Color('#ff4b3a'), (power - 0.5) * 2);
    this.aimMat.color.copy(color);
    const r0 = this.config.ballR * 1.7;
    for (let i = 0; i < AIM_DOTS; i++) {
      const t = i / (AIM_DOTS - 1);
      const d = this.aimDots[i];
      const dist = r0 + t * len;
      d.position.set(x + dirX * dist, 1.8, y + dirY * dist);
      d.scale.setScalar(3.6 - t * 1.6);
      d.visible = dist < r0 + len - 14;
    }
    const end = r0 + len;
    this.aimArrow.position.set(x + dirX * end, 1.8, y + dirY * end);
    this.aimArrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dirX, 0, dirY));
    this.aimGroup.visible = true;
  }

  hideAim() { this.aimGroup.visible = false; }

  _buildTurnRing() {
    const { ballR } = this.config;
    this.turnRingMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide });
    this.turnRing = new THREE.Mesh(new THREE.RingGeometry(ballR * 1.55, ballR * 2.05, 40).rotateX(-Math.PI / 2), this.turnRingMat);
    this.turnRing.visible = false;
    this.scene.add(this.turnRing);
  }

  // ---------- particles ----------
  _buildParticles() {
    this.pf = {
      pos: new Float32Array(PARTICLES * 3),
      col: new Float32Array(PARTICLES * 3),
      base: new Float32Array(PARTICLES * 3),
      vel: new Float32Array(PARTICLES * 3),
      life: new Float32Array(PARTICLES),
      max: new Float32Array(PARTICLES).fill(1),
      grav: new Float32Array(PARTICLES),
      next: 0,
    };
    this.pf.pos.fill(-9999);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pf.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.pf.col, 3).setUsage(THREE.DynamicDrawUsage));
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const rg = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    rg.addColorStop(0, 'rgba(255,255,255,1)');
    rg.addColorStop(0.45, 'rgba(255,255,255,0.8)');
    rg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = rg;
    g.fillRect(0, 0, 64, 64);
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 7, map: canvasTexture(c), vertexColors: true, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, sizeAttenuation: true,
    }));
    this.points.frustumCulled = false;
    this.scene.add(this.points);
  }

  _emit(x, y, z, vx, vy, vz, color, life, grav) {
    const p = this.pf;
    const i = p.next;
    p.next = (p.next + 1) % PARTICLES;
    p.pos[i * 3] = x; p.pos[i * 3 + 1] = y; p.pos[i * 3 + 2] = z;
    p.vel[i * 3] = vx; p.vel[i * 3 + 1] = vy; p.vel[i * 3 + 2] = vz;
    p.base[i * 3] = color.r; p.base[i * 3 + 1] = color.g; p.base[i * 3 + 2] = color.b;
    p.life[i] = life; p.max[i] = life; p.grav[i] = grav;
  }

  _burst(x, y, z, count, colors, upward = 1.4) {
    const cs = colors.map(c => new THREE.Color(c));
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 40 + Math.random() * 110;
      this._emit(x, y, z, Math.cos(a) * s, (60 + Math.random() * 170) * upward, Math.sin(a) * s,
        cs[i % cs.length], 0.7 + Math.random() * 0.5, 320);
    }
  }

  _updateParticles(dt) {
    const p = this.pf;
    for (let i = 0; i < PARTICLES; i++) {
      if (p.life[i] <= 0) continue;
      p.life[i] -= dt;
      if (p.life[i] <= 0) { p.pos[i * 3 + 1] = -9999; p.col[i * 3] = p.col[i * 3 + 1] = p.col[i * 3 + 2] = 0; continue; }
      p.vel[i * 3 + 1] -= p.grav[i] * dt;
      p.pos[i * 3] += p.vel[i * 3] * dt;
      p.pos[i * 3 + 1] += p.vel[i * 3 + 1] * dt;
      p.pos[i * 3 + 2] += p.vel[i * 3 + 2] * dt;
      const f = p.life[i] / p.max[i];
      p.col[i * 3] = p.base[i * 3] * f;
      p.col[i * 3 + 1] = p.base[i * 3 + 1] * f;
      p.col[i * 3 + 2] = p.base[i * 3 + 2] * f;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }

  // ---------- camera ----------
  _viewDir() {
    const c = this.course;
    const portrait = this.camera.aspect < 0.9;
    const dx = c.hole.x - c.start.x, dy = c.hole.y - c.start.y;
    if (!portrait) return new THREE.Vector3(0, 0, dy > 60 ? 1 : -1);
    if (Math.abs(dx) > Math.abs(dy)) return new THREE.Vector3(dx < 0 ? -1 : 1, 0, 0);
    return new THREE.Vector3(0, 0, dy < 0 ? -1 : 1);
  }

  // Place the camera behind the tee, tilted, at the smallest distance that keeps
  // the whole course inside the area not covered by the HUD.
  setCamMode(mode) {
    this.camMode = mode;
    this.followReady = false;
    if (this.mode === 'play') this._applyPlayCamera();
  }

  _applyPlayCamera() {
    if (this.camMode === 'follow') this._setupFollow();
    else this._fitCamera();
  }

  // Follow cam: low and behind the shooter's ball, looking toward the hole.
  _setupFollow() {
    const W = window.innerWidth, H = window.innerHeight;
    const cam = this.camera;
    cam.aspect = W / H;
    cam.fov = W / H < 0.9 ? 58 : 46;
    cam.setViewOffset(W, H, 0, (this.pad.bottom - this.pad.top) / 2, W, H);
    cam.updateProjectionMatrix();
    this.followReady = false;
  }

  _updateFollow(dt) {
    const e = this.balls.get(this.turn.id) || this.balls.values().next().value;
    if (!e || !this.course) return;
    const hole = this.course.hole;
    let dx = hole.x - e.x, dz = hole.y - e.z;
    const d = Math.hypot(dx, dz);
    if (d > 25) { dx /= d; dz /= d; } else { dx = this.followDir ? this.followDir.x : 1; dz = this.followDir ? this.followDir.z : 0; }
    const portrait = this.camera.aspect < 0.9;
    const back = portrait ? 260 : 290, up = portrait ? 170 : 150, ahead = portrait ? 170 : 150;
    const want = new THREE.Vector3(e.x - dx * back, up, e.z - dz * back);
    const look = new THREE.Vector3(e.x + dx * ahead, 0, e.z + dz * ahead);
    if (!this.followReady) {
      this.followDir = { x: dx, z: dz };
      this.camera.position.copy(want);
      this.followLook = look.clone();
      this.followReady = true;
    } else {
      const k = 1 - Math.exp(-dt * 4);
      this.followDir.x += (dx - this.followDir.x) * k;
      this.followDir.z += (dz - this.followDir.z) * k;
      this.camera.position.lerp(want, k);
      this.followLook.lerp(look, k);
    }
    this.camera.lookAt(this.followLook);
    this.camera.updateMatrixWorld(true);
  }

  _fitCamera() {
    if (!this.course) return;
    const W = window.innerWidth, H = window.innerHeight;
    const { width: w, height: h } = this.course;
    const cam = this.camera;
    const portrait = W / H < 0.9;
    const target = new THREE.Vector3(w / 2, 0, h / 2);
    const vd = this._viewDir();
    const pitch = THREE.MathUtils.degToRad(portrait ? 54 : 50);
    const m = PLATFORM_MARGIN * 0.35;
    const corners = [];
    for (const x of [-m, w + m]) for (const z of [-m, h + m]) for (const y of [0, WALL_H + 4]) corners.push(new THREE.Vector3(x, y, z));

    cam.aspect = W / H;
    cam.fov = portrait ? 46 : 38;
    cam.setViewOffset(W, H, 0, (this.pad.bottom - this.pad.top) / 2, W, H);
    const limX = 1 - (2 * this.pad.side) / W;
    const limTop = 1 - (2 * this.pad.top) / H;
    const limBot = -(1 - (2 * this.pad.bottom) / H);

    const place = (d) => {
      cam.position.set(
        target.x - vd.x * d * Math.cos(pitch),
        d * Math.sin(pitch),
        target.z - vd.z * d * Math.cos(pitch),
      );
      cam.lookAt(target);
      cam.updateMatrixWorld(true);
      cam.updateProjectionMatrix();
    };
    const fits = () => corners.every((c) => {
      const p = c.clone().project(cam);
      return Math.abs(p.x) <= limX && p.y <= limTop && p.y >= limBot;
    });
    let lo = 120, hi = 6000;
    for (let i = 0; i < 26; i++) {
      const mid = (lo + hi) / 2;
      place(mid);
      if (fits()) hi = mid; else lo = mid;
    }
    place(hi);
  }

  // ---------- picking / projection ----------
  groundPoint(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.groundPlane, hit)) return null;
    return { x: hit.x, y: hit.z };
  }

  // ---------- per-frame ----------
  _update(dt) {
    this.time += dt;
    const { ballR } = this.config;

    if (this.mode === 'play' && this.camMode === 'follow') this._updateFollow(dt);

    if (this.mode === 'showcase' && this.course) {
      this.orbit += dt * 0.09;
      const { width: w, height: h } = this.course;
      const portrait = this.camera.aspect < 0.9;
      const R = Math.max(w, h) * (portrait ? 1.7 : 1.0);
      const cx = w / 2, cz = h / 2;
      this.camera.position.set(cx + Math.sin(this.orbit) * R * 0.55, R * (portrait ? 0.7 : 0.62), cz + Math.cos(this.orbit) * R * 0.75);
      this.camera.lookAt(cx, 0, cz + (portrait ? 80 : 0));
      this.camera.updateMatrixWorld(true);
    }

    if (this.flag) {
      const arr = this.flag.mesh.geometry.attributes.position.array;
      const base = this.flag.base;
      for (let i = 0; i < arr.length; i += 3) {
        const k = base[i] / 34;
        arr[i + 2] = Math.sin(this.time * 6 - base[i] * 0.22) * 4.5 * k;
        arr[i + 1] = base[i + 1] + Math.sin(this.time * 5 - base[i] * 0.2) * 1.2 * k;
      }
      this.flag.mesh.geometry.attributes.position.needsUpdate = true;
    }

    for (const r of this.waterRipples || []) {
      const t = (this.time * 0.45 + r.phase) % 1;
      r.ring.scale.setScalar(0.45 + t * 0.62);
      r.mat.opacity = 0.5 * (1 - t);
    }

    const k = 1 - Math.exp(-dt * 28);
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    const placed = [];
    for (const e of this.balls.values()) {
      const ox = e.x, oz = e.z;
      if (e.snap || Math.hypot(e.tx - e.x, e.tz - e.z) > 90) {
        e.x = e.tx; e.z = e.tz; e.snap = false; e.trail.length = 0;
      } else {
        e.x += (e.tx - e.x) * k;
        e.z += (e.tz - e.z) * k;
      }
      const mx = e.x - ox, mz = e.z - oz;
      const dist = Math.hypot(mx, mz);
      e.moving = dt > 0 && dist / dt > 25;
      if (dist > 0.0005) {
        const q = new THREE.Quaternion().setFromAxisAngle(this.tmpV.set(mz, 0, -mx).normalize(), dist / ballR);
        e.mesh.quaternion.premultiply(q);
      }

      let y = ballR, scale = 1;
      if (e.sinkT >= 0 && !e.hidden) {
        e.sinkT += dt / (e.sinkIntoHole ? 0.5 : 0.25);
        const t = Math.min(1, e.sinkT);
        if (e.sinkIntoHole) {
          e.x += (this.course.hole.x - e.x) * 0.3;
          e.z += (this.course.hole.y - e.z) * 0.3;
          y = ballR - t * ballR * 2.4;
        }
        scale = 1 - t * (e.sinkIntoHole ? 0.2 : 0.95);
        if (t >= 1) { e.hidden = true; e.mesh.visible = false; }
      }
      e.mesh.position.set(e.x, y, e.z);
      e.mesh.scale.setScalar(scale);

      this._updateTrail(e, dt);

      // emit sparkles behind fast balls
      if (e.moving && !e.hidden && dist / dt > 120) {
        const c = e.color.clone().lerp(new THREE.Color('#ffffff'), 0.35);
        this._emit(e.x, ballR * 0.6, e.z, (Math.random() - 0.5) * 30, 20 + Math.random() * 30, (Math.random() - 0.5) * 30, c, 0.45, 60);
      }

      // name tag
      if (e.hidden) { e.label.style.display = 'none'; continue; }
      const v = this.tmpV.set(e.x, ballR * 3.1, e.z).project(this.camera);
      if (v.z > 1) { e.label.style.display = 'none'; continue; }
      e.label.style.display = 'block';
      // stack tags of balls sharing a spot (everyone starts on the tee)
      const stack = placed.filter(q => Math.hypot(q.x - e.x, q.z - e.z) < 16).length;
      placed.push(e);
      e.label.style.transform = `translate(${((v.x * 0.5 + 0.5) * w).toFixed(1)}px, ${((-v.y * 0.5 + 0.5) * h - stack * 20).toFixed(1)}px) translate(-50%, -100%)`;
    }

    // pulsing ring under whoever is shooting
    const shooter = this.balls.get(this.turn.id);
    if (shooter && this.turn.phase === 'aiming' && !shooter.hidden) {
      const s = 1 + Math.sin(this.time * 5) * 0.12;
      this.turnRing.visible = true;
      this.turnRing.position.set(shooter.x, 1.6, shooter.z);
      this.turnRing.scale.setScalar(s);
      this.turnRingMat.color.copy(shooter.color);
    } else {
      this.turnRing.visible = false;
    }

    this._updateParticles(dt);
    this._updatePrecip(dt);
  }

  _updateTrail(e, dt) {
    const { ballR } = this.config;
    const t = e.trail;
    if (e.moving && !e.hidden) {
      const last = t[t.length - 1];
      if (!last || Math.hypot(last.x - e.x, last.z - e.z) > 3) {
        t.push({ x: e.x, z: e.z });
        if (t.length > TRAIL_POINTS) t.shift();
      }
    } else if (t.length) {
      e.trailDecay = (e.trailDecay || 0) + dt;
      if (e.trailDecay > 0.016) { t.shift(); e.trailDecay = 0; }
    }
    if (t.length < 2) { e.trailMesh.visible = false; return; }
    e.trailMesh.visible = true;
    const pos = e.trailMesh.geometry.attributes.position.array;
    const col = e.trailMesh.geometry.attributes.color.array;
    const n = t.length;
    const c = e.color;
    for (let i = 0; i < TRAIL_POINTS; i++) {
      const p = t[Math.min(i, n - 1)];
      const a = t[Math.max(0, Math.min(i, n - 1) - 1)];
      const b = t[Math.min(n - 1, Math.min(i, n - 1) + 1)];
      let dx = b.x - a.x, dz = b.z - a.z;
      const l = Math.hypot(dx, dz) || 1;
      dx /= l; dz /= l;
      const f = i < n ? i / (n - 1) : 1;
      const wd = ballR * 0.7 * Math.pow(f, 0.8) + 0.2;
      const o = i * 6;
      pos[o] = p.x - dz * wd; pos[o + 1] = 1.2; pos[o + 2] = p.z + dx * wd;
      pos[o + 3] = p.x + dz * wd; pos[o + 4] = 1.2; pos[o + 5] = p.z - dx * wd;
      const alpha = i < n ? f * 0.85 : 0.85;
      const co = i * 8;
      col[co] = col[co + 4] = c.r; col[co + 1] = col[co + 5] = c.g; col[co + 2] = col[co + 6] = c.b;
      col[co + 3] = col[co + 7] = alpha;
    }
    e.trailMesh.geometry.attributes.position.needsUpdate = true;
    e.trailMesh.geometry.attributes.color.needsUpdate = true;
  }
}
