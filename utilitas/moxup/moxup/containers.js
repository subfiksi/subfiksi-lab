// Procedural 96-segment studio drinkware & packaging meshes (cans, takeaway coffee cup, skincare pump bottle).
import * as THREE from 'three';

const SEGS = 96;

function lathe(pts, segs = SEGS) {
  return new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), segs);
}

function merge(list) {
  const parts = list.map((g) => (g.index ? g.toNonIndexed() : g));
  const total = parts.reduce((s, g) => s + g.attributes.position.count, 0);
  const pos = new Float32Array(total * 3);
  let off = 0;
  for (const g of parts) {
    const a = g.attributes.position.array;
    pos.set(a, off);
    off += a.length;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.computeVertexNormals();
  return out;
}

// Smooth S-curve points between (r0, y0) and (r1, y1).
function sCurve(r0, y0, r1, y1, steps = 8) {
  const pts = [];
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const ease = t * t * (3 - 2 * t);
    pts.push([r0 + (r1 - r0) * ease, y0 + (y1 - y0) * t]);
  }
  return pts;
}

function roundedRectShape(w, l, r) {
  const s = new THREE.Shape(), hw = w / 2, hl = l / 2;
  s.moveTo(-hw + r, -hl);
  s.lineTo(hw - r, -hl);
  s.absarc(hw - r, -hl + r, r, -Math.PI / 2, 0, false);
  s.lineTo(hw, hl - r);
  s.absarc(hw - r, hl - r, r, 0, Math.PI / 2, false);
  s.lineTo(-hw + r, hl);
  s.absarc(-hw + r, hl - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(-hw, -hl + r);
  s.absarc(-hw + r, -hl + r, r, Math.PI, Math.PI * 1.5, false);
  return s;
}

function buildCan(r, h) {
  const rTop = r * 0.81, rBot = r * 0.80;
  const bodyPts = [
    [rBot + 0.14, 0.72],
    ...sCurve(rBot + 0.14, 0.72, r, 1.30, 6),
    [r, h - 1.45],
    ...sCurve(r, h - 1.45, rTop * 0.99, h - 0.34, 8),
  ];

  // Brushed aluminum bottom foot chime + double-seam countersunk top lid
  const foot = lathe([
    [0, 0.38], [rBot * 0.56, 0.32], [rBot * 0.84, 0.14], [rBot * 0.94, 0],
    [rBot, 0], [rBot * 1.02, 0.12], [rBot + 0.15, 0.73], [rBot * 0.88, 0.73],
  ]);
  const topEnd = lathe([
    [0, h - 0.35], [rTop * 0.78, h - 0.35], [rTop * 0.86, h - 0.30],
    [rTop * 0.90, h - 0.05], [rTop * 0.94, h], [rTop * 0.99, h],
    [rTop * 1.025, h - 0.08], [rTop * 1.025, h - 0.24], [rTop * 0.985, h - 0.36],
    [rTop * 0.85, h - 0.36],
  ]);

  // Center rivet + stamped pull-tab oriented toward front (+Z)
  const rivet = new THREE.CylinderGeometry(rTop * 0.06, rTop * 0.065, 0.10, 24);
  rivet.translate(0, h - 0.32, 0);

  const tabShape = roundedRectShape(rTop * 0.38, rTop * 0.78, rTop * 0.16);
  const loopHole = new THREE.Path();
  const hw = rTop * 0.10, hl = rTop * 0.12, hr = rTop * 0.045, cy = -rTop * 0.15;
  loopHole.moveTo(-hw + hr, cy - hl);
  loopHole.lineTo(hw - hr, cy - hl);
  loopHole.absarc(hw - hr, cy - hl + hr, hr, -Math.PI / 2, 0, false);
  loopHole.lineTo(hw, cy + hl - hr);
  loopHole.absarc(hw - hr, cy + hl - hr, hr, 0, Math.PI / 2, false);
  loopHole.lineTo(-hw + hr, cy + hl);
  loopHole.absarc(-hw + hr, cy + hl - hr, hr, Math.PI / 2, Math.PI, false);
  loopHole.lineTo(-hw, cy - hl + hr);
  loopHole.absarc(-hw + hr, cy - hl + hr, hr, Math.PI, Math.PI * 1.5, false);
  tabShape.holes.push(loopHole);

  const tab = new THREE.ExtrudeGeometry(tabShape, {
    depth: 0.045, bevelEnabled: true, bevelThickness: 0.014, bevelSize: 0.014, bevelSegments: 2, curveSegments: 16,
  });
  tab.rotateX(Math.PI / 2);
  tab.rotateX(0.04); // slight finger lift toward rear (-Z)
  tab.translate(0, h - 0.26, rTop * 0.06);

  // Subtle embossed drink-mouth groove in front of the tab
  const mouth = new THREE.ExtrudeGeometry(roundedRectShape(rTop * 0.36, rTop * 0.26, rTop * 0.11), {
    depth: 0.03, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 2, curveSegments: 12,
  });
  mouth.rotateX(Math.PI / 2);
  mouth.translate(0, h - 0.33, rTop * 0.44);

  return [
    { name: 'body', g: lathe(bodyPts) },
    { name: 'lid', g: merge([foot, topEnd, rivet, tab, mouth]) },
  ];
}

function buildCoffeeCup(rBot, rTop, hCup) {
  const body = lathe([
    [0, 0.52], [rBot * 0.91, 0.52], [rBot * 0.96, 0], [rBot, 0],
    [rTop, hCup], [rTop - 0.10, hCup], [rBot - 0.08, 0.60], [0, 0.60],
  ]);

  // Snap-on traveler lid with raised lip rim and front sip spout
  const lidBase = lathe([
    [rTop - 0.12, hCup - 0.40], [rTop + 0.18, hCup - 0.34], [rTop + 0.20, hCup + 0.28],
    [rTop + 0.08, hCup + 0.48], [rTop - 0.20, hCup + 1.06], [rTop - 0.46, hCup + 1.10],
    [rTop - 0.72, hCup + 0.76], [rTop - 0.92, hCup + 0.80], [0, hCup + 0.80],
  ]);

  const spoutShape = roundedRectShape(1.25, 0.68, 0.26);
  const spout = new THREE.ExtrudeGeometry(spoutShape, {
    depth: 0.34, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.08, bevelSegments: 3, curveSegments: 16,
  });
  spout.rotateX(Math.PI / 2);
  spout.translate(0, hCup + 1.18, rTop - 0.36);

  return [
    { name: 'body', g: body },
    { name: 'lid', g: merge([lidBase, spout]) },
  ];
}

function buildSkincareBottle(r, hBody) {
  const neckY = hBody - 0.60, shoulderY = hBody - 1.95;
  const body = lathe([
    [0, 0.04], [r * 0.84, 0], [r * 0.96, 0.05], [r, 0.35],
    [r, shoulderY],
    ...sCurve(r, shoulderY, r * 0.46, neckY, 10),
    [r * 0.46, hBody], [0, hBody],
  ]);

  const collar = lathe([
    [r * 0.46, neckY + 0.30], [r * 0.54, neckY + 0.30], [r * 0.56, neckY + 0.46],
    [r * 0.56, hBody + 1.45], [r * 0.52, hBody + 1.58], [r * 0.28, hBody + 1.58],
    [r * 0.25, hBody + 1.25], [0, hBody + 1.25],
  ]);

  const pumpCap = lathe([
    [0, hBody + 1.25], [r * 0.23, hBody + 1.25], [r * 0.23, hBody + 2.40],
    [r * 0.49, hBody + 2.40], [r * 0.49, hBody + 3.92], [r * 0.44, hBody + 4.02],
    [r * 0.28, hBody + 3.94], [0, hBody + 3.92],
  ]);

  // Sleek protruding cosmetic dispenser spout pointing +Z
  const nozzle = new THREE.Shape();
  nozzle.moveTo(0, 0);
  nozzle.lineTo(1.65, -0.10);
  nozzle.quadraticCurveTo(1.75, -0.14, 1.72, -0.34);
  nozzle.lineTo(1.60, -0.40);
  nozzle.quadraticCurveTo(0.85, -0.48, 0, -0.58);
  nozzle.closePath();

  const spout = new THREE.ExtrudeGeometry(nozzle, {
    depth: r * 0.30, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 3, curveSegments: 12,
  });
  spout.translate(0, 0, -r * 0.15);
  spout.rotateY(-Math.PI / 2); // extend along +Z
  spout.translate(0, hBody + 3.74, r * 0.36);

  return [
    { name: 'body', g: body },
    { name: 'collar', g: collar },
    { name: 'pump', g: merge([pumpCap, spout]) },
  ];
}

export function buildContainer(spec) {
  if (spec.kind === 'can') return buildCan(spec.r, spec.h);
  if (spec.kind === 'coffee') return buildCoffeeCup(spec.rBot, spec.r, spec.h);
  if (spec.kind === 'skincare') return buildSkincareBottle(spec.r, spec.h);
  throw new Error('Unknown container kind: ' + spec.kind);
}
