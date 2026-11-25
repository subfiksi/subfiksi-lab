// Paints the design layers onto the print canvas, which stage.js wraps around the product.
import { boxOf, handleSize, knobOffset, arrangePattern } from './layout.js';

// ---------- uploaded images ----------
export const assets = new Map(); // id -> { src: canvas, w, h: original pixels, cut, thumb }
let serial = 0;
// shortcut: uploads are kept at most 2048 px on the long side, raise if huge prints must stay sharp
const WORK = 2048;

export function addAsset(image) {
  const w = image.naturalWidth || image.width, h = image.naturalHeight || image.height;
  const k = Math.min(1, WORK / Math.max(w, h));
  const src = document.createElement('canvas');
  src.width = Math.max(1, Math.round(w * k));
  src.height = Math.max(1, Math.round(h * k));
  const g = src.getContext('2d');
  g.imageSmoothingQuality = 'high';
  g.drawImage(image, 0, 0, src.width, src.height);
  const id = 'img' + ++serial;
  assets.set(id, { src, w, h, cut: null, fx: null, thumb: null });
  return id;
}

export function thumbUrl(id) {
  const a = assets.get(id);
  if (!a.thumb) {
    const c = document.createElement('canvas');
    c.width = c.height = 72;
    const k = Math.min(72 / a.src.width, 72 / a.src.height);
    c.getContext('2d').drawImage(a.src, 36 - (a.src.width * k) / 2, 36 - (a.src.height * k) / 2, a.src.width * k, a.src.height * k);
    a.thumb = c.toDataURL();
  }
  return a.thumb;
}

// White (and nearly white) becomes see-through, so a logo on a white page sits cleanly on a coloured product.
function whiteToClear(src, tol) {
  const c = document.createElement('canvas');
  c.width = src.width;
  c.height = src.height;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(src, 0, 0);
  const im = g.getImageData(0, 0, c.width, c.height), d = im.data;
  const t = tol * 255, soft = 24; // fade over the next 24 levels so edges stay smooth
  for (let i = 0; i < d.length; i += 4) {
    const far = 255 - Math.min(d[i], d[i + 1], d[i + 2]); // distance from pure white
    if (far <= t) d[i + 3] = 0;
    else if (far < t + soft) d[i + 3] = (d[i + 3] * (far - t)) / soft;
  }
  g.putImageData(im, 0, 0);
  return c;
}

// The picture a layer draws: the upload, with white removed and colours adjusted when asked.
// Adjusting happens here on a canvas of its own, never with ctx.filter on the print canvas:
// in Chrome a filter there made later drawing land in the wrong order (old pictures reappeared).
function source(L) {
  const a = assets.get(L.asset);
  let pic = a.src;
  if (L.cut) {
    if (!a.cut || a.cut.tol !== L.cutTol) a.cut = { tol: L.cutTol, canvas: whiteToClear(a.src, L.cutTol) };
    pic = a.cut.canvas;
  }
  const tint = L.tintMode === 'white' ? '#FFFFFF'
    : L.tintMode === 'black' ? '#000000'
    : L.tintMode === 'custom' ? (L.tintColor || '#FF6600')
    : '';
  if (!tint && L.bright === 1 && L.contrast === 1 && L.sat === 1) return pic;
  const key = [L.cut && L.cutTol, L.bright, L.contrast, L.sat, tint].join();
  if (!a.fx || a.fx.key !== key) {
    const c = document.createElement('canvas');
    c.width = pic.width;
    c.height = pic.height;
    const g = c.getContext('2d');
    if (tint) {
      g.drawImage(pic, 0, 0);
      g.globalCompositeOperation = 'source-in';
      g.fillStyle = tint;
      g.fillRect(0, 0, c.width, c.height);
      g.globalCompositeOperation = 'source-over';
    } else {
      g.filter = `brightness(${L.bright}) contrast(${L.contrast}) saturate(${L.sat})`;
      g.drawImage(pic, 0, 0);
    }
    a.fx = { key, canvas: c };
  }
  return a.fx.canvas;
}

// ---------- text ----------
const LINE = 1.15;
const meter = document.createElement('canvas').getContext('2d');

export const fontCss = (L, px) => `${L.italic ? 'italic ' : ''}${L.bold ? 700 : 400} ${px}px "${L.font}", sans-serif`;

function prep(g, L) {
  g.font = fontCss(L, 100);
  if ('letterSpacing' in g) g.letterSpacing = L.spacing * 100 + 'px';
}

// Text laid out at font size 100: the box that holds it, and paint(g, put) which calls
// put(string, x, y) for every piece with g's origin at the box centre.
function textLayout(L) {
  prep(meter, L);
  const pad = 6 + L.stroke * 50; // room for the outline
  const text = L.text || ' ';

  if (!L.curve) {
    const lines = text.split('\n');
    const w = Math.max(1, ...lines.map((t) => meter.measureText(t).width)) + pad * 2;
    const h = lines.length * 100 * LINE + pad * 2;
    return {
      w, h,
      paint(g, put) {
        g.textAlign = L.align;
        g.textBaseline = 'middle';
        const x = L.align === 'left' ? -w / 2 + pad : L.align === 'right' ? w / 2 - pad : 0;
        lines.forEach((t, i) => put(t, x, -h / 2 + pad + (i + 0.5) * 100 * LINE));
      },
    };
  }

  // Curved: one line bent along a circle. Positive = arch (bulges up), negative = smile.
  const chars = [...text.replace(/\n/g, ' ')];
  const adv = chars.map((c) => meter.measureText(c).width);
  const total = adv.reduce((p, q) => p + q, 0) || 1;
  const up = L.curve > 0;
  const theta = Math.min((Math.abs(L.curve) * Math.PI) / 180, total / 70); // keep the circle wider than a glyph
  const r = total / theta, half = theta / 2;
  const m = meter.measureText('Hg');
  const asc = m.fontBoundingBoxAscent || 80, desc = m.fontBoundingBoxDescent || 22;
  const ro = r + (up ? asc : desc), ri = Math.max(0, r - (up ? desc : asc));
  // extents with the circle centre at 0,0 and the arch pointing up; a smile is the same shape upside down
  const xmax = half >= Math.PI / 2 ? ro : ro * Math.sin(half);
  const bottom = half >= Math.PI ? ro : half <= Math.PI / 2 ? -ri * Math.cos(half) : -ro * Math.cos(half);
  const mid = (bottom - ro) / 2;
  return {
    w: 2 * xmax + pad * 2,
    h: bottom + ro + pad * 2,
    paint(g, put) {
      g.textAlign = 'center';
      g.textBaseline = 'alphabetic';
      let run = -total / 2;
      chars.forEach((c, i) => {
        const phi = (run + adv[i] / 2) / r;
        run += adv[i];
        g.save();
        if (up) { g.translate(0, -mid); g.rotate(phi); g.translate(0, -r); }
        else { g.translate(0, mid); g.rotate(-phi); g.translate(0, r); }
        put(c, 0, 0);
        g.restore();
      });
    },
  };
}

// Size of a text layer's box at font size 100.
export function textBox(L) {
  const { w, h } = textLayout(L);
  return { w, h };
}

function drawText(g, L, h) {
  const t = textLayout(L), k = h / t.h;
  g.scale(k, k);
  prep(g, L);
  if (L.stroke > 0) { // all outlines first, so no outline covers a neighbouring letter
    g.lineWidth = L.stroke * 100;
    g.lineJoin = 'round';
    g.strokeStyle = L.strokeColor;
    t.paint(g, (s, x, y) => g.strokeText(s, x, y));
  }
  g.fillStyle = L.color;
  t.paint(g, (s, x, y) => g.fillText(s, x, y));
}

// ---------- layers ----------

// Where a layer is drawn: once, plus a second copy when it crosses the seam of a wrapping
// area, or on a whole grid when it is a repeating pattern.
function spots(L, b, area) {
  const reach = Math.hypot(b.w, b.h) / 2, out = [];
  const push = (x, y) => {
    out.push([x, y]);
    if (!area.wrap) return;
    if (x - reach < 0) out.push([x + area.w, y]);
    if (x + reach > area.w) out.push([x - area.w, y]);
  };
  if (!L.tile) { push(b.cx, b.cy); return out; }

  const least = area.h / 40; // keeps a tiny tile from becoming thousands of draws
  const stepY = Math.max(least, b.h * (1 + L.gap));
  const wantX = Math.max(least, b.w * (1 + L.gap));
  const n = Math.max(1, Math.round(area.w / wantX));
  const stepX = area.wrap ? area.w / n : wantX; // around a body the pattern must close exactly
  const j0 = Math.ceil((-reach - b.cy) / stepY), j1 = Math.floor((area.h + reach - b.cy) / stepY);
  for (let j = j0; j <= j1; j++) {
    const x0 = b.cx + (L.brick && j % 2 ? stepX / 2 : 0), y = b.cy + j * stepY;
    if (area.wrap) {
      for (let i = 0; i < n; i++) push((((x0 + i * stepX) % area.w) + area.w) % area.w, y);
    } else {
      const i0 = Math.ceil((-reach - x0) / stepX), i1 = Math.floor((area.w + reach - x0) / stepX);
      for (let i = i0; i <= i1; i++) push(x0 + i * stepX, y);
    }
  }
  return out;
}

function paintItem(c, L, w, h, rotRad) {
  c.rotate(rotRad);
  c.scale(L.flipX ? -1 : 1, L.flipY ? -1 : 1);
  if (L.type === 'image') c.drawImage(source(L), -w / 2, -h / 2, w, h);
  else drawText(c, L, h);
}

function drawLayer(g, area, L) {
  const b = boxOf(L, area);
  const paint = (c) => paintItem(c, L, b.w, b.h, b.rot);

  let stamp = null;
  if (L.tile) { // paint one tile, then stamp it everywhere
    const c = Math.abs(Math.cos(b.rot)), s = Math.abs(Math.sin(b.rot));
    stamp = document.createElement('canvas');
    stamp.width = Math.ceil(b.w * c + b.h * s) + 2;
    stamp.height = Math.ceil(b.w * s + b.h * c) + 2;
    const sg = stamp.getContext('2d');
    sg.imageSmoothingQuality = 'high';
    sg.translate(stamp.width / 2, stamp.height / 2);
    paint(sg);
  }

  g.save();
  g.globalAlpha = L.opacity;
  for (const [x, y] of spots(L, b, area)) {
    g.save();
    g.translate(x, y);
    if (stamp) g.drawImage(stamp, -stamp.width / 2, -stamp.height / 2);
    else paint(g);
    g.restore();
  }
  g.restore();
}

function drawPattern(g, area, layers, pattern) {
  const active = layers.filter((l) => l.visible);
  if (!active.length) return;
  const placed = arrangePattern(active, area, pattern);
  for (const spot of placed) {
    const L = active[spot.index];
    const rotRad = (spot.rotDeg * Math.PI) / 180;
    const reach = Math.hypot(spot.w, spot.h) / 2;
    const xs = [spot.cx];
    if (area.wrap) {
      if (spot.cx - reach < 0) xs.push(spot.cx + area.w);
      if (spot.cx + reach > area.w) xs.push(spot.cx - area.w);
    }
    g.save();
    g.globalAlpha = L.opacity;
    for (const x of xs) {
      g.save();
      g.translate(x, spot.cy);
      paintItem(g, L, spot.w, spot.h, rotRad);
      g.restore();
    }
    g.restore();
  }
}

// Frame, corner handles and rotate knob of the selected layer. Editing aid only: never exported.
function drawSelection(g, area, L) {
  const b = boxOf(L, area), hs = handleSize(area), lw = area.unit * 0.008, knob = -b.h / 2 - knobOffset(area);
  const dot = (x, y) => {
    g.beginPath();
    g.arc(x, y, hs, 0, Math.PI * 2);
    g.fillStyle = '#ffffff';
    g.fill();
    g.lineWidth = lw * 1.5;
    g.strokeStyle = '#003380';
    g.stroke();
  };
  for (const ox of area.wrap ? [-area.w, 0, area.w] : [0]) {
    g.save();
    g.translate(b.cx + ox, b.cy);
    g.rotate(b.rot);
    g.lineWidth = lw * 2.5;
    g.strokeStyle = '#ffffff';
    g.strokeRect(-b.w / 2, -b.h / 2, b.w, b.h);
    g.lineWidth = lw;
    g.strokeStyle = '#003380';
    g.strokeRect(-b.w / 2, -b.h / 2, b.w, b.h);
    g.beginPath();
    g.moveTo(0, -b.h / 2);
    g.lineTo(0, knob);
    g.stroke();
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) dot((sx * b.w) / 2, (sy * b.h) / 2);
    dot(0, knob);
    g.restore();
  }
}

// Centre lines shown while a dragged layer is snapped to them.
function drawSnap(g, area, snap) {
  const cx = (area.midX ?? 0.5) * area.w;
  g.save();
  g.lineWidth = area.unit * 0.008;
  g.strokeStyle = '#FF6600';
  g.beginPath();
  if (snap.x) { g.moveTo(cx, 0); g.lineTo(cx, area.h); }
  if (snap.y) { g.moveTo(0, (1 - area.midY) * area.h); g.lineTo(area.w, (1 - area.midY) * area.h); }
  g.stroke();
  g.restore();
}

// selected / snap are editing aids; pass null for a clean print (exports).
export function compose(cv, area, layers, selected, snap, pattern = null) {
  const g = cv.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, cv.width, cv.height);
  g.imageSmoothingQuality = 'high';
  if (pattern?.on) {
    drawPattern(g, area, layers, pattern);
  } else {
    for (const L of layers) if (L.visible) drawLayer(g, area, L);
    if (snap) drawSnap(g, area, snap);
    if (selected && selected.visible) drawSelection(g, area, selected);
  }
}
