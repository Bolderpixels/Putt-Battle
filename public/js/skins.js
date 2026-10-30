// Ball skins: one equirectangular texture drawn on a canvas, used both as the
// 3D ball's map and (via a tiny software sphere renderer) as lobby icons.

function secondaryFor(hex) {
  const n = parseInt(hex.slice(1), 16);
  const lum = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.85 ? '#3b4a8f' : '#ffffff';
}

export function skinTexture(color, pattern, w = 256, h = 128) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = color;
  g.fillRect(0, 0, w, h);
  g.fillStyle = secondaryFor(color);

  if (pattern === 'stripes') {
    const n = 8;
    for (let i = 1; i < n; i += 2) g.fillRect((i * w) / n, 0, w / n, h);
  } else if (pattern === 'hoops') {
    const n = 6;
    for (let i = 1; i < n; i += 2) g.fillRect(0, (i * h) / n, w, h / n);
  } else if (pattern === 'dots') {
    const cols = 12, rows = 6;
    for (let r = 0; r < rows; r++) {
      for (let q = 0; q < cols; q++) {
        const x = ((q + (r % 2 ? 0.5 : 0)) * w) / cols + w / cols / 2;
        const y = ((r + 0.5) * h) / rows;
        g.beginPath();
        g.arc(x, y, h / rows / 3.2, 0, Math.PI * 2);
        g.fill();
      }
    }
  } else if (pattern === 'checker') {
    const cols = 12, rows = 6;
    for (let r = 0; r < rows; r++) {
      for (let q = 0; q < cols; q++) {
        if ((r + q) % 2) g.fillRect((q * w) / cols, (r * h) / rows, w / cols, h / rows);
      }
    }
  } else {
    // plain: faint golf-ball dimples
    g.fillStyle = 'rgba(0,0,0,0.09)';
    for (let r = 0; r < 9; r++) {
      for (let q = 0; q < 24; q++) {
        g.beginPath();
        g.arc(((q + (r % 2 ? 0.5 : 0)) * w) / 24, ((r + 0.5) * h) / 9, 2.4, 0, Math.PI * 2);
        g.fill();
      }
    }
  }
  return c;
}

const iconCache = new Map();

// Software-shaded ball preview so lobby icons match the 3D ball.
export function skinIcon(color, pattern, size = 56) {
  const key = `${color}|${pattern}|${size}`;
  if (!iconCache.has(key)) {
    const tw = 256, th = 128;
    const tex = skinTexture(color, pattern, tw, th).getContext('2d').getImageData(0, 0, tw, th).data;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const img = g.createImageData(size, size);
    const L = [-0.45, 0.65, 0.62];
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const nx = ((x + 0.5) / size) * 2 - 1;
        const ny = -(((y + 0.5) / size) * 2 - 1);
        const r2 = nx * nx + ny * ny;
        if (r2 >= 1) continue;
        const nz = Math.sqrt(1 - r2);
        const u = (((Math.atan2(nx, nz) / (Math.PI * 2)) + 0.58) % 1 + 1) % 1;
        const v = Math.acos(ny) / Math.PI;
        const ti = ((Math.min(th - 1, Math.floor(v * th)) * tw) + Math.min(tw - 1, Math.floor(u * tw))) * 4;
        const d = Math.max(0, nx * L[0] + ny * L[1] + nz * L[2]);
        const shade = 0.5 + 0.55 * d;
        const spec = Math.pow(d, 28) * 120;
        const o = (y * size + x) * 4;
        img.data[o] = Math.min(255, tex[ti] * shade + spec);
        img.data[o + 1] = Math.min(255, tex[ti + 1] * shade + spec);
        img.data[o + 2] = Math.min(255, tex[ti + 2] * shade + spec);
        img.data[o + 3] = Math.min(1, (1 - Math.sqrt(r2)) * size * 0.5) * 255;
      }
    }
    g.putImageData(img, 0, 0);
    iconCache.set(key, c);
  }
  // hand out a copy so callers can append it to the DOM freely
  const src = iconCache.get(key);
  const copy = document.createElement('canvas');
  copy.width = copy.height = size;
  copy.getContext('2d').drawImage(src, 0, 0);
  return copy;
}
