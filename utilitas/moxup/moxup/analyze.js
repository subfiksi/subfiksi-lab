// Reads a cup-like mesh (Y up) and finds where its body is, so a design can be
// wrapped around it without relying on the model's own UV map.
// tris: flat array of triangle corners [x, y, z,  x, y, z,  x, y, z,  ...]
export const SLICES = 24; // height bands of the body profile

export function analyze(tris) {
  let minY = Infinity, maxY = -Infinity;
  for (let i = 1; i < tris.length; i += 3) {
    if (tris[i] < minY) minY = tris[i];
    if (tris[i] > maxY) maxY = tris[i];
  }
  const H = maxY - minY || 1;

  // A handle can curl low but never touches the table, so the centre of the
  // base ring (lowest 2%) is the body axis.
  const yCut = minY + 0.02 * H;
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (let i = 0; i < tris.length; i += 3) {
    if (tris[i + 1] > yCut) continue;
    if (tris[i] < x0) x0 = tris[i];
    if (tris[i] > x1) x1 = tris[i];
    if (tris[i + 2] < z0) z0 = tris[i + 2];
    if (tris[i + 2] > z1) z1 = tris[i + 2];
  }
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;

  // Farthest point per direction. The body fills most directions and a handle only a few,
  // so a middle value is the body and the outlier is the handle.
  const BINS = 36;
  const binOf = (dx, dz) => Math.floor(((Math.atan2(dx, dz) + Math.PI) / (2 * Math.PI)) * BINS) % BINS;
  const share = (bins, q) => {
    const f = bins.filter((r) => r > 0).sort((p, s) => p - s);
    return f.length ? f[Math.floor(q * (f.length - 1))] : 0;
  };
  const all = new Array(BINS).fill(0);
  let rAll = 0, farAngle = 0;
  for (let i = 0; i < tris.length; i += 3) {
    const dx = tris[i] - cx, dz = tris[i + 2] - cz, r = Math.hypot(dx, dz);
    const b = binOf(dx, dz);
    if (r > all[b]) all[b] = r;
    if (r > rAll) { rAll = r; farAngle = Math.atan2(dx, dz); } // 0 = +Z, PI/2 = +X
  }
  const rBody = share(all, 0.5);
  const handleAngle = rAll > 1.25 * rBody ? farAngle : null;

  // profile[i] = outer wall radius in height band i (0 = bottom). Sampled over the triangles, not
  // just their corners: a wall may have no corner at some height, and the inner wall has its own.
  const bands = Array.from({ length: SLICES }, () => new Array(BINS).fill(0));
  const step = H / SLICES;
  for (let t = 0; t + 8 < tris.length; t += 9) {
    const [ax, ay, az, bx, by, bz, ex, ey, ez] = [0, 1, 2, 3, 4, 5, 6, 7, 8].map((k) => tris[t + k]);
    const edge = Math.max(Math.hypot(bx - ax, by - ay, bz - az), Math.hypot(ex - bx, ey - by, ez - bz), Math.hypot(ax - ex, ay - ey, az - ez));
    const n = Math.min(48, Math.max(1, Math.ceil(edge / step))); // samples no further apart than a band
    for (let i = 0; i <= n; i++) {
      for (let j = 0; j <= n - i; j++) {
        const u = i / n, v = j / n;
        const dx = ax + (bx - ax) * u + (ex - ax) * v - cx, dz = az + (bz - az) * u + (ez - az) * v - cz;
        const y = ay + (by - ay) * u + (ey - ay) * v;
        const band = bands[Math.min(SLICES - 1, Math.max(0, Math.floor((y - minY) / step)))];
        const b = binOf(dx, dz), r = Math.hypot(dx, dz);
        if (r > band[b]) band[b] = r;
      }
    }
  }
  // 0.7 instead of the middle: flat faces of a low-poly wall sit a little inside its corners
  const profile = bands.map((bins) => share(bins, 0.7) || rBody);

  return { cx, cz, minY, maxY, rBody, rAll, handleAngle, profile };
}
