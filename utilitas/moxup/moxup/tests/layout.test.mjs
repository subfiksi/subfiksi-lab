// Jalankan: node MOCKUP_3D/tests/layout.test.mjs
import assert from 'node:assert/strict';
import { boxOf, wrapDx, grab, fitSize, remapAll, dragMove, dragScale, dragRotate, knobOffset, arrangePattern } from '../layout.js';

const near = (a, b, msg, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${msg}: ${a} vs ${b}`);

const mug = { w: 4000, h: 1600, unit: 1000, wrap: true, safeW: 4000 / Math.PI, safeH: 992, midY: 0.5 };
const plate = { w: 2000, h: 2000, unit: 1000, wrap: false, safeW: 1000, safeH: 1000, midY: 0.5 };
const L = { x: 0.5, y: 0.5, size: 0.5, rot: 0, aspect: 2 };

// box: size is a share of the area height, y runs upwards
const b = boxOf({ ...L, y: 0.75 }, mug);
assert.deepEqual([b.cx, b.cy, b.w, b.h], [2000, 400, 1600, 800]);

// going around the body takes the short way
near(wrapDx(3900, mug), -100, 'wraps backwards');
near(wrapDx(-3900, mug), 100, 'wraps forwards');
near(wrapDx(3900, plate), 3900, 'a plate does not wrap');

// grabbing: body, corner handle, rotate knob, miss
assert.equal(grab(L, mug, 2000, 800, true), 'move');
assert.equal(grab(L, mug, 2800, 400, true), 'scale');
assert.equal(grab(L, mug, 2000, 400 - knobOffset(mug), true), 'rotate');
assert.equal(grab(L, mug, 2000, 400 - knobOffset(mug), false), null, 'handles only on the selected layer');
assert.equal(grab(L, mug, 3500, 800, true), null);
// a layer on the seam is hit from both edges of the canvas
const seam = { ...L, x: 0.01, size: 0.2 };
assert.equal(grab(seam, mug, 3990, 800, false), 'move');
// rotated 90 degrees the box is tall: the old right edge is a miss, straight above is a hit
const turned = { ...L, rot: 90 };
assert.equal(grab(turned, mug, 2700, 800, false), null);
assert.equal(grab(turned, mug, 2000, 100, false), 'move');

// fit: wide art is limited by the safe width, tall art by the safe height
near(fitSize(4, mug) * mug.h * 4, mug.safeW, 'wide fits the safe width', 1e-6);
near(fitSize(0.2, mug) * mug.h, mug.safeH, 'tall fits the safe height', 1e-6);

// switching product: a fitted, centred design stays fitted and centred
const thermos = { w: 4000, h: 3800, unit: 1900, wrap: true, safeW: 4000 / Math.PI, safeH: 1500, midY: 0.42 };
const fitted = { ...L, size: fitSize(L.aspect, mug) };
const [onPlate] = remapAll([fitted], mug, plate);
near(onPlate.x, 0.5, 'x stays centred');
near(onPlate.y, 0.5, 'y stays centred');
near(onPlate.size, fitSize(L.aspect, plate), 'still exactly fitted');
near(remapAll([fitted], mug, thermos)[0].y, 0.42, 'centred on the printable band');
// there and back again (through several products) restores the original, sizes never drift
const two = [{ ...L, x: 0.46, y: 0.6, size: 0.3, rot: 20 }, { ...L, x: 0.55, y: 0.4, size: 0.12, aspect: 0.7 }];
const back = remapAll(remapAll(remapAll(two, mug, thermos), thermos, plate), plate, mug);
back.forEach((b2, i) => ['x', 'y', 'size'].forEach((key) => near(b2[key], two[i][key], `round trip ${key}`, 1e-9)));
// the layers keep their proportions to each other
const moved = remapAll(two, mug, plate);
near(moved[0].size / moved[1].size, two[0].size / two[1].size, 'same relative sizes', 1e-9);
// a layer on the back of a mug stays inside a plate; any position stays valid on a wrapping area
assert.equal(remapAll([{ ...L, x: 0.98 }], mug, plate)[0].x, 1, 'clamped to the plate');
assert.ok(remapAll([{ ...L, x: 0.9 }], plate, mug)[0].x < 1);
assert.deepEqual(remapAll([], mug, plate), []);

// custom horizontal centre (e.g. front chest on apparel UV at midX = 0.25)
const shirt = { w: 2048, h: 2048, unit: 1024, wrap: false, safeW: 490, safeH: 737, midX: 0.25, midY: 0.56 };
const onShirt = remapAll([fitted], mug, shirt)[0];
near(onShirt.x, 0.25, 'remap centres on shirt midX');
near(onShirt.y, 0.56, 'remap centres on shirt midY');
const snapShirt = dragMove({ L: { ...L, x: 0.245, y: 0.555 }, X: 500, Y: 900 }, shirt, 510, 898);
assert.deepEqual([snapShirt.x, snapShirt.y, snapShirt.snapX, snapShirt.snapY], [0.25, 0.56, true, true]);

// moving: follows the pointer, snaps to the centre lines, wraps around
const start = { L: { ...L, x: 0.4, y: 0.4 }, X: 1000, Y: 1000 };
const m1 = dragMove(start, mug, 1200, 900);
near(m1.x, 0.45, 'moved right');
near(m1.y, 0.4625, 'moved up');
const m2 = dragMove(start, mug, 1000 + 0.1 * mug.w + 12, 1000 - 0.1 * mug.h - 12);
assert.deepEqual([m2.x, m2.y, m2.snapX, m2.snapY], [0.5, 0.5, true, true]);
const m3 = dragMove({ L: { ...L, x: 0.95 }, X: 3800, Y: 800 }, mug, 200, 800); // pointer crossed the seam
near(m3.x, 0.05, 'wrapped past the seam');

// scaling: twice as far from the centre = twice the size
near(dragScale({ L, X: 2800, Y: 400 }, mug, 3600, 0), 1, 'doubled');
// rotating: knob follows the pointer, sticky at right angles
assert.equal(dragRotate({ L }, mug, 2900, 800), 90);
assert.equal(dragRotate({ L }, mug, 2900, 760), 90, 'snaps near 90');
assert.equal(dragRotate({ L }, mug, 2400, 400), 45);

// multi-layer pattern / randomizer
const logos = [{ aspect: 1 }, { aspect: 2.8 }, { aspect: 1.5 }, { aspect: 3.4 }, { aspect: 1.1 }, { aspect: 2.2 }];
const basePat = { mode: 'brick', fill: true, size: 0.14, gap: 0.35, rot: 0, jitter: 0, balance: true, seed: 1 };
for (const mode of ['brick', 'grid', 'scatter', 'ring']) {
  const filled = arrangePattern(logos, mug, { ...basePat, mode, fill: true });
  assert.ok(filled.length >= logos.length, `${mode} fill covers surface (${filled.length})`);
  assert.ok(filled.every((s) => s.index >= 0 && s.index < logos.length && s.w > 0 && s.h > 0), `${mode} valid spots`);

  const once = arrangePattern(logos, mug, { ...basePat, mode, fill: false });
  assert.equal(once.length, logos.length, `${mode} once places each logo once`);

  const onPlate = arrangePattern(logos, plate, { ...basePat, mode, fill: true });
  assert.ok(onPlate.length > 0 && onPlate.every((s) => Math.hypot(s.cx - plate.w / 2, s.cy - plate.h / 2) <= plate.w * 0.45), `${mode} stays inside plate`);
}

// visual balance equalizes wide vs square logos
const wide = arrangePattern([{ aspect: 1 }, { aspect: 4 }], mug, { ...basePat, mode: 'grid', fill: false, balance: true });
assert.ok(wide[1].h < wide[0].h && wide[1].w > wide[0].w, 'balanced wide logo has smaller height and reasonable width');

// scatter is deterministic per seed and changes when seed changes, keeping logos separated
const sc1 = arrangePattern(logos, mug, { ...basePat, mode: 'scatter', fill: false, seed: 1 });
const sc1b = arrangePattern(logos, mug, { ...basePat, mode: 'scatter', fill: false, seed: 1 });
const sc2 = arrangePattern(logos, mug, { ...basePat, mode: 'scatter', fill: false, seed: 2 });
assert.deepEqual(sc1, sc1b, 'scatter is deterministic for the same seed');
assert.notDeepEqual(sc1, sc2, 'changing seed shuffles scatter');
for (let i = 0; i < sc1.length; i++) {
  for (let j = i + 1; j < sc1.length; j++) {
    const dx = Math.abs(wrapDx(sc1[i].cx - sc1[j].cx, mug));
    const dy = Math.abs(sc1[i].cy - sc1[j].cy);
    assert.ok(dx > (sc1[i].w + sc1[j].w) * 0.4 || dy > (sc1[i].h + sc1[j].h) * 0.4, 'scatter avoids heavy overlap');
  }
}

console.log('layout: OK');
