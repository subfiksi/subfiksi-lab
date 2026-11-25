import * as THREE from 'three';

// Analytical smooth-beveled box with flat faces (zero shading bleed onto flat panels)
// and exact 5-face non-overlapping box-net UVs (+Y top, +Z front, -Z back, -X left, +X right).
function roundedBox(w, h, d, r = 0.035, seg = 5, net = null) {
  const rad = Math.min(r, w * 0.4, h * 0.4, d * 0.4);
  const hx = w / 2 - rad, hy = h / 2 - rad, hz = d / 2 - rad;
  const n = seg * 2 + 1;

  // Map grid index 0..n into [-half, +half] clustered inside the bevel [0..rad] at both ends
  const axisCoords = (half, inner) => {
    const out = new Array(n + 1);
    for (let i = 0; i <= seg; i++) {
      out[i] = -half + (i / seg) * rad;
      out[n - i] = half - (i / seg) * rad;
    }
    out[seg] = -inner;
    out[seg + 1] = inner;
    return out;
  };

  const xs = axisCoords(w / 2, hx);
  const ys = axisCoords(h / 2, hy);
  const zs = axisCoords(d / 2, hz);

  const pos = [], nrm = [], uvs = [], idx = [];
  const k = 0.90 / Math.max(w + 2 * h, d + 2 * h);
  const W = w * k, H = h * k, D = d * k;
  const uvNet = net || {
    top:   { x: 0.5 - W / 2,     y: 0.5 - D / 2,     w: W, h: D },
    front: { x: 0.5 - W / 2,     y: 0.5 - D / 2 - H, w: W, h: H },
    back:  { x: 0.5 - W / 2,     y: 0.5 + D / 2,     w: W, h: H },
    left:  { x: 0.5 - W / 2 - H, y: 0.5 - D / 2,     w: H, h: D },
    right: { x: 0.5 + W / 2,     y: 0.5 - D / 2,     w: H, h: D },
  };

  // Build 6 faces: [axisU, axisV, fixedVal, flipWinding, uvFn]
  const faces = [
    { // +Z Front
      pt: (iu, iv) => [xs[iu], ys[iv], d / 2],
      uv: (px, py) => uvNet.front ? [uvNet.front.x + (px / w + 0.5) * uvNet.front.w, uvNet.front.y + (py / h + 0.5) * uvNet.front.h] : [-1, -1],
    },
    { // -Z Back
      pt: (iu, iv) => [xs[n - iu], ys[iv], -d / 2],
      uv: (px, py) => uvNet.back ? [uvNet.back.x + (0.5 - px / w) * uvNet.back.w, uvNet.back.y + (py / h + 0.5) * uvNet.back.h] : [-1, -1],
    },
    { // +Y Top
      pt: (iu, iv) => [xs[iu], h / 2, zs[n - iv]],
      uv: (px, _py, pz) => uvNet.top ? [uvNet.top.x + (px / w + 0.5) * uvNet.top.w, uvNet.top.y + (0.5 - pz / d) * uvNet.top.h] : [-1, -1],
    },
    { // -Y Bottom
      pt: (iu, iv) => [xs[iu], -h / 2, zs[iv]],
      uv: () => [-1, -1],
    },
    { // +X Right
      pt: (iu, iv) => [w / 2, ys[iv], zs[n - iu]],
      uv: (_px, py, pz) => uvNet.right ? [uvNet.right.x + (0.5 - py / h) * uvNet.right.w, uvNet.right.y + (0.5 - pz / d) * uvNet.right.h] : [-1, -1],
    },
    { // -X Left
      pt: (iu, iv) => [-w / 2, ys[iv], zs[iu]],
      uv: (_px, py, pz) => uvNet.left ? [uvNet.left.x + (py / h + 0.5) * uvNet.left.w, uvNet.left.y + (0.5 - pz / d) * uvNet.left.h] : [-1, -1],
    },
  ];

  let vBase = 0;
  for (const f of faces) {
    for (let iv = 0; iv <= n; iv++) {
      for (let iu = 0; iu <= n; iu++) {
        const [px, py, pz] = f.pt(iu, iv);
        const cx = THREE.MathUtils.clamp(px, -hx, hx);
        const cy = THREE.MathUtils.clamp(py, -hy, hy);
        const cz = THREE.MathUtils.clamp(pz, -hz, hz);
        let dx = px - cx, dy = py - cy, dz = pz - cz;
        const len = Math.hypot(dx, dy, dz) || 1;
        dx /= len; dy /= len; dz /= len;
        const fx = cx + dx * rad, fy = cy + dy * rad, fz = cz + dz * rad;
        pos.push(fx, fy, fz);
        nrm.push(dx, dy, dz);
        const [u, v] = f.uv(fx, fy, fz);
        uvs.push(u, v);
      }
    }
    for (let iv = 0; iv < n; iv++) {
      for (let iu = 0; iu < n; iu++) {
        const a = vBase + iv * (n + 1) + iu;
        const b = a + 1;
        const c = a + (n + 1);
        const dIdx = c + 1;
        idx.push(a, b, dIdx, a, dIdx, c);
      }
    }
    vBase += (n + 1) * (n + 1);
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  return g;
}

function unprinted(g) {
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, -1, -1);
  uv.needsUpdate = true;
  return g;
}

export function buildBox(spec) {
  const out = [];
  const { style, w, h, d, r = 0.035 } = spec;

  if (style === 'shoe') {
    // Two-piece shoebox: lower tray (separate colorable part) + overhanging beveled lid (printable)
    const lidH = 0.44, overhang = 0.07;
    const trayH = h - 0.14;
    const tray = unprinted(roundedBox(w - 0.04, trayH, d - 0.04, r * 0.8));
    tray.translate(0, -h / 2 + trayH / 2, 0);
    out.push({ name: 'tray', g: tray });

    const lw = w + overhang * 2, ld = d + overhang * 2;
    const lid = roundedBox(lw, lidH, ld, r);
    lid.translate(0, h / 2 - lidH / 2, 0);
    out.push({ name: 'body', g: lid });
    return out;
  }

  if (style === 'cake') {
    // Square bakery box: printable lower box + slightly overhanging printable lid + front tuck tab
    const lidH = 0.28, overhang = 0.035;
    const baseH = h - 0.04;
    const base = roundedBox(w, baseH, d, r);
    base.translate(0, -0.02, 0);
    out.push({ name: 'body', g: base });

    // Top lid collar using matching Top + upper rim UVs
    const lw = w + overhang * 2, ld = d + overhang * 2;
    const k = 0.90 / Math.max(w + 2 * h, d + 2 * h);
    const W = w * k, H = h * k, D = d * k;
    const lidRimH = lidH * k;
    const lid = roundedBox(lw, lidH, ld, r * 0.85, 5, {
      top:   { x: 0.5 - W / 2,     y: 0.5 - D / 2,             w: W, h: D },
      front: { x: 0.5 - W / 2,     y: 0.5 - D / 2 - lidRimH,   w: W, h: lidRimH },
      back:  { x: 0.5 - W / 2,     y: 0.5 + D / 2,             w: W, h: lidRimH },
      left:  { x: 0.5 - W / 2 - lidRimH, y: 0.5 - D / 2,       w: lidRimH, h: D },
      right: { x: 0.5 + W / 2,     y: 0.5 - D / 2,             w: lidRimH, h: D },
    });
    lid.translate(0, h / 2 - lidH / 2 + 0.01, 0);
    out.push({ name: 'body', g: lid });

    // Subtle front tuck-flap tab
    const tab = unprinted(roundedBox(w * 0.24, 0.09, 0.03, 0.012, 3));
    tab.translate(0, h / 2 - lidH - 0.01, ld / 2 - 0.005);
    out.push({ name: 'accent', g: tab });
    return out;
  }

  if (style === 'mailer') {
    // Sleek corrugated e-commerce mailer box with folded front lip & thumb cutout accent
    const body = roundedBox(w, h, d, r);
    out.push({ name: 'body', g: body });

    // Double-wall top lid fold edge (slightly inset bevel lip)
    const lid = roundedBox(w - 0.05, 0.06, d - 0.03, 0.018, 3, {
      top: { x: 0.5 - (w * 0.90 / Math.max(w + 2 * h, d + 2 * h)) / 2, y: 0.5 - (d * 0.90 / Math.max(w + 2 * h, d + 2 * h)) / 2, w: w * 0.90 / Math.max(w + 2 * h, d + 2 * h), h: d * 0.90 / Math.max(w + 2 * h, d + 2 * h) },
    });
    lid.translate(0, h / 2 - 0.01, 0);
    out.push({ name: 'body', g: lid });

    const notch = unprinted(roundedBox(w * 0.20, 0.055, 0.04, 0.015, 3));
    notch.translate(0, h / 2 - 0.05, d / 2 - 0.008);
    out.push({ name: 'accent', g: notch });
    return out;
  }

  // 'cube' or 'tall' two-piece rigid gift/product box with crisp lid seam
  const lidH = Math.min(0.42, h * 0.28), overhang = 0.028;
  const base = roundedBox(w, h - 0.02, d, r);
  out.push({ name: 'body', g: base });

  const k = 0.90 / Math.max(w + 2 * h, d + 2 * h);
  const W = w * k, D = d * k, lidRimH = lidH * k;
  const lid = roundedBox(w + overhang * 2, lidH, d + overhang * 2, r * 0.9, 5, {
    top:   { x: 0.5 - W / 2,     y: 0.5 - D / 2,           w: W, h: D },
    front: { x: 0.5 - W / 2,     y: 0.5 - D / 2 - lidRimH, w: W, h: lidRimH },
    back:  { x: 0.5 - W / 2,     y: 0.5 + D / 2,           w: W, h: lidRimH },
    left:  { x: 0.5 - W / 2 - lidRimH, y: 0.5 - D / 2,     w: lidRimH, h: D },
    right: { x: 0.5 + W / 2,     y: 0.5 - D / 2,           w: lidRimH, h: D },
  });
  lid.translate(0, h / 2 - lidH / 2 + 0.01, 0);
  out.push({ name: 'body', g: lid });
  return out;
}
