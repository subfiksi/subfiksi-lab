// Builds per-vertex garment zone IDs, sewing-pattern edge distances, subtle crease AO, and print UVs.
import * as THREE from 'three';

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

// Connected components over triangle indices using Union-Find; optionally welds duplicate chunk-seam vertices.
function triComponents(pos, nrm, idx, uv = null, weldChunk = false) {
  const vc = pos.count;
  const par = new Int32Array(vc);
  for (let i = 0; i < vc; i++) par[i] = i;
  const find = (x) => {
    while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; }
    return x;
  };
  const unite = (a, b) => {
    a = find(a); b = find(b);
    if (a !== b) par[a] = b;
  };
  if (weldChunk && uv) {
    const seam = new Map();
    for (let i = 0; i < vc; i++) {
      const k = `${Math.round(pos.getX(i) * 1e4)},${Math.round(pos.getY(i) * 1e4)},${Math.round(pos.getZ(i) * 1e4)},${Math.round(uv.getX(i) * 1e4)},${Math.round(uv.getY(i) * 1e4)}`;
      const prev = seam.get(k);
      if (prev !== undefined) unite(i, prev);
      else seam.set(k, i);
    }
  }
  if (idx) {
    for (let i = 0; i < idx.count; i += 3) {
      const a = idx.getX(i), b = idx.getX(i + 1), c = idx.getX(i + 2);
      unite(a, b); unite(b, c);
    }
  }
  const map = new Map();
  for (let i = 0; i < vc; i++) {
    const r = find(i);
    let c = map.get(r);
    if (!c) {
      c = { root: r, count: 0, nz: 0, x0: 1e9, x1: -1e9, y0: 1e9, y1: -1e9, z0: 1e9, z1: -1e9 };
      map.set(r, c);
    }
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    c.count++;
    if (nrm) c.nz += nrm.getZ(i);
    if (x < c.x0) c.x0 = x; if (x > c.x1) c.x1 = x;
    if (y < c.y0) c.y0 = y; if (y > c.y1) c.y1 = y;
    if (z < c.z0) c.z0 = z; if (z > c.z1) c.z1 = z;
  }
  for (const c of map.values()) {
    c.avgNz = c.nz / c.count;
    c.cx = (c.x0 + c.x1) * 0.5;
    c.cy = (c.y0 + c.y1) * 0.5;
    c.cz = (c.z0 + c.z1) * 0.5;
  }
  return { par, find, map };
}

function tShirtIslands(uv, count) {
  const out = new Uint8Array(count);
  for (let i = 0; i < count; i++) {
    const u = uv ? uv.getX(i) : 0, v = uv ? uv.getY(i) : 0;
    if (v >= 0.94) out[i] = 4;      // collar
    else if (v >= 0.72) out[i] = u < 0.385 ? 2 : 3; // sleeves (-X / +X)
    else out[i] = u < 0.502 ? 0 : 1;                // front / back torso
  }
  return out;
}

// Smooth curve vEdge(u) along the bottom waist cut edge of one torso panel (front or back).
function hemCurve(pos, uv, islands, targetId, yCut) {
  const bins = new Map();
  for (let i = 0; i < pos.count; i++) {
    if (islands[i] !== targetId || pos.getY(i) >= yCut) continue;
    const u = uv.getX(i), v = uv.getY(i), b = Math.round(u * 60);
    if (!bins.has(b) || v > bins.get(b).v) bins.set(b, { u, v });
  }
  const pts = [...bins.values()].sort((a, b) => a.u - b.u);
  return (u) => {
    if (!pts.length) return 0.7185;
    if (u <= pts[0].u) return pts[0].v;
    if (u >= pts[pts.length - 1].u) return pts[pts.length - 1].v;
    for (let i = 1; i < pts.length; i++) {
      if (u <= pts[i].u) {
        const a = pts[i - 1], b = pts[i];
        const t = (u - a.u) / Math.max(1e-5, b.u - a.u);
        return a.v + (b.v - a.v) * t;
      }
    }
    return pts[pts.length - 1].v;
  };
}

/** Annotate scaled T-shirt `BufferGeometry` with `aMockZone` (`vec3(islandId, patternEdgeDist, ao)`). */
export function annotateShirt(g) {
  const pos = g.attributes.position, uv = g.attributes.uv;
  const count = pos.count;
  const islands = tShirtIslands(uv, count);
  g.computeBoundingBox();
  const yCut = g.boundingBox.min.y + 0.14 * (g.boundingBox.max.y - g.boundingBox.min.y);
  const frontEdge = hemCurve(pos, uv, islands, 0, yCut);
  const backEdge = hemCurve(pos, uv, islands, 1, yCut);

  const attr = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const id = islands[i], u = uv ? uv.getX(i) : 0, v = uv ? uv.getY(i) : 0;
    attr[i * 3] = id;
    let d = 99;
    // Subtract inward turn-up fold depth so `d <= 0` stops right at the visible outer crease.
    if (id === 0) d = Math.max(0, (frontEdge(u) - v) - 0.0175);
    else if (id === 1) d = Math.max(0, (backEdge(u) - v) - 0.0175);
    else if (id === 2 || id === 3) d = Math.max(0, (0.9366 - v) - 0.0126);
    attr[i * 3 + 1] = d;
    attr[i * 3 + 2] = 1;
  }
  g.setAttribute('aMockZone', new THREE.BufferAttribute(attr, 3));
  return g;
}

/** Annotate multi-part `white_polo.glb` mesh (`partName`) with `aMockZone`, crease AO, and front/back 0..1 UVs. */
export function annotatePolo(g, partName, box) {
  const pos = g.attributes.position, nrm = g.attributes.normal, uv = g.attributes.uv;
  const count = pos.count;
  const W = box.max.x - box.min.x || 1;
  const H = box.max.y - box.min.y || 1;
  const attr = new Float32Array(count * 3);

  if (partName === 'polo_collar') {
    g.computeBoundingBox();
    const cy0 = g.boundingBox.min.y, cyH = g.boundingBox.max.y - cy0 || 1;
    for (let i = 0; i < count; i++) {
      const t = (pos.getY(i) - cy0) / cyH;
      attr[i * 3] = 4;
      attr[i * 3 + 1] = 99;
      attr[i * 3 + 2] = t < 0.28 ? 0.85 + 0.15 * (t / 0.28) : 1; // crisp lower collar shadow
      uv.setXY(i, -1, -1);
    }
  } else if (partName === 'polo_placket') {
    g.computeBoundingBox();
    const px = Math.max(Math.abs(g.boundingBox.min.x), Math.abs(g.boundingBox.max.x)) || 1;
    const py0 = g.boundingBox.min.y, pyH = g.boundingBox.max.y - py0 || 1;
    for (let i = 0; i < count; i++) {
      const ex = 1 - Math.abs(pos.getX(i)) / px, ey = (pos.getY(i) - py0) / pyH;
      const e = Math.min(ex, ey * 2.5);
      attr[i * 3] = 7;
      attr[i * 3 + 1] = 99;
      attr[i * 3 + 2] = e < 0.18 ? 0.86 + 0.14 * Math.max(0, e / 0.18) : 1;
      uv.setXY(i, -1, -1);
    }
  } else if (partName === 'polo_front' || partName === 'polo_back') {
    const isFront = partName === 'polo_front';
    const { find, map } = triComponents(pos, nrm, g.index);
    const outerRoot = [...map.values()]
      .sort((a, b) => b.count - a.count)
      .find((c) => c.count > 400 && (isFront ? c.avgNz > 0.2 : c.avgNz < -0.2))?.root ?? -1;
    const waistY0 = box.min.y + 0.055 * H;
    const neckSpan = 0.15 * W; // collar shadow radius on back/front neck
    const backNeckY = box.min.y + 0.80 * H;
    const plakBottom = box.min.y + 0.665 * H;
    for (let i = 0; i < count; i++) {
      const root = find(i);
      const x = pos.getX(i), y = pos.getY(i), u = uv.getX(i), v = uv.getY(i);
      let ao = 1;
      if (root === outerRoot) {
        if (isFront) {
          uv.setXY(i, Math.min(0.49, Math.max(0.01, 0.26 + u / 1050)), Math.min(0.99, Math.max(0.01, (232 - v) / 708)));
          if (Math.abs(x) < 0.048 * W && y > plakBottom - 0.015 * H) ao = 0.88;
        } else {
          uv.setXY(i, Math.min(0.99, Math.max(0.51, 0.74 + u / 1050)), Math.min(0.99, Math.max(0.01, (348.3 - v) / 734.2)));
          if (Math.abs(x) < neckSpan && y > backNeckY) {
            ao = 1 - 0.22 * Math.min(1, (y - backNeckY) / (0.11 * H));
          }
        }
      } else {
        uv.setXY(i, -1, -1);
      }
      attr[i * 3] = isFront ? 0 : 1;
      attr[i * 3 + 1] = Math.max(0, (y - waistY0) / H * 0.65);
      attr[i * 3 + 2] = ao;
    }
  } else if (partName === 'polo_sleeves_hem') {
    // Tip projections along the downward-outward sleeve axis to support adjustable cuff bands (`uShirtBand`).
    let maxL = -1e9, minL = 1e9, maxR = -1e9, minR = 1e9;
    const slvStart = 0.23 * W;
    for (let i = 0; i < count; i++) {
      const x = pos.getX(i), y = pos.getY(i);
      if (x < -slvStart) { const p = -x * 0.76 - y * 0.65; maxL = Math.max(maxL, p); minL = Math.min(minL, p); }
      else if (x > slvStart) { const p = x * 0.76 - y * 0.65; maxR = Math.max(maxR, p); minR = Math.min(minR, p); }
    }
    const spanL = Math.max(1e-4, maxL - minL), spanR = Math.max(1e-4, maxR - minR);
    const waistCut = box.min.y + 0.068 * H;
    for (let i = 0; i < count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      let id = 0, d = 99;
      if (Math.abs(x) < 0.048 * W && y > box.min.y + 0.55 * H) {
        id = 7;
      } else if (y < waistCut && Math.abs(x) < 0.36 * W) {
        id = z >= 0 ? 0 : 1;
        d = 0;
      } else if (x < 0) {
        id = 2;
        const p = -x * 0.76 - y * 0.65;
        d = Math.max(0, (maxL - p) / spanL * 0.16);
      } else {
        id = 3;
        const p = x * 0.76 - y * 0.65;
        d = Math.max(0, (maxR - p) / spanR * 0.16);
      }
      attr[i * 3] = id;
      attr[i * 3 + 1] = d;
      attr[i * 3 + 2] = 1;
      uv.setXY(i, -1, -1);
    }
  } else {
    for (let i = 0; i < count; i++) {
      attr[i * 3] = 0; attr[i * 3 + 1] = 99; attr[i * 3 + 2] = 1;
    }
  }

  uv.needsUpdate = true;
  g.setAttribute('aMockZone', new THREE.BufferAttribute(attr, 3));
  return g;
}

/** Annotate merged `hoodie.glb` with connected pattern zones, hood/pocket AO, and front/back 0..1 UVs. */
export function annotateHoodie(g) {
  const pos = g.attributes.position, nrm = g.attributes.normal, uv = g.attributes.uv;
  const count = pos.count;
  g.computeBoundingBox();
  const b = g.boundingBox;
  const W = b.max.x - b.min.x || 1, H = b.max.y - b.min.y || 1, Z = b.max.z - b.min.z || 1;
  const { find, map } = triComponents(pos, nrm, g.index, uv, true);

  // Classify every welded garment pattern island cleanly (`weldChunk = true` collapses chunk splits to 13 intact islands).
  const compRole = new Map();
  for (const c of map.values()) {
    const ny0 = (c.y0 - b.min.y) / H, ny1 = (c.y1 - b.min.y) / H;
    const nx0 = (c.x0 - b.min.x) / W, nx1 = (c.x1 - b.min.x) / W;
    const nz0 = (c.z0 - b.min.z) / Z, nz1 = (c.z1 - b.min.z) / Z;
    if (ny1 > 0.91 && ny0 > 0.65) compRole.set(c.root, 'hood');
    else if (ny1 < 0.16) compRole.set(c.root, 'waist');
    else if (nx0 < 0.06 && nx1 < 0.20) compRole.set(c.root, 'cuffL');
    else if (nx1 > 0.94 && nx0 > 0.80) compRole.set(c.root, 'cuffR');
    else if (Math.abs((nx0 + nx1) * 0.5 - 0.5) < 0.12 && nz0 > 0.72 && ny1 < 0.48) compRole.set(c.root, 'pocket');
    else if (nx1 < 0.36) compRole.set(c.root, 'sleeveL');
    else if (nx0 > 0.64) compRole.set(c.root, 'sleeveR');
    else if (ny0 < 0.16 && ny1 > 0.75 && nz0 < 0.25 && nz1 > 0.80) compRole.set(c.root, 'torsoOuter');
    else if (c.avgNz < -0.25 && ny1 > 0.75 && nz0 > 0.35) compRole.set(c.root, 'frontInner');
    else if (c.avgNz > 0.25 && ny1 > 0.75 && nz1 < 0.65) compRole.set(c.root, 'backInner');
  }

  const attr = new Float32Array(count * 3);
  const waistY = b.min.y + 0.12 * H;
  const seamY = b.min.y + 0.75 * H;
  const seamSideZ = b.min.z + 0.517 * Z;
  const seamShoulderZ = b.min.z + 0.451 * Z;
  const hoodRimY = b.min.y + 0.67 * H;
  const hoodSpanX = 0.165 * W;
  const pocketRimY = b.min.y + 0.39 * H;

  for (let i = 0; i < count; i++) {
    const role = compRole.get(find(i));
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const u = uv.getX(i), v = uv.getY(i);
    let id = 0, d = 99, ao = 1;

    if (role === 'torsoOuter') {
      const seamZ = y > seamY ? seamShoulderZ : seamSideZ;
      const isFront = z >= seamZ;
      id = isFront ? 0 : 1;
      d = Math.max(0.002, (y - waistY) / H * 0.55);
      if (isFront) {
        uv.setXY(i, Math.min(0.49, Math.max(0.01, 0.26 + u / 1.15)), clamp01((v + 0.352) / 0.790));
        if (Math.abs(x) < 0.15 * W && y < pocketRimY + 0.03 * H) ao = 0.87 + 0.13 * clamp01((y - pocketRimY) / (0.03 * H));
      } else {
        uv.setXY(i, Math.min(0.99, Math.max(0.51, 0.74 - u / 1.15)), clamp01((v + 0.352) / 0.790));
        if (Math.abs(x) < hoodSpanX && y > hoodRimY) ao = 1 - 0.20 * clamp01((y - hoodRimY) / (0.09 * H));
      }
    } else {
      uv.setXY(i, -1, -1);
      if (role === 'frontInner') id = 0;
      else if (role === 'backInner') id = 1;
      else if (role === 'hood') id = 4;
      else if (role === 'pocket') {
        id = 7;
        const topDist = Math.abs((y - b.min.y) / H - 0.38);
        if (topDist < 0.025) ao = 0.88 + 0.12 * (topDist / 0.025);
      } else if (role === 'waist') { id = z >= seamSideZ ? 0 : 1; d = 0; }
      else if (role === 'cuffL') { id = 5; d = 0; }
      else if (role === 'cuffR') { id = 6; d = 0; }
      else if (role === 'sleeveL') id = 2;
      else if (role === 'sleeveR') id = 3;
      else id = z >= seamSideZ ? 0 : 1;
    }

    attr[i * 3] = id;
    attr[i * 3 + 1] = d;
    attr[i * 3 + 2] = ao;
  }

  uv.needsUpdate = true;
  g.setAttribute('aMockZone', new THREE.BufferAttribute(attr, 3));
  return g;
}
