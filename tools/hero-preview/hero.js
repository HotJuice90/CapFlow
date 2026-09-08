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
  aBase: 0.26, aK: 0.60, aMax: 0.82,
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

  // ПОТОК: вытянутая лента вдоль изогнутой линии. Из них и набирается
  // ощущение «несколько течений», которого не даёт сумма круглых масс.
  // Каждый поток живёт в СВОЁМ повёрнутом базисе — иначе все ленты лежат
  // горизонтально, сливаются в одну толстую полосу и «нескольких течений»
  // не читается. Пересечения под углом как раз и дают ощущение потоков.
  function stream(ang, y0, amp, freq, phase, speed, thick, len) {
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const rx = wx * ca + wy * sa, ry = -wx * sa + wy * ca;
    const yc = y0 + amp * Math.sin(rx * freq + t * speed + phase);
    const dy = (ry - yc) / thick;
    const dx = rx / len;
    return Math.exp(-dy * dy) * Math.exp(-dx * dx);
  }

  const s1 = 0.62 * stream(-0.24, -0.06, 0.090, 2.6, 0.0, 0.23, 0.125, 1.05);
  const s2 = 0.52 * stream( 0.16,  0.13, 0.075, 3.4, 1.9, -0.19, 0.100, 0.95);
  const s3 = 0.44 * stream(-0.38, -0.24, 0.100, 2.1, 3.3, 0.15, 0.090, 0.85);
  const s4 = 0.36 * stream( 0.31,  0.24, 0.065, 4.1, 5.0, -0.26, 0.080, 0.88);
  let d = s1 + s2 + s3 + s4;

  // Общая масса под суммой: потоки дают полосы, а спека просит ещё и
  // концентрацию плотности вокруг цифры.
  d += 0.38 * mass(wx, wy, 0.02 * Math.sin(t * 0.13), -0.02, 0.60, 0.30);
  d += 0.20 * mass(wx, wy, -0.28 + 0.06 * Math.sin(t * 0.17), 0.08, 0.46, 0.24);
  d += 0.18 * mass(wx, wy, 0.28 + 0.05 * Math.sin(t * 0.15 + 1.7), -0.10, 0.44, 0.22);

  const ripple = 0.5 + 0.5 * Math.sin(wy * 7.0 + wx * 3.0 + t * 0.33);
  d *= 0.78 + 0.22 * ripple;
  d += 0.30 * Math.exp(-Math.pow((uvy - 0.32) / 0.52, 2)) * (0.55 + 0.45 * ripple);
  d *= p.gain + p.gaink * k;

  const mx = px * 0.85, my = py * 1.25;
  d *= p.centerA + p.centerB * Math.exp(-(mx * mx + my * my) * p.centerPow);
  d *= ss(p.botFade[0], p.botFade[1], uvy) * (p.topFloor + (1 - p.topFloor) * ss(p.topFade[0], p.topFade[1], uvy));
  d = clamp(d, 0, 1.4);

  // У каждого потока СВОЙ оттенок, и цвет точки — их взвешенная смесь.
  // Именно это, а не разница в плотности, заставляет читать несколько течений:
  // на пересечениях оттенки смешиваются, вдоль лент остаются своими.
  const cAqua = [0.616, 0.906, 0.949];  // холодный голубой
  const cMint = [0.549, 0.910, 0.784];  // мятный
  const cTeal = [0.427, 0.835, 0.847];  // бирюза
  const cSky  = [0.694, 0.878, 0.976];  // светло-синий
  const base  = [0.780, 0.929, 0.961];  // общая дымка
  const wsum = s1 + s2 + s3 + s4 + 1e-4;
  let colS = [0, 1, 2].map((i) => (s1 * cTeal[i] + s2 * cMint[i] + s3 * cSky[i] + s4 * cAqua[i]) / wsum);
  // Тёплое состояние двигает всю смесь в зелёный, холодное — в голубой.
  const green = [0.494, 0.898, 0.729];
  colS = mix(colS, green, 0.42 * warmth);
  // Вне лент (дымка, края) — общий светлый тон.
  let col = mix(base, colS, clamp(wsum * 2.2, 0, 1));
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
