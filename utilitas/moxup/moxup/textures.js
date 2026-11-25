import * as THREE from 'three';

// Deterministic hash for seamless toroidal texture generation (0..1)
function hash2(x, y, seed = 1) {
  let n = Math.imul(x + seed * 374761393, 668265263) ^ Math.imul(y + seed * 1274126177, 2246822519);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function smoothNoise(x, y, period, seed) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const x0 = ((xi % period) + period) % period, x1 = (x0 + 1) % period;
  const y0 = ((yi % period) + period) % period, y1 = (y0 + 1) % period;
  const a = hash2(x0, y0, seed), b = hash2(x1, y0, seed);
  const c = hash2(x0, y1, seed), d = hash2(x1, y1, seed);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

// Generates a seamless 256x256 texture encoding:
// R = surface bump height, G = micro-albedo grain, B = roughness variation
function makeTexture(kind) {
  const S = 256;
  const data = new Uint8Array(S * S * 4);

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = x / S, v = y / S;
      let h = 0.5, grain = 0.5, rough = 0.5;

      if (kind === 'carton') {
        // Fine uncoated cardstock pulp & subtle matte speckle
        const f1 = smoothNoise(u * 32, v * 32, 32, 11);
        const f2 = smoothNoise(u * 96, v * 96, 96, 23);
        const f3 = hash2(x, y, 37);
        h = 0.35 + f1 * 0.25 + f2 * 0.22 + f3 * 0.18;
        grain = 0.40 + f1 * 0.22 + f2 * 0.20 + f3 * 0.18;
        rough = 0.35 + f2 * 0.4 + f3 * 0.25;
      } else if (kind === 'cardboard') {
        // Corrugated kraft flutes + organic paper pulp fibers
        const flute = 0.5 + 0.5 * Math.sin(u * Math.PI * 2 * 10 + smoothNoise(u * 16, v * 16, 16, 41) * 0.35);
        const pulp = smoothNoise(u * 24, v * 24, 24, 53);
        const fiber = smoothNoise(u * 64, v * 16, 64, 71); // horizontal pulp streaks
        const speck = hash2(x, y, 89);
        h = flute * 0.56 + pulp * 0.22 + fiber * 0.14 + speck * 0.08;
        grain = 0.25 + flute * 0.24 + pulp * 0.25 + fiber * 0.16 + (speck > 0.94 ? -0.18 : speck * 0.10);
        rough = 0.4 + pulp * 0.35 + speck * 0.25;
      } else if (kind === 'fabric') {
        // Woven cotton/jersey cross-hatch weave (warp & weft)
        const freq = 28;
        const cellX = Math.floor(u * freq), cellY = Math.floor(v * freq);
        const lx = (u * freq) % 1, ly = (v * freq) % 1;
        const checker = (cellX + cellY) % 2 === 0;
        const warp = Math.sin(lx * Math.PI);
        const weft = Math.sin(ly * Math.PI);
        const weave = checker ? (warp * 0.72 + weft * 0.28) : (weft * 0.72 + warp * 0.28);
        const slub = smoothNoise(u * 14, v * 14, 14, 103);
        const lint = hash2(x, y, 127);
        h = weave * 0.72 + slub * 0.18 + lint * 0.10;
        grain = 0.35 + weave * 0.35 + slub * 0.18 + lint * 0.12;
        rough = 0.45 + (1 - weave) * 0.35 + lint * 0.20;
      }

      const idx = (y * S + x) * 4;
      data[idx] = Math.max(0, Math.min(255, Math.round(h * 255)));
      data[idx + 1] = Math.max(0, Math.min(255, Math.round(grain * 255)));
      data[idx + 2] = Math.max(0, Math.min(255, Math.round(rough * 255)));
      data[idx + 3] = 255;
    }
  }

  const tex = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

const cache = new Map();
export function getSurfaceTexture(kind) {
  if (!kind || kind === 'none') return null;
  if (!cache.has(kind)) cache.set(kind, makeTexture(kind));
  return cache.get(kind);
}
