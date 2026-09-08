// Порт hero-шейдера на JS — только для офлайн-подбора композиции.
const { writePng } = require('./png.js');

const P = {
  H: 380, W: 411,
  cy: 0.575,
  warpX: 0.045, warpXk: 0.03,
  warpY: 0.055, warpYk: 0.03,
  warp2: 0.10,
  gain: 0.55, gaink: 0.45,
  centerA: 0.30, centerB: 0.70, centerPow: 1.05,
  topFloor: 0.45, topFade: [-0.30, 0.30], botFade: [1.02, 0.58],
  aBase: 0.22, aK: 0.58, aMax: 0.86,
};

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
function ss(e0, e1, x) { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); }
function mix(a, b, t) { return a.map((v, i) => v + (b[i] - v) * t); }

function mass(px, py, cx, cy, rx, ry) {
  const dx = (px - cx) / rx, dy = (py - cy) / ry;
  return Math.exp(-(dx * dx + dy * dy));
}

function field(uvx, uvy, t, k, warmth, p = P) {
  const asp = p.W / p.H;
  const px = (uvx - 0.5) * asp, py = uvy - p.cy;

  let qx = px + (p.warpX + p.warpXk * k) * Math.sin(py * 3.1 + t * 0.27);
  let qy = py + (p.warpY + p.warpYk * k) * Math.sin(px * 2.3 - t * 0.21);
  let wx = qx + p.warp2 * Math.sin(qy * 6.6 - t * 0.16);
  let wy = qy + p.warp2 * 0.80 * Math.sin(qx * 5.2 + t * 0.19);

  let d = 0;
  d += 1.00 * mass(wx, wy, 0.02 * Math.sin(t * 0.13), -0.04 + 0.03 * Math.sin(t * 0.11), 0.62, 0.34);
  d += 0.72 * mass(wx, wy, -0.30 + 0.06 * Math.sin(t * 0.17), 0.10, 0.48, 0.26);
  d += 0.68 * mass(wx, wy, 0.29 + 0.05 * Math.sin(t * 0.15 + 1.7), -0.13, 0.46, 0.24);
  d += 0.42 * mass(wx, wy, 0.05, 0.22 + 0.04 * Math.sin(t * 0.09), 0.66, 0.20);
  d += 0.32 * mass(wx, wy, -0.10 + 0.08 * Math.sin(t * 0.07 + 2.3), -0.26, 0.54, 0.18);

  // Две складки под разными углами — от них в толще массы читаются волны,
  // а не однородная линза.
  const ripple = 0.5 + 0.5 * Math.sin(wy * 7.0 + wx * 3.0 + t * 0.33);
  const band = 0.5 + 0.5 * Math.sin(wy * 11.0 - wx * 4.5 - t * 0.22);
  d *= 0.62 + 0.22 * ripple + 0.20 * band;
  // Широкая дымка на весь верх — иначе углы остаются пустыми и поле
  // выглядит линзой, приклеенной к центру.
  d += 0.34 * Math.exp(-Math.pow((uvy - 0.32) / 0.52, 2)) * (0.55 + 0.45 * ripple);
  d *= p.gain + p.gaink * k;

  const mx = px * 0.85, my = py * 1.25;
  d *= p.centerA + p.centerB * Math.exp(-(mx * mx + my * my) * p.centerPow);
  d *= ss(p.botFade[0], p.botFade[1], uvy) * (p.topFloor + (1 - p.topFloor) * ss(p.topFade[0], p.topFade[1], uvy));
  d = clamp(d, 0, 1.4);

  const cool = [0.694, 0.878, 0.933], mid = [0.514, 0.831, 0.859];
  const warm = [0.443, 0.827, 0.690], deep = [0.259, 0.643, 0.639];
  // Оттенок гуляет ПО ПЛОЩАДИ, а не только по плотности: в одном краю поля
  // холоднее, в другом зеленее — так у массы появляется внутренняя жизнь.
  const hue = 0.5 + 0.5 * Math.sin(wx * 2.2 + wy * 1.6 + t * 0.11);
  let col = mix(cool, mid, ss(0.15, 0.75, d));
  col = mix(col, warm, (0.25 + 0.75 * warmth) * hue * ss(0.20, 0.95, d));
  col = mix(col, deep, ss(0.70, 1.45, d) * (0.35 + 0.50 * k));
  // Мягкий разгон альфы без насыщения: если оборвать его на 0.9, ядро
  // становится плоской заливкой и все складки внутри пропадают.
  const a = clamp((p.aBase + p.aK * k) * ss(0.02, 1.30, d), 0, p.aMax);
  return { col, a, d };
}

// фон экрана: 168deg #F2F4F9 -> #E0EDF4 -> #F5F7FF
function bg(uvx, uvy) {
  const s = clamp(uvx * 0.25 + uvy * 0.85, 0, 1);
  const stops = [[0.0269, [0.949, 0.957, 0.976]], [0.5651, [0.878, 0.929, 0.957]], [0.9918, [0.961, 0.969, 1.0]]];
  if (s <= stops[0][0]) return stops[0][1];
  if (s >= stops[2][0]) return stops[2][1];
  const i = s <= stops[1][0] ? 0 : 1;
  const t = (s - stops[i][0]) / (stops[i + 1][0] - stops[i][0]);
  return mix(stops[i][1], stops[i + 1][1], t);
}

function render(path, samples, k, warmth, p = P) {
  const W = p.W, H = p.H, N = samples.length;
  const GAP = 8;
  const OW = W * N + GAP * (N - 1);
  const buf = Buffer.alloc(OW * H * 3, 255);
  samples.forEach((t, si) => {
    const ox = si * (W + GAP);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const uvx = (x + 0.5) / W, uvy = (y + 0.5) / H;
        const b = bg(uvx, (y + 0.5) / 915);
        const f = field(uvx, uvy, t, k, warmth, p);
        const o = ((y * OW) + ox + x) * 3;
        for (let c = 0; c < 3; c++) {
          buf[o + c] = Math.round(255 * clamp(f.col[c] * f.a + b[c] * (1 - f.a), 0, 1));
        }
        // маркеры: строка суммы (218) и низ поля
        if (y === 218 || y === 178) buf[o] = Math.min(255, buf[o] + 40);
      }
    }
  });
  writePng(path, OW, H, buf);
  return path;
}

const out = process.argv[2] || 'hero.png';
render(out, [0, 9, 21], Number(process.argv[3] ?? 0.62), Number(process.argv[4] ?? 0.35));
console.log('ok', out);
