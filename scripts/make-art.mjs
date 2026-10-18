// Paints the background art in headless Chromium: a snowy fjord at dusk and a film-grain tile.
// Run with `npm run art`; the outputs are committed so CI never needs a browser.
// Procedural and seeded: an original landscape, the same pixels on every run.
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

function paint({ W, H, seed, BG }) {
  function rng(s) {
    return () => {
      s |= 0;
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const rand = rng(seed);
  const perm = [...Array(256).keys()];
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  const P = new Uint8Array(512);
  for (let i = 0; i < 512; i++) P[i] = perm[i & 255];
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const lerp = (t, a, b) => a + t * (b - a);
  const grad = (h, x, y) => [x + y, -x + y, x - y, -x - y, x, -x, y, -y][h & 7];
  const noise = (x, y) => {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    x -= Math.floor(x);
    y -= Math.floor(y);
    const u = fade(x);
    const v = fade(y);
    const a = P[X] + Y;
    const b = P[X + 1] + Y;
    return lerp(v, lerp(u, grad(P[a], x, y), grad(P[b], x - 1, y)), lerp(u, grad(P[a + 1], x, y - 1), grad(P[b + 1], x - 1, y - 1)));
  };
  const fbm = (x, y, oct = 5) => {
    let s = 0;
    let a = 0.5;
    for (let o = 0; o < oct; o++) {
      s += a * noise(x, y);
      x *= 2.03;
      y *= 2.03;
      a *= 0.5;
    }
    return s;
  };
  const ridged = (x, y, oct = 5) => {
    let s = 0;
    let a = 0.5;
    let norm = 0;
    for (let o = 0; o < oct; o++) {
      const n = 1 - Math.abs(noise(x, y));
      s += a * n * n;
      norm += a;
      x *= 2.1;
      y *= 2.1;
      a *= 0.5;
    }
    return s / norm;
  };
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const smooth = (a, b, v) => {
    const t = clamp((v - a) / (b - a));
    return t * t * (3 - 2 * t);
  };
  const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const mix = (c, d, t) => [c[0] + (d[0] - c[0]) * t, c[1] + (d[1] - c[1]) * t, c[2] + (d[2] - c[2]) * t];
  const gauss = (v, m, s) => Math.exp(-(((v - m) / s) ** 2));

  const buf = new Float32Array(W * H * 3);
  const set = (x, y, c) => {
    const i = (y * W + x) * 3;
    buf[i] = c[0];
    buf[i + 1] = c[1];
    buf[i + 2] = c[2];
  };
  const get = (x, y) => {
    const i = (clamp(Math.round(y), 0, H - 1) * W + clamp(Math.round(x), 0, W - 1)) * 3;
    return [buf[i], buf[i + 1], buf[i + 2]];
  };

  const HZ = Math.round(H * 0.56); // waterline
  const GX = W * 0.4; // where the ember glow sits on the horizon
  const EMBER = hex('#e0623a');

  // Sky: cold steel night above, dull crimson at the horizon, slow clouds.
  const skyStops = [
    [0, hex('#05070a')],
    [0.38, hex('#0c1118')],
    [0.7, hex('#1a202b')],
    [0.9, hex('#33231f')],
    [1, hex('#5a2618')],
  ];
  const sky = (t) => {
    for (let i = 1; i < skyStops.length; i++) if (t <= skyStops[i][0]) return mix(skyStops[i - 1][1], skyStops[i][1], (t - skyStops[i - 1][0]) / (skyStops[i][0] - skyStops[i - 1][0]));
    return skyStops[skyStops.length - 1][1];
  };
  for (let y = 0; y < HZ; y++) {
    for (let x = 0; x < W; x++) {
      let c = sky(y / HZ);
      const cloud = smooth(0.02, 0.42, fbm((x / W) * 2.2, (y / H) * 7 + 3.1));
      const near = gauss(x, GX, W * 0.45) * smooth(0.2, 1, y / HZ);
      c = mix(c, mix(hex('#161c27'), hex('#7a3826'), near), cloud * 0.7);
      const r = Math.hypot((x - GX) / (W * 0.62), (y - HZ) / (H * 0.3));
      const g = Math.max(0, 1 - r) ** 1.8;
      c = mix(c, EMBER, g * 0.5);
      set(x, y, c);
    }
  }
  // A few stars where the clouds thin out.
  for (let i = 0; i < 90; i++) {
    const x = Math.floor(rand() * W);
    const y = Math.floor(rand() * HZ * 0.42);
    if (fbm((x / W) * 2.2, (y / H) * 7 + 3.1) > 0.05) continue;
    const c = get(x, y);
    set(x, y, mix(c, hex('#dfe8f2'), 0.25 + rand() * 0.5));
  }

  // Mountains: three ranges, far to near. Ridged peaks, dark rock, snow on the crests and in the gullies, mist at the feet.
  const ranges = [
    { base: HZ, amp: H * 0.2, f: 3.1, s: 11, env: (u) => 0.65 + 0.35 * gauss(u, 0.55, 0.3), rock: hex('#252a34'), snow: hex('#6d7889'), fog: hex('#2e2a31'), haze: 0.55 },
    { base: HZ, amp: H * 0.32, f: 2.2, s: 23, env: (u) => 0.35 + 0.65 * gauss(u, 0.7, 0.14) + 0.35 * gauss(u, 0.27, 0.11), rock: hex('#16181e'), snow: hex('#8f9aab'), fog: hex('#24222a'), haze: 0.2 },
    { base: HZ, amp: H * 0.46, f: 1.6, s: 37, env: (u) => 0.05 + Math.max(gauss(u, 0, 0.19), 0.95 * gauss(u, 1, 0.16)), rock: hex('#0c0d10'), snow: hex('#5d6673'), fog: hex('#17161a'), haze: 0.05 },
  ];
  for (const R of ranges) {
    const top = new Float32Array(W + 16);
    for (let x = -8; x < W + 8; x++) {
      const u = x / W;
      let v = 0;
      let a = 0.5;
      let t = u * R.f;
      for (let o = 0; o < 7; o++) {
        const n = 1 - Math.abs(noise(t, R.s + o * 7.3));
        v += a * n * n;
        t *= 2.15;
        a *= 0.5;
      }
      v = clamp(v / 0.9) ** 2.1;
      top[x + 8] = R.base - R.amp * R.env(u) * v;
    }
    for (let x = 0; x < W; x++) {
      const t0 = top[x + 8];
      // Which way the face turns: rising to the right means it faces the glow on the left.
      const face = clamp(0.5 + (top[x + 2] - top[x + 14]) * 0.035);
      const snowLine = 0.1 + 0.22 * (fbm((x / W) * 5 + R.s, 1.7, 3) + 0.5);
      const tall = smooth(0.06, 0.22, (R.base - t0) / R.amp); // low saddles near the water keep no snow
      for (let y = Math.max(0, Math.floor(t0)); y < HZ; y++) {
        const d = clamp((y - t0) / (HZ - t0 + 1));
        const gx = x / W;
        const gy = y / H;
        const g = ridged(gx * 11 + R.s, gy * 4.5, 4);
        const tex = fbm(gx * 18 + R.s, gy * 14, 4);
        const lit = clamp(0.25 + 0.75 * (face * Math.exp(-d * 2.2) + 0.5 * (1 - Math.exp(-d * 2.2))) + (g - 0.55) * 0.9 + tex * 0.35);
        const snow = tall * smooth(0.05, 0.25, snowLine - d + (g - 0.55) * 0.6 + lit * 0.12);
        let c = mix(R.rock, R.snow, snow);
        c = c.map((ch) => ch * (0.45 + 0.75 * lit));
        c = mix(c, EMBER, gauss(x, GX, W * 0.28) * lit * (0.08 + snow * 0.2));
        c = mix(c, R.fog, clamp(R.haze + d * d * 0.6));
        set(x, y, c);
      }
    }
    // Mist drifting across the foot of the range.
    for (let y = Math.floor(HZ - H * 0.1); y < HZ; y++) {
      for (let x = 0; x < W; x++) {
        const band = smooth(HZ - H * 0.1, HZ - H * 0.005, y);
        const m = smooth(-0.1, 0.5, fbm((x / W) * 3 + R.s, (y / H) * 16));
        set(x, y, mix(get(x, y), hex('#3d424d'), band * m * 0.35));
      }
    }
  }

  // Water: a dark, softened mirror with slow ripples and a few ember glints under the glow.
  for (let y = HZ; y < H; y++) {
    const k = (y - HZ) / (H - HZ);
    for (let x = 0; x < W; x++) {
      const rx = noise(x * 0.01, y * 0.06) * 6 * (0.4 + k * 2);
      let refl = [0, 0, 0];
      for (let j = 0; j < 4; j++) refl = mix(refl, get(x + rx, 2 * HZ - y + j * 3 * (1 + k * 6)), 1 / (j + 1));
      let c = mix(hex('#07080b'), refl, 0.3 * (1 - k));
      const glint = Math.max(0, noise(x * 0.006, y * 0.35)) ** 4 * gauss(x, GX, W * 0.16) * (1 - k) ** 2;
      c = mix(c, EMBER, clamp(glint * 1.6));
      set(x, y, c);
    }
  }

  // Finish: vignette, fade to the app background at the bottom, grain.
  const bg = hex(BG);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let c = get(x, y);
      const r = Math.hypot((x - W * 0.5) / (W * 0.62), (y - H * 0.42) / (H * 0.62));
      c = c.map((ch) => ch * (1 - 0.5 * smooth(0.55, 1.15, r)));
      c = mix(c, bg, smooth(H * 0.6, H * 0.97, y));
      const n = (rand() - 0.5) * 7;
      set(x, y, c.map((ch) => ch + n));
    }
  }

  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(W, H);
  for (let i = 0, j = 0; i < W * H; i++, j += 3) {
    img.data[i * 4] = clamp(buf[j], 0, 255);
    img.data[i * 4 + 1] = clamp(buf[j + 1], 0, 255);
    img.data[i * 4 + 2] = clamp(buf[j + 2], 0, 255);
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  // Greek ruins on a ledge in the foreground: Doric columns from the old world, carried north.
  // Lit on their right side by the ember glow; an original drawing, no real temple copied.
  {
    const rc = document.createElement('canvas');
    rc.width = W;
    rc.height = H;
    const c2 = rc.getContext('2d');
    const ledgeTop = HZ + H * 0.03;
    const ledgeEnd = W * 0.5;
    const rock = c2.createLinearGradient(0, ledgeTop, 0, H * 0.72);
    rock.addColorStop(0, '#151417');
    rock.addColorStop(0.5, '#0d0c0e');
    rock.addColorStop(1, BG);
    c2.fillStyle = rock;
    c2.beginPath();
    c2.moveTo(-4, H * 0.72);
    const edge = [];
    for (let x = -4; x <= ledgeEnd; x += 5) {
      const fall = smooth(W * 0.36, ledgeEnd, x) * H * 0.05;
      edge.push([x, ledgeTop + fall + noise(x * 0.05, 4.2) * 5 + (rand() - 0.5) * 2]);
    }
    for (const [x, y] of edge) c2.lineTo(x, y);
    c2.lineTo(ledgeEnd + 30, H * 0.72);
    c2.closePath();
    c2.fill();
    // An ember rim along the top of the rock.
    c2.strokeStyle = 'rgba(214, 110, 70, 0.35)';
    c2.lineWidth = 1.2;
    c2.beginPath();
    edge.forEach(([x, y], i) => (i ? c2.lineTo(x, y) : c2.moveTo(x, y)));
    c2.stroke();

    const marble = (x0, x1) => {
      const g = c2.createLinearGradient(x0, 0, x1, 0);
      g.addColorStop(0, '#0f0e11');
      g.addColorStop(0.5, '#262427');
      g.addColorStop(0.82, '#55443d');
      g.addColorStop(1, '#a3664b');
      return g;
    };
    const block = (x, y, w, h) => {
      c2.fillStyle = marble(x, x + w);
      c2.fillRect(x, y, w, h);
      c2.fillStyle = 'rgba(232, 160, 120, 0.28)';
      c2.fillRect(x, y, w, 1.2);
    };
    // Stylobate: two worn steps.
    const stepH = H * 0.011;
    block(W * 0.045, ledgeTop - stepH, W * 0.35, stepH);
    block(W * 0.06, ledgeTop - stepH * 2, W * 0.32, stepH);
    const base = ledgeTop - stepH * 2;
    const cw = W * 0.04;
    const column = (cx, h, broken) => {
      const top = base - h;
      const wb = cw;
      const wt = cw * 0.8;
      c2.fillStyle = marble(cx - wb / 2, cx + wb / 2);
      c2.beginPath();
      c2.moveTo(cx - wb / 2, base);
      c2.lineTo(cx - wt / 2, top);
      if (broken) {
        // A jagged break instead of a capital.
        const n = 6;
        for (let i = 1; i < n; i++) c2.lineTo(cx - wt / 2 + (wt * i) / n, top + (rand() - 0.3) * H * 0.018);
      }
      c2.lineTo(cx + wt / 2, top);
      c2.lineTo(cx + wb / 2, base);
      c2.closePath();
      c2.fill();
      // Fluting.
      c2.strokeStyle = 'rgba(0, 0, 0, 0.35)';
      c2.lineWidth = 1;
      for (let i = 1; i < 6; i++) {
        const t = i / 6;
        c2.beginPath();
        c2.moveTo(cx - wb / 2 + wb * t, base);
        c2.lineTo(cx - wt / 2 + wt * t, top + (broken ? H * 0.02 : 0));
        c2.stroke();
      }
      if (!broken) {
        // Doric capital: echinus and abacus.
        const eh = H * 0.011;
        c2.fillStyle = marble(cx - cw * 0.7, cx + cw * 0.7);
        c2.beginPath();
        c2.moveTo(cx - wt / 2, top);
        c2.lineTo(cx - cw * 0.66, top - eh);
        c2.lineTo(cx + cw * 0.66, top - eh);
        c2.lineTo(cx + wt / 2, top);
        c2.closePath();
        c2.fill();
        block(cx - cw * 0.74, top - eh * 2, cw * 1.48, eh);
      }
      return top - H * 0.022;
    };
    const h = H * 0.2;
    const t1 = column(W * 0.1, h, false);
    column(W * 0.205, h, false);
    column(W * 0.305, H * 0.1, true);
    // Architrave and frieze over the standing pair, broken off past the second column.
    const ax0 = W * 0.1 - cw * 0.74;
    const ax1 = W * 0.205 + cw * 0.95;
    const ah = H * 0.022;
    block(ax0, t1 - ah + H * 0.0, ax1 - ax0, ah);
    const fy = t1 - ah * 2.1;
    block(ax0, fy, ax1 - ax0 - cw * 0.4, ah * 1.1);
    c2.fillStyle = 'rgba(0, 0, 0, 0.4)';
    for (let x = ax0 + 6; x < ax1 - cw * 0.5; x += cw * 0.55) {
      c2.fillRect(x, fy + 2, 1.4, ah * 1.1 - 4);
      c2.fillRect(x + 4, fy + 2, 1.4, ah * 1.1 - 4);
    }
    // A fallen drum at the foot of the steps.
    c2.fillStyle = marble(W * 0.335, W * 0.395);
    c2.beginPath();
    c2.ellipse(W * 0.365, ledgeTop - cw * 0.36, cw * 0.95, cw * 0.36, -0.08, 0, Math.PI * 2);
    c2.fill();
    c2.fillStyle = 'rgba(232, 160, 120, 0.25)';
    c2.beginPath();
    c2.ellipse(W * 0.395, ledgeTop - cw * 0.38, cw * 0.16, cw * 0.34, -0.08, 0, Math.PI * 2);
    c2.fill();

    // Weathering: stains and pitting, then the same haze as the far shore, then grain.
    const y0 = Math.floor(base - H * 0.27);
    const y1 = Math.ceil(H * 0.72);
    c2.globalCompositeOperation = 'source-atop';
    for (let i = 0; i < 260; i++) {
      c2.fillStyle = `rgba(0, 0, 0, ${0.12 + rand() * 0.22})`;
      c2.beginPath();
      c2.ellipse(W * 0.03 + rand() * W * 0.4, y0 + rand() * (ledgeTop - y0), 0.6 + rand() * 2.4, 0.6 + rand() * 4, 0, 0, Math.PI * 2);
      c2.fill();
    }
    c2.fillStyle = 'rgba(34, 31, 37, 0.3)';
    c2.fillRect(0, y0, W, y1 - y0);
    const fogUp = c2.createLinearGradient(0, y0, 0, ledgeTop);
    fogUp.addColorStop(0, 'rgba(62, 66, 78, 0)');
    fogUp.addColorStop(1, 'rgba(62, 66, 78, 0.3)');
    c2.fillStyle = fogUp;
    c2.fillRect(0, y0, W, ledgeTop - y0);
    c2.globalCompositeOperation = 'source-over';
    const img2 = c2.getImageData(0, y0, Math.ceil(W * 0.56), y1 - y0);
    for (let i = 0; i < img2.data.length; i += 4) {
      if (!img2.data[i + 3]) continue;
      const n = (rand() - 0.5) * 22 * Math.min(1, (img2.data[i] + img2.data[i + 1] + img2.data[i + 2]) / 150);
      img2.data[i] += n;
      img2.data[i + 1] += n;
      img2.data[i + 2] += n;
    }
    c2.putImageData(img2, 0, y0);
    ctx.filter = 'blur(0.45px)';
    ctx.drawImage(rc, 0, 0);
    ctx.filter = 'none';
    // Low mist drifting in front of the steps.
    const mist = ctx.createLinearGradient(0, ledgeTop - H * 0.05, 0, ledgeTop + H * 0.02);
    mist.addColorStop(0, 'rgba(70, 75, 88, 0)');
    mist.addColorStop(0.6, 'rgba(70, 75, 88, 0.16)');
    mist.addColorStop(1, 'rgba(70, 75, 88, 0)');
    ctx.fillStyle = mist;
    ctx.fillRect(0, ledgeTop - H * 0.05, W * 0.62, H * 0.07);
  }
  // Falling snow and ash, a little soft.
  for (let i = 0; i < 240; i++) {
    const x = rand() * W;
    const y = rand() * H * 0.75;
    const s = 0.5 + rand() * rand() * 2.2;
    ctx.beginPath();
    ctx.fillStyle = `rgba(226, 232, 240, ${0.15 + rand() * 0.45})`;
    ctx.shadowColor = 'rgba(226, 232, 240, 0.6)';
    ctx.shadowBlur = s > 1.6 ? 3 : 0;
    ctx.arc(x, y, s, 0, Math.PI * 2);
    ctx.fill();
  }
  return cv.toDataURL('image/webp', 0.8);
}

function grain({ N, seed }) {
  let s = seed;
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const cv = document.createElement('canvas');
  cv.width = N;
  cv.height = N;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(N, N);
  for (let i = 0; i < N * N; i++) {
    const v = rand();
    const light = v > 0.5;
    const a = light ? (v - 0.5) * 2 * 20 : (0.5 - v) * 2 * 30;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = light ? 255 : 0;
    img.data[i * 4 + 3] = Math.round(a);
  }
  ctx.putImageData(img, 0, 0);
  return cv.toDataURL('image/png');
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage();
mkdirSync('src/assets/art', { recursive: true });
const save = (file, url) => {
  const data = Buffer.from(url.split(',')[1], 'base64');
  writeFileSync(file, data);
  console.log(`${file}  ${(data.length / 1024).toFixed(1)} KB`);
};
save('src/assets/art/fjord.webp', await page.evaluate(paint, { W: 780, H: 1200, seed: 2029, BG: '#0c0a09' }));
save('src/assets/art/grain.png', await page.evaluate(grain, { N: 160, seed: 7 }));
await browser.close();
