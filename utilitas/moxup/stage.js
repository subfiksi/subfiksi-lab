// The 3D side: renderer, lights, the product, and the material that wraps the print canvas onto it.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { analyze, SLICES } from './analyze.js';
import { buildBox } from './boxes.js';
import { buildContainer } from './containers.js';
import { getSurfaceTexture } from './textures.js';
import { annotateShirt, annotatePolo, annotateHoodie } from './shirt.js';

const rad = THREE.MathUtils.degToRad;

export const canvas = document.getElementById('view');
export const printCanvas = document.createElement('canvas'); // design.js paints here
export let area = null; // print area of the product on stage, see layout.js
export const hooks = { beforeRender: null, envFailed: null };

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.NeutralToneMapping; // keeps the design's colours close to the file
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
export const maxSize = Math.min(8192, renderer.capabilities.maxTextureSize);

const scene = new THREE.Scene();
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
export const controls = new OrbitControls(camera, canvas);
controls.enablePan = false;
controls.mouseButtons.MIDDLE = THREE.MOUSE.ROTATE; // right button opens the app's menu; zoom stays on the wheel
controls.minDistance = 1.5;
controls.maxDistance = 40;
controls.addEventListener('change', requestRender);

const key = new THREE.DirectionalLight(0xffffff, 1);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.bias = -0.0005;
Object.assign(key.shadow.camera, { left: -2.5, right: 2.5, top: 2.5, bottom: -2.5, near: 0.5, far: 20 });
scene.add(key);

// floor: catches the key light's shadow, plus a soft round contact shadow under the product
const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.ShadowMaterial());
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// shortcut: the contact shadow is a round blob, right for round products; render real contact
// shadows (three.js example webgl_shadow_contact) if box-shaped products are added
const blobCanvas = Object.assign(document.createElement('canvas'), { width: 256, height: 256 });
const blob = new THREE.Mesh(
  new THREE.PlaneGeometry(1, 1),
  new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(blobCanvas), color: 0x000000, transparent: true, depthWrite: false, toneMapped: false }),
);
blob.rotation.x = -Math.PI / 2;
blob.renderOrder = 1;
scene.add(blob);
let blobSoft = -1;

function drawBlob(soft) {
  if (soft === blobSoft) return;
  blobSoft = soft;
  const g = blobCanvas.getContext('2d');
  g.clearRect(0, 0, 256, 256);
  const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128), sigma = 0.3 + 0.25 * soft;
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    grad.addColorStop(t, `rgba(255,255,255,${Math.exp(-((t / sigma) ** 2)) * (1 - t ** 4)})`);
  }
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  blob.material.map.needsUpdate = true;
}

// ---------- render on demand ----------
let queued = false;
export function requestRender() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    hooks.beforeRender?.();
    renderer.render(scene, camera);
  });
}

let spinning = false;
function spin() {
  if (!controls.autoRotate) { spinning = false; return; }
  controls.update(); // fires 'change', which queues the render
  requestAnimationFrame(spin);
}

// ---------- print material: projects the print canvas onto the body, ignoring the model's own UVs ----------
const flatTex = new THREE.DataTexture(new Uint8Array([128, 128, 128, 255]), 1, 1, THREE.RGBAFormat);
flatTex.needsUpdate = true;

const U = {
  uArt: { value: null }, uMode: { value: 0 }, uMul: { value: 0 },
  uR: { value: 1 }, uH: { value: 2 }, uY0: { value: -1 }, uProf: { value: new Float32Array(SLICES) },
  uTwo: { value: 0 }, uInner: { value: new THREE.Color() }, uHandle: { value: new THREE.Color() },
  uCapV: { value: 2 }, uCap: { value: new THREE.Color() }, uBaseV: { value: -1 }, uBase: { value: new THREE.Color() },
  uTexMap: { value: flatTex }, uTexOn: { value: 0 }, uTexStr: { value: 0 }, uTexScale: { value: 6 },
  uShirtOn: { value: 0 }, uShirtBand: { value: 0.056 },
  uShirtBack: { value: new THREE.Color() }, uShirtCollar: { value: new THREE.Color() },
  uShirtSlvL: { value: new THREE.Color() }, uShirtSlvR: { value: new THREE.Color() },
  uShirtCuffL: { value: new THREE.Color() }, uShirtCuffR: { value: new THREE.Color() },
  uShirtHem: { value: new THREE.Color() }, uShirtPlacket: { value: new THREE.Color() },
};

const TEX_DECL = `
varying vec3 vMockP; varying vec3 vMockN;
uniform sampler2D uTexMap;
uniform float uTexStr, uTexScale;
vec3 mockTriplanar(vec3 p, vec3 n) {
  vec3 w = pow(abs(normalize(n)), vec3(4.0));
  w /= max(w.x + w.y + w.z, 1e-5);
  return texture2D(uTexMap, p.zy * uTexScale).rgb * w.x
       + texture2D(uTexMap, p.xz * uTexScale).rgb * w.y
       + texture2D(uTexMap, p.xy * uTexScale).rgb * w.z;
}
vec3 mockBump(vec3 surf_pos, vec3 surf_norm, float h, float str) {
  vec3 dpx = dFdx(surf_pos), dpy = dFdy(surf_pos);
  if (dot(dpx, dpx) < 1e-10 || dot(dpy, dpy) < 1e-10) return surf_norm;
  vec2 dHdxy = vec2(dFdx(h), dFdy(h)) * str;
  vec3 vSigmaX = normalize(dpx), vSigmaY = normalize(dpy);
  vec3 R1 = cross(vSigmaY, surf_norm), R2 = cross(surf_norm, vSigmaX);
  float faceDir = gl_FrontFacing ? 1.0 : -1.0;
  float fDet = dot(vSigmaX, R1) * faceDir;
  vec3 vGrad = sign(fDet) * (dHdxy.x * R1 + dHdxy.y * R2);
  return normalize(abs(fDet) * surf_norm - vGrad);
}
`;

const FRAG_DECL = TEX_DECL + `
varying vec2 vMockUv; varying vec3 vMockZone;
uniform sampler2D uArt;
uniform float uMode, uMul, uR, uH, uY0, uTwo, uCapV, uBaseV, uTexOn, uShirtOn, uShirtBand;
uniform float uProf[${SLICES}]; // body radius per height band, see analyze.js
uniform vec3 uInner, uHandle, uCap, uBase, uShirtBack, uShirtCollar, uShirtSlvL, uShirtSlvR, uShirtCuffL, uShirtCuffR, uShirtHem, uShirtPlacket;
float mockInk = 0.0;  // how much print covers this pixel
float mockPart = 0.0; // 1 on a cap / base zone
vec3 mockTex = vec3(0.5);
vec3 mockLinear(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
`;

const FRAG_BODY = `
{
  vec3 p = vMockP;
  vec3 n = normalize(vMockN) * (gl_FrontFacing ? 1.0 : -1.0);
  if (uTexOn > 0.5) mockTex = mockTriplanar(p, n);
  vec2 uvA, gx, gy; float mask;
  if (uMode < 0.5) {
    // around the body: angle -> u, height -> v
    float r = length(p.xz);
    float facing = dot(n.xz, p.xz / max(r, 1e-5));
    float v = (p.y - uY0) / uH;
    float a1 = atan(p.x, p.z), a2 = atan(-p.x, -p.z);
    // two angle branches so the mipmap derivative never crosses the atan seam
    bool front = abs(a1) < 1.5708;
    float dax = front ? dFdx(a1) : dFdx(a2), day = front ? dFdy(a1) : dFdy(a2);
    uvA = vec2(a1 / 6.2831853 + 0.5, v);
    gx = vec2(dax / 6.2831853, dFdx(p.y) / uH);
    gy = vec2(day / 6.2831853, dFdy(p.y) / uH);
    // q: 1 on the wall, more on what sticks out of it (a handle)
    float q = r / max(uProf[int(clamp(v, 0.0, 0.999) * ${SLICES}.0)], 1e-4);
    // print only on the outward wall, never on a handle
    mask = step(0.3, facing) * step(q, 1.08);
    if (uTwo > 0.5) {
      if (q > 1.08) diffuseColor.rgb = uHandle;
      // inside: the inner wall, or the inner bottom (faces up, never outwards like the top of a flared foot)
      else if ((facing < -0.3 && q < 1.0) || (n.y > 0.5 && facing < 0.1 && q < 0.9 && v > 0.06)) diffuseColor.rgb = uInner;
    }
    if (v > uCapV) { diffuseColor.rgb = uCap; mask = 0.0; mockPart = 1.0; }
    if (v < uBaseV) { diffuseColor.rgb = uBase; mask = 0.0; mockPart = 1.0; }
  } else if (uMode > 1.5) {
    // direct mesh UV projection (boxes, apparel)
    uvA = vMockUv;
    gx = dFdx(uvA); gy = dFdy(uvA);
    mask = step(0.0, uvA.x) * step(uvA.x, 1.0) * step(0.0, uvA.y) * step(uvA.y, 1.0);
  } else {
    // flat on the top face (plate)
    uvA = vec2(p.x, -p.z) / (2.0 * uR) + 0.5;
    gx = dFdx(uvA); gy = dFdy(uvA);
    mask = step(0.3, n.y) * step(abs(uvA.x - 0.5), 0.5) * step(abs(uvA.y - 0.5), 0.5);
  }
  if (uShirtOn > 0.5) {
    float zid = floor(vMockZone.x + 0.5);
    vec3 zc = diffuseColor.rgb;
    if (zid > 6.5) zc = uShirtPlacket;
    else if (zid > 5.5) zc = uShirtBand > 0.0001 ? uShirtCuffR : uShirtSlvR;
    else if (zid > 4.5) zc = uShirtBand > 0.0001 ? uShirtCuffL : uShirtSlvL;
    else if (zid > 3.5) zc = uShirtCollar;
    else if (zid > 2.5) zc = uShirtSlvR;
    else if (zid > 1.5) zc = uShirtSlvL;
    else if (zid > 0.5) zc = uShirtBack;
    if (uShirtBand > 0.0001 && zid < 3.5) {
      float fw = max(fwidth(vMockZone.y), 0.0008);
      float inBand = 1.0 - smoothstep(uShirtBand - fw, uShirtBand + fw, vMockZone.y);
      vec3 bc = zid > 2.5 ? uShirtCuffR : (zid > 1.5 ? uShirtCuffL : uShirtHem);
      zc = mix(zc, bc, inBand);
    }
    diffuseColor.rgb = zc * vMockZone.z;
  }
  if (uTexOn > 0.5 && mockPart < 0.5) {
    diffuseColor.rgb *= mix(1.0, 0.86 + 0.28 * mockTex.g, uTexStr * 0.72);
  }
  // the canvas is premultiplied sRGB: undo both, so soft edges get no dark fringe
  vec4 art = textureGrad(uArt, uvA, gx, gy);
  vec3 ink = mockLinear(art.a > 0.0 ? art.rgb / art.a : vec3(0.0));
  mockInk = art.a * mask;
  diffuseColor.rgb = mix(diffuseColor.rgb, uMul > 0.5 ? diffuseColor.rgb * ink : ink, mockInk);
  if (uTexOn > 0.5 && mockInk > 0.01) {
    diffuseColor.rgb *= mix(1.0, 0.90 + 0.20 * mockTex.g, uTexStr * 0.28 * mockInk);
  }
}
`;

function inject(sh) {
  Object.assign(sh.uniforms, U);
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\nattribute vec3 aMockZone;\nvarying vec3 vMockP; varying vec3 vMockN; varying vec2 vMockUv; varying vec3 vMockZone;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMockP = position; vMockN = normal; vMockUv = uv; vMockZone = aMockZone;');
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', '#include <common>\n' + FRAG_DECL)
    .replace('#include <map_fragment>', '#include <map_fragment>\n' + FRAG_BODY)
    .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nif (uTexOn > 0.5 && mockPart < 0.5 && uTexStr > 0.001) normal = mockBump(-vViewPosition, normal, mockTex.r, uTexStr * 2.4);')
    // caps and bases are plastic; opaque ink hides the metal under it
    .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp(roughnessFactor + (mockTex.b - 0.5) * 0.26 * uTexOn * uTexStr, 0.04, 1.0);\nroughnessFactor = mix(roughnessFactor, 0.5, mockPart);')
    .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor *= 1.0 - max(mockInk * (1.0 - uMul), mockPart);');
}

const printMat = new THREE.MeshPhysicalMaterial({ side: THREE.DoubleSide, clearcoatRoughness: 0.08 });
printMat.onBeforeCompile = inject;
const partMats = new Map(); // material name -> material of a part that is not printed (lid, saucer)

function injectPart(sh, uPartTex) {
  Object.assign(sh.uniforms, { uTexMap: U.uTexMap, uTexStr: U.uTexStr, uTexScale: U.uTexScale, uPartTex });
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vMockP; varying vec3 vMockN;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMockP = position; vMockN = normal;');
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', '#include <common>\n' + TEX_DECL + '\nuniform float uPartTex;\nvec3 mockTex = vec3(0.5);')
    .replace('#include <map_fragment>', '#include <map_fragment>\nif (uPartTex > 0.5) { mockTex = mockTriplanar(vMockP, vMockN); diffuseColor.rgb *= mix(1.0, 0.86 + 0.28 * mockTex.g, uTexStr * 0.72); }')
    .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nif (uPartTex > 0.5 && uTexStr > 0.001) normal = mockBump(-vViewPosition, normal, mockTex.r, uTexStr * 2.4);')
    .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp(roughnessFactor + (mockTex.b - 0.5) * 0.26 * uPartTex * uTexStr, 0.04, 1.0);');
}

function partMat(name) {
  if (!partMats.has(name)) {
    const mat = new THREE.MeshPhysicalMaterial({ side: THREE.DoubleSide, clearcoatRoughness: 0.08 });
    mat.userData.uPartTex = { value: 0 };
    mat.onBeforeCompile = (sh) => injectPart(sh, mat.userData.uPartTex);
    partMats.set(name, mat);
  }
  return partMats.get(name);
}

// k = { body, two, inner, handle, cap, base, parts: { name: hex }, gloss, metal, coat, multiply, tex, texStr, texScale }
export function setLook(k) {
  const st = getSurfaceTexture(k.tex);
  U.uTexMap.value = st || flatTex;
  U.uTexOn.value = st && k.texStr > 0 ? 1 : 0;
  U.uTexStr.value = k.texStr ?? 0;
  U.uTexScale.value = k.texScale ?? 6;
  printMat.color.set(k.body);
  Object.assign(printMat, { roughness: 1 - k.gloss, metalness: k.metal, clearcoat: k.coat });
  for (const [name, mat] of partMats) {
    const p = model?.parts?.[name];
    const follows = p?.follow; // a saucer shares the cup's finish, a lid stays plastic/metal
    Object.assign(mat, follows
      ? { roughness: 1 - k.gloss, metalness: k.metal, clearcoat: k.coat }
      : { roughness: p?.roughness ?? 0.45, metalness: p?.metal ?? 0, clearcoat: p?.clearcoat ?? 0 });
    mat.userData.uPartTex.value = follows ? U.uTexOn.value : 0;
    if (k.parts[name]) mat.color.set(k.parts[name]);
  }
  U.uTwo.value = k.two ? 1 : 0;
  U.uInner.value.set(k.inner);
  U.uHandle.value.set(k.handle);
  U.uCap.value.set(k.cap);
  U.uBase.value.set(k.base);
  U.uMul.value = k.multiply ? 1 : 0;
  if (k.shirt) {
    const sh = k.shirt;
    const slL = sh.splitSides ? sh.sleeveL : sh.sleeve;
    const slR = sh.splitSides ? sh.sleeveR : sh.sleeve;
    const cfL = sh.splitSides ? sh.cuffL : sh.cuff;
    const cfR = sh.splitSides ? sh.cuffR : sh.cuff;
    const band = sh.band ?? 0.35;
    U.uShirtOn.value = 1;
    // Pattern UV units: 0.010 ~= 1 cm, measured cleanly outside the hem/cuff crease
    U.uShirtBand.value = band > 0.001 ? band * 0.055 : 0;
    U.uShirtCollar.value.set(sh.collar || k.body);
    U.uShirtSlvL.value.set(slL || k.body);
    U.uShirtSlvR.value.set(slR || k.body);
    U.uShirtCuffL.value.set(cfL || slL || k.body);
    U.uShirtCuffR.value.set(cfR || slR || k.body);
    U.uShirtHem.value.set(sh.hem || k.body);
    U.uShirtBack.value.set(sh.splitBack ? (sh.back || k.body) : k.body);
    U.uShirtPlacket.value.set(sh.placket || sh.collar || k.body);
  } else {
    U.uShirtOn.value = 0;
  }
  requestRender();
}

// ---------- products ----------
const CREASE = Math.PI / 3.4; // smooths walls of 8 sides and up, keeps 90 degree rims sharp
const prepared = new Map(); // model id -> Promise of its normalised geometry
const ready = new Map(); // model id -> that geometry once loaded
let product = null, model = null, info = null;

async function rawParts(m) {
  if (m.box) return buildBox(m.box);
  if (m.container) return buildContainer(m.container);
  if (m.shape) { // a profile spun around the axis, in any unit
    return Object.entries(m.shape).map(([name, pts]) => ({
      name, g: new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), 96),
    }));
  }
  const gltf = await new GLTFLoader().loadAsync(m.file);
  gltf.scene.updateMatrixWorld(true);
  const rotM = m.rot ? new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rad(m.rot[0]), rad(m.rot[1]), rad(m.rot[2]))) : null;
  const out = [];
  gltf.scene.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry.clone().applyMatrix4(o.matrixWorld);
    if (rotM) g.applyMatrix4(rotM);
    out.push({ name: o.material?.name || 'body', g });
  });
  return out;
}

// Loads a model and bakes it into one shared space: body axis on Y through the origin,
// centred in height, 2 units across at most, handle pointing to +X.
async function build(m) {
  const raw = await rawParts(m);
  const isPart = (name) => !!m.parts && name in m.parts;
  const each = (list, fn) => {
    for (const p of list) {
      const a = p.g.attributes.position;
      for (let i = 0; i < a.count; i++) fn(a.getX(i), a.getY(i), a.getZ(i), p);
    }
  };

  if (m.mode === 'uv') {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    each(raw, (x, y, z) => {
      x0 = Math.min(x0, x); x1 = Math.max(x1, x);
      y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      z0 = Math.min(z0, z); z1 = Math.max(z1, z);
    });
    const dx = x1 - x0 || 1, dy = y1 - y0 || 1, dz = z1 - z0 || 1;
    const s = 2 / Math.max(dx, dy, dz);
    const M = new THREE.Matrix4().makeScale(s, s, s)
      .multiply(new THREE.Matrix4().makeTranslation(-(x0 + x1) / 2, -(y0 + y1) / 2, -(z0 + z1) / 2));
    const box = new THREE.Box3(
      new THREE.Vector3(x0, y0, z0).applyMatrix4(M),
      new THREE.Vector3(x1, y1, z1).applyMatrix4(M),
    );
    return {
      parts: raw.map((p) => {
        const g = p.g.applyMatrix4(M);
        const part = isPart(p.name);
        if (m.id === 'tshirt') annotateShirt(g);
        else if (m.id === 'polo' && !part) annotatePolo(g, p.name, box);
        else if (m.id === 'hoodie' && !part) annotateHoodie(g);
        if (!part && m.file && !m.keepUvY && g.attributes.uv) {
          // glTF UVs start top-left (v=0 top); CanvasTexture has flipY=true (v=1 top)
          const uv = g.attributes.uv;
          for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
          uv.needsUpdate = true;
        }
        return { name: p.name, part, g };
      }),
      R: 1,
      prof: new Float32Array(SLICES),
      H: dy * s,
      y0: -(dy * s) / 2,
      floor: -(dy * s) / 2,
      foot: Math.max(dx, dz) * s * 0.44,
    };
  }
  const tris = []; // corners of every triangle of the printed body
  for (const p of raw) {
    if (isPart(p.name)) continue;
    const at = p.g.attributes.position, ix = p.g.index;
    for (let i = 0, n = ix ? ix.count : at.count; i < n; i++) {
      const v = ix ? ix.getX(i) : i;
      tris.push(at.getX(v), at.getY(v), at.getZ(v));
    }
  }
  const a = analyze(tris); // measured on the printed body only

  let lo = Infinity, hi = -Infinity, far = 0;
  each(raw, (x, y, z) => {
    lo = Math.min(lo, y);
    hi = Math.max(hi, y);
    far = Math.max(far, Math.hypot(x - a.cx, z - a.cz));
  });
  let foot = 0; // how wide it stands on the floor (handles do not count)
  each(raw, (x, y, z, p) => {
    const r = Math.hypot(x - a.cx, z - a.cz);
    if (y < lo + 0.35 * (hi - lo) && (isPart(p.name) || r <= a.rBody * 1.15)) foot = Math.max(foot, r);
  });

  const s = 2 / Math.max(hi - lo, 2 * far);
  const turn = m.mode === 'cyl' && a.handleAngle !== null ? Math.PI / 2 - a.handleAngle : 0;
  const M = new THREE.Matrix4().makeScale(s, s, s)
    .multiply(new THREE.Matrix4().makeRotationY(turn))
    .multiply(new THREE.Matrix4().makeTranslation(-a.cx, -(lo + hi) / 2, -a.cz));
  return {
    parts: raw.map((p) => ({ name: p.name, part: isPart(p.name), g: toCreasedNormals(p.g.applyMatrix4(M), CREASE) })),
    R: a.rBody * s,
    prof: a.profile.map((r) => r * s),
    H: (a.maxY - a.minY) * s,
    y0: (a.minY - (lo + hi) / 2) * s,
    floor: (-(hi - lo) * s) / 2,
    foot: foot * s,
  };
}

// Loads a product's geometry (once). Must have finished before showProduct(m).
export async function preload(m) {
  if (!prepared.has(m.id)) prepared.set(m.id, build(m).catch((e) => { prepared.delete(m.id); throw e; }));
  const p = await prepared.get(m.id);
  ready.set(m.id, p);
  return p;
}

// Drops a product's loaded geometry so the next preload builds it again (e.g. a new paste mode).
export function forget(id) {
  prepared.delete(id);
  ready.delete(id);
}

function meshesOf(p, bodyMat, matOf) {
  const group = new THREE.Group();
  for (const part of p.parts) {
    const mesh = new THREE.Mesh(part.g, part.part ? matOf(part.name) : bodyMat);
    mesh.castShadow = true;
    group.add(mesh);
  }
  return group;
}

// Puts a preloaded product on stage and sizes the print canvas for it.
export function showProduct(m) {
  const p = ready.get(m.id);
  if (product) scene.remove(product);
  model = m;
  info = { ...p, capV: m.zones?.cap?.v ?? 2, baseV: m.zones?.base?.v ?? -1 };
  product = meshesOf(p, printMat, partMat);
  scene.add(product);

  const tex = Math.min(4096, renderer.capabilities.maxTextureSize);
  const b0 = Math.max(0, m.cylBand?.[0] ?? info.baseV), b1 = Math.min(1, m.cylBand?.[1] ?? info.capV);
  const band = b1 - b0; // share of the height where labels sit cleanly
  const midY = (b0 + b1) / 2;
  if (m.mode === 'cyl') {
    const around = 2 * Math.PI * p.R, k = tex / Math.max(around, p.H);
    const w = Math.round(around * k), h = Math.round(p.H * k);
    area = {
      w, h, unit: k, wrap: true, safeW: w / Math.PI, safeH: h * band * 0.62, midY,
      bandY0: b0, bandY1: b1,
    };
  } else if (m.mode === 'uv') {
    const w = Math.min(2048, tex);
    const safe = m.safe || { x: 0.5, y: 0.5, w: 0.5, h: 0.5, y0: 0, y1: 1 };
    area = {
      w, h: w, unit: w * 0.5, wrap: false,
      safeW: safe.w * w, safeH: safe.h * w, midX: safe.x, midY: safe.y,
      bandY0: safe.y0 ?? 0, bandY1: safe.y1 ?? 1,
    };
  } else {
    const w = Math.min(2048, tex);
    area = { w, h: w, unit: w / (2 * p.R), wrap: false, safeW: w * 0.5, safeH: w * 0.5, midY: 0.5 };
  }
  printCanvas.width = area.w;
  printCanvas.height = area.h;
  U.uArt.value?.dispose();
  const t = new THREE.CanvasTexture(printCanvas);
  // premultiplied + no colour space: the shader decodes it itself (see FRAG_BODY)
  t.premultiplyAlpha = true;
  t.colorSpace = THREE.NoColorSpace;
  t.wrapS = area.wrap ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  U.uArt.value = t;

  U.uMode.value = m.mode === 'cyl' ? 0 : m.mode === 'uv' ? 2 : 1;
  U.uR.value = p.R;
  U.uH.value = p.H;
  U.uY0.value = p.y0;
  U.uProf.value.set(p.prof);
  U.uCapV.value = info.capV;
  U.uBaseV.value = info.baseV;
  ground.position.y = p.floor;
  blob.position.y = p.floor + 0.002;
  if (S) setScene(S);
  const [az, el] = m.view || (m.mode === 'cyl' ? [0, 12] : [0, 52]);
  setView(az, el);
}

export function artChanged() {
  if (U.uArt.value) U.uArt.value.needsUpdate = true;
}

// Small pictures of every product for the product list: { id: dataURL }.
export async function thumbnails(models, size = 192) {
  const all = await Promise.all(models.map(preload));
  const tScene = new THREE.Scene();
  tScene.environment = scene.environment;
  tScene.environmentIntensity = 0.65;
  tScene.add(new THREE.HemisphereLight(0xffffff, 0x94a3b8, 0.75));
  const tKey = new THREE.DirectionalLight(0xffffff, 1.6);
  tKey.position.set(3.2, 4.5, 4.0);
  const tRim = new THREE.DirectionalLight(0xe2e8f0, 0.7);
  tRim.position.set(-3.5, 1.8, -3.5);
  tScene.add(tKey, tRim);
  const tCam = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  const white = new THREE.MeshPhysicalMaterial({ color: 0xf4f6f8, roughness: 0.36, clearcoat: 0.4, side: THREE.DoubleSide });
  const pr = renderer.getPixelRatio(), out = {};
  renderer.setPixelRatio(1);
  renderer.setSize(size, size, false);
  models.forEach((m, i) => {
    const g = meshesOf(all[i], white, (name) => {
      const p = m.parts?.[name];
      return new THREE.MeshPhysicalMaterial({ color: p?.color || '#e5e7eb', roughness: p?.roughness ?? 0.4, metalness: p?.metal ?? 0, clearcoat: p?.clearcoat ?? 0, side: THREE.DoubleSide });
    });
    const [azDeg, elDeg] = m.cat === 'apparel' ? [-16, 10] : m.view || (m.mode === 'cyl' ? [-28, 16] : [0, 48]);
    const az = rad(azDeg), el = rad(elDeg);
    tCam.position.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).multiplyScalar(5.6);
    tCam.lookAt(0, 0, 0);
    tScene.add(g);
    renderer.render(tScene, tCam);
    out[m.id] = canvas.toDataURL('image/png');
    tScene.remove(g);
  });
  renderer.setPixelRatio(pr);
  renderer.setSize(frameW, frameH, false);
  renderer.render(scene, camera);
  return out;
}

// ---------- scene: background, light, shadow, camera ----------
let S = null; // last scene settings (state.scene in app.js)
let envWanted = null, frameW = 2, frameH = 2;
const envCache = new Map();
const solid = new THREE.Color();
const gradCanvas = Object.assign(document.createElement('canvas'), { width: 512, height: 512 });
const gradTex = new THREE.CanvasTexture(gradCanvas);
gradTex.colorSpace = THREE.SRGBColorSpace;
let photoTex = null;

function coverPhoto() { // crop the photo to fill the frame, like CSS background-size: cover
  if (!photoTex) return;
  const k = camera.aspect / (photoTex.image.width / photoTex.image.height);
  if (k < 1) { photoTex.repeat.set(k, 1); photoTex.offset.set((1 - k) / 2, 0); }
  else { photoTex.repeat.set(1, 1 / k); photoTex.offset.set(0, (1 - 1 / k) / 2); }
}

export function setPhoto(image) {
  photoTex?.dispose();
  photoTex = new THREE.Texture(image);
  photoTex.colorSpace = THREE.SRGBColorSpace;
  photoTex.needsUpdate = true;
  applyBackground();
  requestRender();
}
export const hasPhoto = () => !!photoTex;

function applyBackground() {
  if (!S) return;
  scene.backgroundBlurriness = 0;
  if (S.bg === 'transparent') scene.background = null;
  else if (S.bg === 'gradient') {
    const g = gradCanvas.getContext('2d');
    const grad = S.bgStyle === 'radial' ? g.createRadialGradient(256, 256, 0, 256, 256, 362) : g.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0, S.bg1);
    grad.addColorStop(1, S.bg2);
    g.fillStyle = grad;
    g.fillRect(0, 0, 512, 512);
    gradTex.needsUpdate = true;
    scene.background = gradTex;
  } else if (S.bg === 'env') {
    scene.background = scene.environment;
    scene.backgroundBlurriness = S.bgBlur;
  } else if (S.bg === 'photo' && photoTex) {
    scene.background = photoTex;
    coverPhoto();
  } else scene.background = solid.set(S.bg1);
}

function frame(w, h) { // camera for a w x h picture
  camera.aspect = w / h;
  if (S && (S.panX || S.panY)) camera.setViewOffset(w, h, -S.panX * w, S.panY * h, w, h);
  else camera.clearViewOffset();
  camera.updateProjectionMatrix();
  coverPhoto();
}

export function resize(w, h) {
  frameW = w;
  frameH = h;
  renderer.setSize(w, h, false);
  frame(w, h);
  requestRender();
}

// s = state.scene; envs = { id: file | null } (null = built-in room light)
export function setScene(s, envs) {
  S = s;
  renderer.toneMappingExposure = s.exposure;
  scene.environmentIntensity = s.envInt;
  const turn = rad(s.envRot), el = rad(s.keyHeight), az = turn + 0.75;
  scene.environmentRotation.y = turn;
  scene.backgroundRotation.y = turn;
  key.position.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).multiplyScalar(8);
  key.intensity = s.keyInt;
  ground.material.opacity = s.castShadow;
  ground.visible = s.castShadow > 0;
  drawBlob(s.shadowSoft);
  blob.material.opacity = s.shadow;
  blob.visible = s.shadow > 0;
  if (info) blob.scale.setScalar(info.foot * 2 * (1.5 + 1.2 * s.shadowSoft));

  if (envs && s.env !== envWanted) {
    const id = (envWanted = s.env), file = envs[id];
    if (!envCache.has(id)) {
      envCache.set(id, file
        ? new RGBELoader().loadAsync(file).then((t) => { t.mapping = THREE.EquirectangularReflectionMapping; return t; })
        : Promise.resolve(new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture));
    }
    envCache.get(id).then((t) => {
      if (envWanted !== id) return;
      scene.environment = t;
      applyBackground();
      requestRender();
    }, () => { envCache.delete(id); hooks.envFailed?.(id); });
  }
  applyBackground();

  if (camera.fov !== s.fov) { // change the lens but keep the product the same size in the picture
    const k = Math.tan(rad(camera.fov / 2)) / Math.tan(rad(s.fov / 2));
    camera.position.sub(controls.target).multiplyScalar(k).add(controls.target);
    camera.fov = s.fov;
    controls.update();
  }
  frame(frameW, frameH);
  controls.autoRotate = s.spin;
  controls.autoRotateSpeed = s.spinSpeed * 2;
  if (s.spin && !spinning) { spinning = true; spin(); }
  requestRender();
}

// ---------- camera moves ----------
// distance at which a product fills the picture comfortably, also in a narrow (portrait) frame
const fitDistance = () => 1.66 / Math.tan(rad(camera.fov / 2)) / Math.min(1, camera.aspect * 1.05);

export function setView(azDeg, elDeg) {
  const az = rad(azDeg), el = rad(elDeg);
  const d = fitDistance();
  camera.position.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).multiplyScalar(d);
  controls.target.set(0, 0, 0);
  controls.update();
  requestRender();
}

// Where around the body the camera is looking (0..1, 0.5 = front).
export const facingX = () => Math.atan2(camera.position.x, camera.position.z) / (2 * Math.PI) + 0.5;

// Turn the camera to look straight at position x (0..1 around the body), keeping height and distance.
export function faceAround(x) {
  const az = (x - 0.5) * 2 * Math.PI, d = camera.position.length();
  const el = Math.asin(THREE.MathUtils.clamp(camera.position.y / d, -1, 1));
  camera.position.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).multiplyScalar(d);
  controls.update();
  requestRender();
}

// Same viewing direction, distance back to "fits the picture" (after the picture changed shape).
export function refit() {
  camera.position.sub(controls.target).setLength(fitDistance()).add(controls.target);
  controls.update();
  requestRender();
}

export function zoom(k) {
  const d = THREE.MathUtils.clamp(camera.position.distanceTo(controls.target) * k, controls.minDistance, controls.maxDistance);
  camera.position.sub(controls.target).setLength(d).add(controls.target);
  controls.update();
  requestRender();
}

// ---------- pointer -> print canvas ----------
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();

// The print-canvas pixel under a screen point, or null when that spot cannot be printed.
export function pick(clientX, clientY) {
  if (!product) return null;
  const box = canvas.getBoundingClientRect();
  ndc.set(((clientX - box.left) / box.width) * 2 - 1, -((clientY - box.top) / box.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hit = ray.intersectObject(product, true)[0];
  if (!hit || hit.object.material !== printMat) return null;
  if (model.mode === 'uv') {
    if (!hit.uv || hit.uv.x < 0 || hit.uv.x > 1 || hit.uv.y < 0 || hit.uv.y > 1) return null;
    return { X: hit.uv.x * area.w, Y: (1 - hit.uv.y) * area.h };
  }
  const p = hit.point, n = hit.face.normal.clone();
  if (n.dot(ray.ray.direction) > 0) n.negate(); // the side facing the viewer
  let u, v;
  if (model.mode === 'cyl') { // same rules as the shader
    const r = Math.hypot(p.x, p.z);
    v = (p.y - info.y0) / info.H;
    const wall = info.prof[Math.floor(Math.min(0.999, Math.max(0, v)) * SLICES)];
    if ((n.x * p.x + n.z * p.z) / r < 0.3 || r > wall * 1.08 || v > info.capV || v < info.baseV) return null;
    u = Math.atan2(p.x, p.z) / (2 * Math.PI) + 0.5;
  } else {
    if (n.y < 0.3) return null;
    u = p.x / (2 * info.R) + 0.5;
    v = -p.z / (2 * info.R) + 0.5;
  }
  return { X: u * area.w, Y: (1 - v) * area.h };
}

// ---------- export ----------
// Renders a w x h picture and resolves to its Blob. The on-screen view is put back right after.
export function snapshot(w, h, mime, quality, transparent) {
  const pr = renderer.getPixelRatio(), bg = scene.background;
  renderer.setPixelRatio(1);
  renderer.setSize(w, h, false);
  frame(w, h);
  if (transparent) scene.background = null;
  else if (!bg) scene.background = solid.set('#ffffff'); // formats without transparency get white
  hooks.beforeRender?.();
  renderer.render(scene, camera);
  const done = new Promise((resolve) => canvas.toBlob(resolve, mime, quality));
  scene.background = bg;
  if (S) applyBackground();
  renderer.setPixelRatio(pr);
  renderer.setSize(frameW, frameH, false);
  frame(frameW, frameH);
  renderer.render(scene, camera);
  return done;
}
