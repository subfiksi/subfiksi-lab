// Jalankan: node MOCKUP_3D/tests/analyze.test.mjs
import assert from 'node:assert/strict';
import { analyze, SLICES } from '../analyze.js';

// A cup as triangles: 16-sided wall, height 2, axis deliberately off-origin at (5, 3).
// radius(y) is the outer wall; rings = how many rings of corners the wall has;
// inner adds an inner wall (thickness 0.1) whose rings sit at other heights.
function cup({ handle = false, radius = () => 1, rings = 5, inner = false } = {}) {
  const tris = [];
  const wall = (rad, ys) => {
    for (let i = 0; i + 1 < ys.length; i++) {
      for (let k = 0; k < 16; k++) {
        const p = (y, kk) => {
          const a = (kk / 16) * Math.PI * 2;
          return [5 + rad(y) * Math.sin(a), y, 3 + rad(y) * Math.cos(a)];
        };
        const [a, b, c, d] = [p(ys[i], k), p(ys[i], k + 1), p(ys[i + 1], k + 1), p(ys[i + 1], k)];
        tris.push(...a, ...b, ...c, ...a, ...c, ...d);
      }
    }
  };
  wall(radius, Array.from({ length: rings }, (_, i) => (i / (rings - 1)) * 2));
  if (inner) wall((y) => radius(y) - 0.1, [0.1, 0.55, 1.05, 1.45, 2]);
  // handle: a thin loop sticking out along +X, curling down to 10% of the height
  if (handle) {
    for (const [y0, y1] of [[0.2, 0.6], [0.6, 1.0], [1.0, 1.4]]) {
      tris.push(5 + 0.9, y0, 3, 5 + 1.6, y0, 3, 5 + 1.6, y1, 3.05, 5 + 0.9, y0, 3, 5 + 1.6, y1, 3.05, 5 + 0.9, y1, 3.05);
    }
  }
  return tris;
}

const near = (a, b, msg, eps = 0.05) => assert.ok(Math.abs(a - b) < eps, `${msg}: ${a} vs ${b}`);

const mug = analyze(cup({ handle: true }));
near(mug.cx, 5, 'axis x');
near(mug.cz, 3, 'axis z');
near(mug.rBody, 1, 'body radius ignores the handle');
near(mug.handleAngle, Math.PI / 2, 'handle points to +X', 0.1);
assert.equal(mug.minY, 0);
assert.equal(mug.maxY, 2);
assert.equal(mug.profile.length, SLICES);
mug.profile.forEach((r, i) => near(r, 1, `straight wall, band ${i}`));

const tumbler = analyze(cup());
assert.equal(tumbler.handleAngle, null, 'no handle on a plain cup');
near(tumbler.rBody, 1, 'plain cup radius');

// a thick-walled mug: bands that hold only corners of the INNER wall must still report the outer one
// (this was a real bug: the mug's wall got coloured and masked like a handle)
const thick = analyze(cup({ handle: true, inner: true }));
thick.profile.forEach((r, i) => near(r, 1, `outer wall wins over inner wall, band ${i}`));

// a tapered cup (narrow foot, wide rim) with a handle: the profile follows the wall, not the handle,
// so a handle beside the narrow foot still counts as sticking out
const taper = analyze(cup({ handle: true, radius: (y) => 0.4 + 0.3 * y, rings: 25 }));
near(taper.profile[0], 0.42, 'narrow at the foot');
near(taper.profile[SLICES - 1], 1, 'wide at the rim');
near(taper.profile[SLICES / 2], 0.72, 'half way up');
assert.ok(taper.profile.every((r) => r < 1.05), 'the handle (1.6) never enters the profile');

// a low-poly wall with corners only at the bottom and top: the bands in between have no wall
// corner at all, only the handle's, and must still follow the wall
const low = analyze(cup({ handle: true, radius: (y) => 0.5 + 0.25 * y, rings: 2 }));
near(low.profile[0], 0.5, 'low-poly foot');
near(low.profile[SLICES - 1], 1, 'low-poly rim');
near(low.profile[SLICES / 2], 0.76, 'low-poly middle follows the wall');

console.log('analyze: OK');
