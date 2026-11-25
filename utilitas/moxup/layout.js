// Placement maths for design layers on the print area. Pure: no DOM, no three.js.
//
// A layer sits on the print area in relative units:
//   x, y   centre (0..1, y up; x = 0.5 is the front of the product)
//   size   its height as a fraction of the area height
//   rot    degrees, clockwise      aspect   width / height
// area = { w, h, unit, wrap, safeW, safeH, midY } in print-canvas pixels.
//   unit   canvas pixels per unit of the 3D scene (every product is about 2 units tall or wide)
//   wrap   the area closes around the body (mug, tumbler)
//   safe   the box a design fits in while staying fully visible from the front
//   midY   height of the middle of the printable band (0..1)

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const mod1 = (v) => ((v % 1) + 1) % 1;

export function boxOf(L, area) {
  const h = L.size * area.h;
  return { cx: L.x * area.w, cy: (1 - L.y) * area.h, w: h * L.aspect, h, rot: (L.rot * Math.PI) / 180 };
}

// shortest horizontal distance, going around the body when the area wraps
export function wrapDx(dx, area) {
  if (!area.wrap) return dx;
  return ((((dx + area.w / 2) % area.w) + area.w) % area.w) - area.w / 2;
}

// canvas point -> the layer's own axes (origin at its centre, rotation undone)
export function toLocal(L, area, X, Y) {
  const b = boxOf(L, area);
  const dx = wrapDx(X - b.cx, area), dy = Y - b.cy;
  const c = Math.cos(-b.rot), s = Math.sin(-b.rot);
  return { x: dx * c - dy * s, y: dx * s + dy * c, b };
}

// Sized in scene units, so handles look the same on every product.
export const handleSize = (area) => area.unit * 0.038; // radius of a drawn handle
export const knobOffset = (area) => area.unit * 0.17; // rotate knob sits this far above the box

// What a pointer at (X, Y) grabs on layer L: 'rotate', 'scale', 'move' or null.
export function grab(L, area, X, Y, withHandles) {
  const { x, y, b } = toLocal(L, area, X, Y);
  if (withHandles) {
    const reach = handleSize(area) * 2;
    if (Math.hypot(x, y + b.h / 2 + knobOffset(area)) <= reach) return 'rotate';
    if (Math.hypot(Math.abs(x) - b.w / 2, Math.abs(y) - b.h / 2) <= reach) return 'scale';
  }
  return Math.abs(x) <= b.w / 2 && Math.abs(y) <= b.h / 2 ? 'move' : null;
}

// Largest size that keeps the whole design visible from the front.
export function fitSize(aspect, area) {
  return Math.min(area.safeH, area.safeW / aspect) / area.h;
}

// Carry all layers over to another product. The composition keeps its shape around the front
// centre and fills the same share of the new safe box, so switching back restores the old sizes.
export function remapAll(layers, from, to) {
  const fromX = from.midX ?? 0.5, toX = to.midX ?? 0.5;
  let bw = 1, bh = 1; // extent of the whole composition, symmetric around the centre
  for (const L of layers) {
    const b = boxOf(L, from), c = Math.abs(Math.cos(b.rot)), s = Math.abs(Math.sin(b.rot));
    bw = Math.max(bw, 2 * Math.abs((L.x - fromX) * from.w) + b.w * c + b.h * s);
    bh = Math.max(bh, 2 * Math.abs((L.y - from.midY) * from.h) + b.w * s + b.h * c);
  }
  const share = Math.max(bw / from.safeW, bh / from.safeH); // 1 = exactly fills the safe box
  const k = share / Math.max(bw / to.safeW, bh / to.safeH);
  return layers.map((L) => {
    const x = toX + ((L.x - fromX) * from.w * k) / to.w;
    const y = to.midY + ((L.y - from.midY) * from.h * k) / to.h;
    return { ...L, x: to.wrap ? mod1(x) : clamp(x, 0, 1), y: clamp(y, 0, 1), size: (L.size * from.h * k) / to.h };
  });
}

// --- dragging. start = { L: copy of the layer at pointer down, X, Y: pointer down point } ---

// Returns the new centre, plus which centre lines it snapped to.
export function dragMove(start, area, X, Y) {
  const tol = area.unit * 0.025, midX = area.midX ?? 0.5;
  let x = start.L.x + wrapDx(X - start.X, area) / area.w;
  x = area.wrap ? mod1(x) : clamp(x, 0, 1);
  let y = clamp(start.L.y - (Y - start.Y) / area.h, 0, 1);
  const snapX = Math.abs(wrapDx((x - midX) * area.w, area)) < tol;
  const snapY = Math.abs(y - area.midY) * area.h < tol;
  if (snapX) x = midX;
  if (snapY) y = area.midY;
  return { x, y, snapX, snapY };
}

// Corner drag: grow or shrink around the centre.
export function dragScale(start, area, X, Y) {
  const a = toLocal(start.L, area, start.X, start.Y), b = toLocal(start.L, area, X, Y);
  return clamp((start.L.size * Math.hypot(b.x, b.y)) / Math.max(1, Math.hypot(a.x, a.y)), 0.02, 4);
}

// Knob drag: the knob follows the pointer; straight angles are sticky.
export function dragRotate(start, area, X, Y) {
  const p = toLocal({ ...start.L, rot: 0 }, area, X, Y);
  let deg = (Math.atan2(p.x, -p.y) * 180) / Math.PI;
  const near = Math.round(deg / 90) * 90;
  if (Math.abs(deg - near) < 4) deg = near;
  return deg === -180 ? 180 : Math.round(deg);
}

// ---------- multi-layer pattern & randomizer ----------

function mulberry32(seed) {
  let t = (seed >>> 0) || 1;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffledOrder(n, seed, rng) {
  const order = Array.from({ length: n }, (_, i) => i);
  if (seed <= 1) return order;
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

// Pack items sequentially across width W into rows with even spacing.
function packRows(order, dims, W, gapPx, fill, maxRows) {
  const rows = [];
  let cursor = 0;
  const limit = fill ? maxRows : Math.ceil(order.length / 1);
  for (let r = 0; r < limit; r++) {
    if (!fill && cursor >= order.length) break;
    const row = [];
    let used = 0;
    const rowStart = fill ? (cursor + r) % order.length : cursor;
    let c = 0;
    while (fill || cursor < order.length) {
      const idx = order[(fill ? rowStart + c : cursor) % order.length];
      const d = dims[idx];
      const next = row.length ? used + gapPx + d.bw : d.bw;
      if (row.length && next > W) break;
      row.push({ idx, d });
      used = next;
      c++;
      if (!fill) cursor++;
      if (fill && c > 64) break;
    }
    if (fill) cursor += c;
    if (row.length) rows.push(row);
  }
  return rows;
}

/**
 * Arrange all visible layers into a multi-logo pattern or organic scatter.
 * Pure & deterministic for a given `pat.seed`.
 * Returns spots: [{ index, cx, cy, w, h, rotDeg }].
 */
export function arrangePattern(items, area, pat) {
  const n = items.length;
  if (!n || !area) return [];

  const mode = pat.mode || 'brick';
  const fill = pat.fill !== false;
  const gap = Math.max(0.02, pat.gap ?? 0.35);
  const baseRot = pat.rot || 0;
  const jitter = pat.jitter || 0;
  const balance = pat.balance !== false;
  const seed = pat.seed || 1;
  const rng = mulberry32(seed);

  const padBand = area.wrap ? 0.03 : 0.08;
  const b0 = (area.bandY0 ?? 0) + padBand;
  const b1 = (area.bandY1 ?? 1) - padBand;
  const topY = (1 - b1) * area.h;
  const botY = (1 - b0) * area.h;
  const bandH = Math.max(1, botY - topY);
  const midCy = (topY + botY) / 2;
  const plateR = 0.42 * Math.min(area.w, area.h);
  const maxAllowedW = area.wrap ? area.w * 0.45 : plateR * 1.5;

  const baseH = clamp(pat.size ?? 0.14, 0.03, 0.6) * bandH;
  const gapPx = baseH * gap;
  const cos = Math.abs(Math.cos((baseRot * Math.PI) / 180));
  const sin = Math.abs(Math.sin((baseRot * Math.PI) / 180));

  const dims = items.map((it) => {
    const asp = clamp(it.aspect || 1, 0.15, 8);
    const k = balance ? clamp(1 / Math.sqrt(asp), 0.52, 1.55) : 1;
    let h = baseH * k;
    let w = h * asp;
    if (w > maxAllowedW) {
      const s = maxAllowedW / w;
      w *= s;
      h *= s;
    }
    const bw = w * cos + h * sin;
    const bh = w * sin + h * cos;
    return { w, h, bw, bh, r: Math.hypot(w, h) / 2 };
  });

  const maxBw = Math.max(...dims.map((d) => d.bw));
  const maxBh = Math.max(...dims.map((d) => d.bh));
  const avgBw = dims.reduce((s, d) => s + d.bw, 0) / n;
  const avgBh = dims.reduce((s, d) => s + d.bh, 0) / n;
  const order = shuffledOrder(n, seed, rng);
  const nextAngle = () => baseRot + (jitter ? (rng() - 0.5) * 2 * jitter * 45 : 0);
  const inPlate = (cx, cy, r) => area.wrap || Math.hypot(cx - area.w / 2, cy - area.h / 2) <= plateR - r * 0.35;

  const spots = [];

  if (mode === 'grid') {
    const cellW = maxBw + gapPx;
    const cellH = maxBh + gapPx;
    const wrapFill = area.wrap && fill;
    let cols = wrapFill
      ? Math.max(1, Math.round(area.w / cellW))
      : fill
        ? Math.max(1, Math.floor((2 * plateR) / cellW))
        : Math.min(n, Math.max(1, Math.ceil(Math.sqrt(n * 1.4))));
    if (wrapFill && cols * maxBw > area.w * 0.96) cols = Math.max(1, Math.floor(area.w / cellW));
    const stepX = wrapFill ? area.w / cols : cellW;
    const maxRows = Math.max(1, Math.floor((bandH + gapPx * 0.4) / cellH));
    const rows = fill ? maxRows : Math.ceil(n / cols);
    const startCy = midCy - ((rows - 1) * cellH) / 2;

    let k = 0;
    for (let r = 0; r < rows; r++) {
      const cy = startCy + r * cellH;
      const inThisRow = fill ? cols : Math.min(cols, n - k);
      const startCx = wrapFill ? stepX / 2 : area.w / 2 - ((inThisRow - 1) * stepX) / 2;
      for (let c = 0; c < inThisRow; c++) {
        const idx = order[k % n];
        const d = dims[idx];
        k++;
        const cx = startCx + c * stepX;
        if (!inPlate(cx, cy, d.r)) continue;
        spots.push({ index: idx, cx, cy, w: d.w, h: d.h, rotDeg: nextAngle() });
      }
    }
    return spots;
  }

  if (mode === 'brick') {
    const rowStep = maxBh + gapPx;
    const maxRows = Math.max(1, Math.floor((bandH + gapPx * 0.45) / rowStep));
    const spanW = area.wrap ? (fill ? area.w : Math.min(area.w * 0.9, Math.max(area.safeW, n * (avgBw + gapPx) * 0.6))) : 2 * plateR;
    const rows = packRows(order, dims, spanW, gapPx, fill, maxRows);
    const startCy = midCy - ((rows.length - 1) * rowStep) / 2;

    rows.forEach((row, r) => {
      const cy = startCy + r * rowStep;
      const sumBw = row.reduce((s, it) => s + it.d.bw, 0);
      if (area.wrap && fill) {
        const gapEach = Math.max(0, area.w - sumBw) / row.length;
        const shift = (r % 2) * (area.w / (row.length * 2));
        let x = shift;
        for (const it of row) {
          const cx = ((x + it.d.bw / 2) % area.w + area.w) % area.w;
          spots.push({ index: it.idx, cx, cy, w: it.d.w, h: it.d.h, rotDeg: nextAngle() });
          x += it.d.bw + gapEach;
        }
      } else {
        const totalW = sumBw + Math.max(0, row.length - 1) * gapPx;
        const stagger = rows.length > 1 ? ((r % 2) - 0.5) * (avgBw * 0.35) : 0;
        let x = area.w / 2 - totalW / 2 + stagger;
        for (const it of row) {
          const cx = x + it.d.bw / 2;
          if (inPlate(cx, cy, it.d.r)) spots.push({ index: it.idx, cx, cy, w: it.d.w, h: it.d.h, rotDeg: nextAngle() });
          x += it.d.bw + gapPx;
        }
      }
    });
    return spots;
  }

  if (mode === 'ring') {
    if (!area.wrap) {
      const centerX = area.w / 2;
      const centerY = area.h / 2;
      const ringStep = maxBh + gapPx;
      let R = plateR - Math.max(maxBw, maxBh) * 0.55;
      let cursor = 0;
      const maxRings = fill ? 6 : 1;
      for (let ring = 0; ring < maxRings && R > maxBh * 0.55; ring++) {
        const circ = 2 * Math.PI * R;
        const step = avgBw + gapPx;
        const count = fill ? Math.max(3, Math.floor(circ / step)) : n;
        for (let i = 0; i < count; i++) {
          const idx = order[cursor % n];
          const d = dims[idx];
          cursor++;
          const theta = (i / count) * Math.PI * 2 - Math.PI / 2 + (ring % 2) * (Math.PI / count);
          const cx = centerX + Math.cos(theta) * R;
          const cy = centerY + Math.sin(theta) * R;
          const rotDeg = (theta * 180) / Math.PI + 90 + nextAngle();
          spots.push({ index: idx, cx, cy, w: d.w, h: d.h, rotDeg });
        }
        R -= ringStep;
      }
      if (fill && R <= maxBh * 0.55 && R >= -maxBh * 0.1) {
        const idx = order[cursor % n];
        const d = dims[idx];
        spots.push({ index: idx, cx: centerX, cy: centerY, w: d.w, h: d.h, rotDeg: nextAngle() });
      }
      return spots;
    }

    const rowStep = maxBh + gapPx;
    const maxBelts = fill ? Math.max(1, Math.floor((bandH + gapPx * 0.4) / rowStep)) : 1;
    const belts = packRows(order, dims, area.w, gapPx, fill, maxBelts);
    const startCy = midCy - ((belts.length - 1) * rowStep) / 2;
    belts.forEach((row, r) => {
      const cy = startCy + r * rowStep;
      const sumBw = row.reduce((s, it) => s + it.d.bw, 0);
      if (fill || sumBw + (row.length - 1) * gapPx > area.safeW) {
        const gapEach = Math.max(0, area.w - sumBw) / row.length;
        let x = (r % 2) * (area.w / (row.length * 2));
        for (const it of row) {
          const cx = ((x + it.d.bw / 2) % area.w + area.w) % area.w;
          spots.push({ index: it.idx, cx, cy, w: it.d.w, h: it.d.h, rotDeg: nextAngle() });
          x += it.d.bw + gapEach;
        }
      } else {
        const totalW = sumBw + Math.max(0, row.length - 1) * gapPx;
        let x = area.w / 2 - totalW / 2;
        for (const it of row) {
          spots.push({ index: it.idx, cx: x + it.d.bw / 2, cy, w: it.d.w, h: it.d.h, rotDeg: nextAngle() });
          x += it.d.bw + gapPx;
        }
      }
    });
    return spots;
  }

  // 'scatter' — organic anti-overlap best-candidate + gentle relaxation
  const avgCellArea = (avgBw + gapPx) * (avgBh + gapPx);
  const usableArea = area.wrap ? area.w * bandH : Math.PI * plateR * plateR;
  const target = fill ? Math.round(clamp((usableArea / Math.max(1, avgCellArea)) * 0.72, n, 72)) : n;
  const focusFront = area.wrap && !fill && n * avgCellArea < area.safeW * bandH * 0.8;
  const xMin = focusFront ? area.w * 0.22 : 0;
  const xSpan = focusFront ? area.w * 0.56 : area.w;

  const sampleSpot = (d) => {
    const minY = Math.min(midCy, topY + d.bh * 0.52);
    const maxY = Math.max(midCy, botY - d.bh * 0.52);
    if (!area.wrap) {
      const lim = Math.max(4, plateR - d.r * 0.75);
      const a = rng() * Math.PI * 2;
      const rad = Math.sqrt(rng()) * lim;
      return { cx: area.w / 2 + Math.cos(a) * rad, cy: area.h / 2 + Math.sin(a) * rad };
    }
    return { cx: xMin + rng() * xSpan, cy: minY + rng() * (maxY - minY) };
  };

  for (let k = 0; k < target; k++) {
    const idx = order[k % n];
    const d = dims[idx];
    let best = sampleSpot(d);
    let bestScore = -1;
    const tries = spots.length ? 36 : 1;
    for (let t = 0; t < tries; t++) {
      const cand = t === 0 ? best : sampleSpot(d);
      let minClear = Infinity;
      for (const s of spots) {
        const dx = Math.abs(wrapDx(cand.cx - s.cx, area));
        const dy = Math.abs(cand.cy - s.cy);
        const reqX = (d.bw + s.bw) / 2 + gapPx * 0.55;
        const reqY = (d.bh + s.bh) / 2 + gapPx * 0.55;
        minClear = Math.min(minClear, Math.max(dx / reqX, dy / reqY));
      }
      if (minClear > bestScore) {
        bestScore = minClear;
        best = cand;
        if (bestScore >= 1.25) break;
      }
    }
    spots.push({ index: idx, cx: best.cx, cy: best.cy, w: d.w, h: d.h, bw: d.bw, bh: d.bh, r: d.r, rotDeg: nextAngle() });
  }

  // Light repulsion pass so tight gaps separate cleanly
  for (let pass = 0; pass < 6; pass++) {
    for (let i = 0; i < spots.length; i++) {
      const a = spots[i];
      for (let j = i + 1; j < spots.length; j++) {
        const b = spots[j];
        const dx = wrapDx(b.cx - a.cx, area);
        const dy = b.cy - a.cy;
        const reqX = (a.bw + b.bw) / 2 + gapPx * 0.45;
        const reqY = (a.bh + b.bh) / 2 + gapPx * 0.45;
        if (Math.abs(dx) >= reqX || Math.abs(dy) >= reqY) continue;
        const ox = reqX - Math.abs(dx);
        const oy = reqY - Math.abs(dy);
        if (ox < oy) {
          const push = (dx >= 0 ? 1 : -1) * ox * 0.25;
          a.cx -= push;
          b.cx += push;
        } else {
          const push = (dy >= 0 ? 1 : -1) * oy * 0.25;
          a.cy -= push;
          b.cy += push;
        }
      }
      if (area.wrap) {
        a.cx = ((a.cx % area.w) + area.w) % area.w;
        const minY = Math.min(midCy, topY + a.bh * 0.5);
        const maxY = Math.max(midCy, botY - a.bh * 0.5);
        a.cy = clamp(a.cy, minY, maxY);
      } else {
        const vx = a.cx - area.w / 2, vy = a.cy - area.h / 2;
        const dist = Math.hypot(vx, vy), lim = Math.max(4, plateR - a.r * 0.65);
        if (dist > lim) {
          a.cx = area.w / 2 + (vx / dist) * lim;
          a.cy = area.h / 2 + (vy / dist) * lim;
        }
      }
    }
  }

  return spots.map(({ index, cx, cy, w, h, rotDeg }) => ({ index, cx, cy, w, h, rotDeg }));
}
