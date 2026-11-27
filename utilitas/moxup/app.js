// The app: one settings object (state), controls bound to it by data-k / data-chips attributes,
// undo history, dragging the design on the product, and export.
import { MODELS } from './models.js';
import { FINISHES, TEXTURES, ENVS, FONTS, SWATCHES, BG_SWATCHES, RATIOS, FORMATS } from './presets.js';
import * as stage from './stage.js';
import * as design from './design.js';
import * as lay from './layout.js';
import { initColorPicker, syncColorButtons } from './color-picker.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const clone = (o) => JSON.parse(JSON.stringify(o));
const icon = (name, cls = 'sbt-icon--sm') => `<span class="sbt-icon ${cls}">${window.SubtilsIcons?.svg(name) || ''}</span>`;

const DEFAULTS = {
  product: 'mug',
  colors: { body: '#ffffff', two: false, inner: '#FF6600', handle: '#FF6600', parts: {} },
  shirt: {
    preset: 'solid', band: 0.35, splitSides: false, splitBack: false, rollL: false, rollR: false,
    collar: '#ffffff', collarIn: '#ffffff', placket: '#ffffff', pocket: '#ffffff',
    epaulet: '#ffffff', yoke: '#ffffff',
    sleeve: '#ffffff', sleeveL: '#ffffff', sleeveR: '#ffffff',
    cuff: '#ffffff', cuffL: '#ffffff', cuffR: '#ffffff', hem: '#ffffff', back: '#ffffff',
  },
  finish: { preset: 'glossy', ...FINISHES.glossy.v },
  texture: { preset: 'none', ...TEXTURES.none.v },
  print: { multiply: false },
  pattern: { on: false, mode: 'brick', fill: true, balance: true, size: 0.14, gap: 0.35, rot: 0, jitter: 0, seed: 1 },
  layers: [],
  selected: null,
  scene: {
    ratio: 'free',
    bg: 'solid', bg1: '#ECEFF3', bg2: '#C5CFDB', bgStyle: 'linear', bgBlur: 0.6,
    env: 'studio', exposure: 1, envRot: 0, envInt: 1, keyInt: 0.8, keyHeight: 55,
    shadow: 0.55, shadowSoft: 0.5, castShadow: 0.18,
    fov: 30, panX: 0, panY: 0, spin: false, spinSpeed: 1,
  },
  out: { format: 'png', size: 2000, quality: 0.92, transparent: false, name: 'moxup' },
};

export const state = clone(DEFAULTS);
let model = null;      // entry of MODELS on stage
let artDirty = true;   // print canvas must be repainted before the next frame
let snap = null;       // centre lines shown while a dragged layer is snapped
let clean = false;     // true while exporting: no selection frame, no guides

const sel = () => state.layers.find((l) => l.id === state.selected) || null;

stage.hooks.beforeRender = () => {
  if (!artDirty || !stage.area) return;
  artDirty = false;
  const hideAid = clean || state.pattern.on;
  design.compose(stage.printCanvas, stage.area, state.layers, hideAid ? null : sel(), hideAid ? null : snap, state.pattern);
  stage.artChanged();
};
stage.hooks.envFailed = () => {
  toast('Cahaya ini gagal dimuat. Dipakai cahaya sederhana.', true);
  state.scene.env = 'basic';
  changed('scene.env');
};

// ---------- reading and writing settings by path ----------
// 'scene.fov' is state.scene.fov, 'layer.size' is the selected layer, 'model.mode' is the product on stage.
function at(path) {
  const [head, ...rest] = path.split('.');
  return { base: head === 'layer' ? sel() : head === 'model' ? model : state[head], rest, head };
}
function get(path) {
  const { base, rest } = at(path);
  return rest.reduce((o, k) => (o == null ? undefined : o[k]), base);
}
function set(path, v) {
  const { base, rest, head } = at(path);
  if (!rest.length) { state[head] = v; return; }
  if (!base) return;
  const last = rest.pop();
  rest.reduce((o, k) => (o[k] ??= {}), base)[last] = v;
}
// data-if="path", "!path", "path=a|b" or "path!=a"
function test(expr) {
  const [, not, path, op, want] = expr.match(/^(!?)([\w.]+)(?:(!?=)(.*))?$/);
  const v = get(path);
  if (!op) return not ? !v : !!v;
  return want.split('|').includes(String(v)) === (op === '=');
}

const FMT = {
  pct: (v) => Math.round(v * 100) + '%',
  deg: (v) => Math.round(v) + '°',
  turn: (v) => Math.round((v - 0.5) * 360) + '°', // position around the body, 0 = front
  mul: (v) => Number(v).toFixed(1).replace(/\.0$/, '') + '×',
};

// ---------- settings -> stage ----------
function applyLook() {
  const c = state.colors, mine = c.parts[model.id] || {}, z = model.zones || {};
  const parts = {};
  for (const [name, p] of Object.entries(model.parts || {})) parts[name] = mine[name] || p.color;
  stage.setLook({
    body: c.body, two: c.two && !!model.twoTone, inner: c.inner, handle: c.handle,
    cap: mine.cap || z.cap?.color || c.body, base: mine.base || z.base?.color || c.body,
    parts, ...state.finish, multiply: state.print.multiply,
    tex: state.texture.preset, texStr: state.texture.strength, texScale: state.texture.scale,
    shirt: model.cat === 'apparel' ? state.shirt : null,
  });
}

function shirtContrast(hex) {
  const s = (hex || '#ffffff').replace('#', '');
  const r = parseInt(s.slice(0, 2), 16) || 0, g = parseInt(s.slice(2, 4), 16) || 0, b = parseInt(s.slice(4, 6), 16) || 0;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.55 ? '#0D1B54' : '#FFFFFF';
}

function syncJerseyTextColors() {
  const col = shirtContrast(state.shirt.splitBack ? state.shirt.back : state.colors.body);
  for (const L of state.layers) if (L.template === 'jersey' && L.color !== col) {
    L.color = col;
    artDirty = true;
  }
}

function clearJerseyTemplate() {
  const before = state.layers.length;
  state.layers = state.layers.filter((l) => l.template !== 'jersey');
  if (state.layers.length !== before) {
    if (!state.layers.some((l) => l.id === state.selected)) state.selected = null;
    artDirty = true;
  }
}

function addJerseyTemplate() {
  if (model?.cat !== 'apparel' || state.shirt.preset !== 'jersey') return;
  if (state.layers.some((l) => l.type === 'text' && l.x > 0.55)) return;
  const back = model.places?.find((p) => p.label === 'Punggung');
  const backX = back?.x ?? 0.745, backY = back?.y ?? 0.72;
  const col = shirtContrast(state.shirt.splitBack ? state.shirt.back : state.colors.body);
  const base = { type: 'text', font: 'Bebas Neue', color: col, bold: false, italic: false, align: 'center', stroke: 0, strokeColor: '#ffffff', curve: 0, template: 'jersey' };
  addLayer({ ...base, text: 'BENDRAT', x: backX, y: backY + 0.105, size: 0.052, spacing: 0.06 });
  addLayer({ ...base, text: '12', x: backX, y: backY - 0.045, size: 0.19, spacing: 0.02 });
  state.selected = null;
  artDirty = true;
}

function applyShirtPreset(preset) {
  const sh = state.shirt, body = state.colors.body, accent = shirtContrast(body);
  sh.preset = preset;
  if (preset === 'solid') {
    sh.splitSides = sh.splitBack = false;
    sh.collar = sh.collarIn = sh.placket = sh.pocket = sh.epaulet = sh.yoke = sh.sleeve = sh.sleeveL = sh.sleeveR = sh.cuff = sh.cuffL = sh.cuffR = sh.hem = sh.back = body;
    clearJerseyTemplate();
  } else if (preset === 'ringer') {
    sh.collar = sh.collarIn = sh.placket = sh.pocket = sh.epaulet = sh.cuff = sh.cuffL = sh.cuffR = sh.hem = accent;
    sh.yoke = body;
    sh.sleeve = sh.sleeveL = sh.sleeveR = body;
    if (!sh.splitBack) sh.back = body;
    if (sh.band < 0.1) sh.band = 0.35;
    clearJerseyTemplate();
  } else if (preset === 'raglan') {
    sh.collar = sh.collarIn = sh.placket = sh.epaulet = sh.yoke = sh.sleeve = sh.sleeveL = sh.sleeveR = sh.cuff = sh.cuffL = sh.cuffR = accent;
    sh.pocket = sh.hem = body;
    if (!sh.splitBack) sh.back = body;
    clearJerseyTemplate();
  } else if (preset === 'jersey') {
    sh.splitSides = false;
    sh.splitBack = true;
    sh.collar = sh.collarIn = sh.placket = sh.pocket = sh.yoke = sh.sleeve = sh.sleeveL = sh.sleeveR = sh.hem = sh.back = accent;
    sh.cuff = sh.cuffL = sh.cuffR = sh.epaulet = '#FF6600';
    if (sh.band < 0.1) sh.band = 0.35;
    addJerseyTemplate();
  }
  syncJerseyTextColors();
}

const ENV_FILES = Object.fromEntries(Object.entries(ENVS).map(([id, e]) => [id, e.file]));
const applyScene = () => stage.setScene(state.scene, ENV_FILES);

const stageEl = $('#stage'), frame = $('#frame');
function layoutFrame() { // size the picture inside the free space, in the chosen shape
  const r = RATIOS[state.scene.ratio];
  stageEl.classList.toggle('boxed', !!r); // boxed: padding keeps the floating buttons off the picture
  const cs = getComputedStyle(stageEl);
  const availW = stageEl.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const availH = stageEl.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  let w = availW, h = availH;
  if (r) {
    w = Math.min(availW, availH * r);
    h = w / r;
  }
  if (w < 2 || h < 2) return;
  frame.classList.toggle('boxed', !!r);
  frame.style.width = w + 'px';
  frame.style.height = h + 'px';
  stage.resize(Math.round(w), Math.round(h));
  updateOutInfo();
}
new ResizeObserver(layoutFrame).observe(stageEl);

// ---------- settings -> controls ----------
let layersKey = '';
function renderLayers() {
  const key = JSON.stringify(state.layers.map((l) => [l.id, l.name, l.visible, l.locked, l.text, l.asset])) + state.selected;
  if (key === layersKey) return;
  layersKey = key;
  const list = $('#layers');
  list.replaceChildren();
  for (const L of [...state.layers].reverse()) { // top-most first, as in the picture
    const li = document.createElement('li');
    li.dataset.id = L.id;
    li.className = (L.id === state.selected ? 'on ' : '') + (L.visible ? '' : 'off');
    li.innerHTML = `<button type="button" class="pick" data-act="layer-select"><span class="th">${L.type === 'text' ? icon('text-h-two') : ''}</span><span class="nm"></span></button>
      <button type="button" class="sbt-icon-key" data-act="layer-eye" title="${L.visible ? 'Sembunyikan' : 'Tampilkan'}" aria-label="${L.visible ? 'Sembunyikan' : 'Tampilkan'}">${icon(L.visible ? 'eye' : 'eye-slash')}</button>
      <button type="button" class="sbt-icon-key" data-act="layer-lock" title="${L.locked ? 'Buka kunci posisi' : 'Kunci posisi'}" aria-label="${L.locked ? 'Buka kunci posisi' : 'Kunci posisi'}">${icon(L.locked ? 'lock' : 'lock-open')}</button>
      <button type="button" class="sbt-icon-key" data-act="layer-del" title="Hapus" aria-label="Hapus">${icon('trash')}</button>`;
    $('.nm', li).textContent = L.type === 'text' ? L.text.replace(/\s+/g, ' ').trim() || 'Teks kosong' : L.name;
    if (L.type === 'image') $('.th', li).style.backgroundImage = `url(${design.thumbUrl(L.asset)})`;
    list.append(li);
  }
  $('#noLayers').hidden = state.layers.length > 0;
  $('#pickHint').hidden = state.layers.length === 0 || !!sel();
}

// "about 8 x 4 cm on the product", and a warning when the picture is too coarse for that size
function updateSizeInfo() {
  const L = sel(), info = $('#sizeInfo'), warn = $('#sizeWarn');
  warn.hidden = true;
  if (!L || !model.realCm) { info.textContent = ''; return; }
  const h = L.size * model.realCm, w = h * L.aspect;
  const cm = (v) => v.toFixed(1).replace('.', ',');
  info.textContent = `Perkiraan ukuran di produk: ${cm(w)} × ${cm(h)} cm`;
  if (L.type !== 'image') return;
  const dpi = design.assets.get(L.asset).h / (h / 2.54);
  if (dpi < 110) {
    warn.hidden = false;
    warn.textContent = `Gambar ini kecil untuk ukuran tersebut (sekitar ${Math.round(dpi)} dpi), hasil cetak bisa buram. Kecilkan desain atau pakai gambar yang lebih besar.`;
  }
}

function outSize() { // exported picture has the shape of the frame, long side = chosen size
  // the chosen ratio itself, not the on-screen frame: that one is rounded to whole pixels
  const r = RATIOS[state.scene.ratio] || stage.canvas.clientWidth / Math.max(1, stage.canvas.clientHeight);
  const long = Math.min(state.out.size, stage.maxSize);
  return r >= 1 ? [long, Math.round(long / r)] : [Math.round(long * r), long];
}
function updateOutInfo() {
  const [w, h] = outSize();
  $('#outInfo').textContent = `Hasil: ${w} × ${h} piksel`;
}

function syncUI() {
  for (const el of $$('[data-k]')) {
    const v = get(el.dataset.k) ?? el.dataset.def;
    if (el.type === 'checkbox') el.checked = !!v;
    else if (v !== undefined && el.value !== String(v)) el.value = v;
    if (el.type === 'range') syncSliderVisual(el);
    const out = el.closest('label')?.querySelector('output');
    if (out && v !== undefined) out.textContent = (FMT[el.dataset.fmt] || String)(v);
  }
  for (const g of $$('[data-chips]')) {
    const v = String(get(g.dataset.chips));
    for (const b of g.children) b.setAttribute('aria-pressed', String(b.dataset.v === v));
  }
  for (const b of $$('[data-swatch]')) b.setAttribute('aria-pressed', String(get(b.dataset.swatch)?.toLowerCase() === b.dataset.v.toLowerCase()));
  syncColorButtons(get, (btn) => btn.dataset.def);
  for (const el of $$('[data-if]')) el.hidden = !test(el.dataset.if);
  for (const b of $('#products').children) b.setAttribute('aria-pressed', String(b.dataset.id === state.product));
  renderLayers();
  updateSizeInfo();
  updateOutInfo();
  $('#undo').disabled = hist.i === 0;
  $('#redo').disabled = hist.i === hist.list.length - 1;
}

// A setting changed: pass it on to the stage and refresh the controls.
function changed(path) {
  const top = path.split('.')[0];
  if (top === 'layer') {
    const L = sel();
    if (L?.template) delete L.template;
    if (L?.type === 'text') measureText(L);
    artDirty = true;
  }
  if (top === 'layers' || top === 'selected' || top === 'pattern') artDirty = true;
  if (path === 'finish.preset') Object.assign(state.finish, FINISHES[state.finish.preset].v);
  else if (top === 'finish') state.finish.preset = 'custom';
  if (path === 'texture.preset') Object.assign(state.texture, TEXTURES[state.texture.preset].v);
  if (path === 'colors.body' && state.shirt.preset !== 'custom') applyShirtPreset(state.shirt.preset);
  if (path === 'shirt.preset') applyShirtPreset(state.shirt.preset);
  else if (path === 'shirt.splitSides') {
    const sh = state.shirt;
    if (sh.splitSides) { sh.sleeveL = sh.sleeveR = sh.sleeve; sh.cuffL = sh.cuffR = sh.cuff; }
    else { sh.sleeve = sh.sleeveR = sh.sleeveL; sh.cuff = sh.cuffR = sh.cuffL; }
  } else if (path === 'shirt.splitBack') {
    if (state.shirt.splitBack) state.shirt.back = state.colors.body;
  } else if (top === 'shirt' && path !== 'shirt.band' && path !== 'shirt.rollL' && path !== 'shirt.rollR') {
    const sh = state.shirt;
    if (!sh.splitSides) { sh.sleeveL = sh.sleeveR = sh.sleeve; sh.cuffL = sh.cuffR = sh.cuff; }
    sh.preset = 'custom';
  }
  if (top === 'colors' || top === 'finish' || top === 'print' || top === 'texture' || top === 'shirt') {
    if (model?.cat === 'apparel') syncJerseyTextColors();
    applyLook();
  }
  if (top === 'scene') applyScene();
  if (path === 'scene.ratio') { layoutFrame(); stage.refit(); }
  syncUI();
  stage.requestRender();
}

// ---------- undo / redo ----------
// Which element is selected is not a step: clicking around must not fill the history.
const snapshot = () => JSON.stringify({ ...state, selected: null });
const hist = { list: [snapshot()], i: 0 };

function commit() {
  const now = snapshot();
  if (now === hist.list[hist.i]) return;
  hist.list.length = hist.i + 1;
  hist.list.push(now);
  if (hist.list.length > 80) hist.list.shift();
  hist.i = hist.list.length - 1;
  syncUI();
}

async function travel(step) {
  const j = hist.i + step;
  if (j < 0 || j >= hist.list.length) return;
  hist.i = j;
  const keep = state.selected;
  for (const k of Object.keys(state)) delete state[k];
  Object.assign(state, JSON.parse(hist.list[j]));
  state.selected = state.layers.some((l) => l.id === keep) ? keep : null;
  const m = MODELS.find((x) => x.id === state.product);
  if (!m) state.product = model.id; // that uploaded model was deleted: stay on the product on stage
  else if (m !== model) {
    await stage.preload(m);
    stage.showProduct(m);
    model = m;
    renderCredit(m);
    buildParts();
    buildPlaces();
  }
  applyLook();
  applyScene();
  layoutFrame();
  artDirty = true;
  syncUI();
  stage.requestRender();
}

// ---------- products ----------
let loading = 0;
async function setProduct(id) {
  const m = MODELS.find((x) => x.id === id), from = stage.area, ticket = ++loading;
  try {
    await stage.preload(m);
  } catch (e) {
    toast('Produk ini gagal dimuat. Muat ulang halaman lalu coba lagi.', true);
    return;
  }
  if (ticket !== loading) return; // another product was picked meanwhile
  stage.showProduct(m);
  model = m;
  state.product = id;
  state.finish = { preset: m.finish, ...FINISHES[m.finish].v };
  const tex = m.texture || 'none';
  state.texture = { preset: tex, ...TEXTURES[tex].v };
  if (m.cat !== 'apparel' || state.shirt.preset !== 'jersey') clearJerseyTemplate();
  if (from) state.layers = lay.remapAll(state.layers, from, stage.area);
  if (m.cat === 'apparel' && state.shirt.preset === 'jersey') addJerseyTemplate();
  buildParts();
  buildPlaces();
  renderCredit(m);
  applyLook();
  artDirty = true;
  syncUI();
  stage.requestRender();
}

function renderCredit(m) {
  const c = m.credit || '';
  const hit = c.match(/^"([^"]+)"\s+oleh\s+([^,]+),\s+([^,]+),\s+via\s+(.+)$/);
  if (hit) {
    $('#creditTitle').textContent = hit[1];
    $('#creditLic').textContent = hit[3].replace(/\s+License$/i, '');
    $('#creditSub').textContent = `${hit[2]} · ${hit[4]}`;
  } else {
    $('#creditTitle').textContent = m.name;
    $('#creditLic').textContent = 'MOXUP';
    $('#creditSub').textContent = c.replace(/\s+dibuat oleh MOXUP$/i, '') || 'Model bawaan MOXUP';
  }
}

// Colour pickers for the parts this product has (lid, saucer, cap, base).
function buildParts() {
  const rows = { ...(model.parts || {}), ...(model.zones || {}) };
  $('#parts').innerHTML = Object.entries(rows).map(([key, p]) => {
    const label = `Warna ${p.label.toLowerCase()}`;
    return `<label class="mox-line-row"><span>${label}</span><button type="button" class="mox-color-btn" data-color="colors.parts.${model.id}.${key}" data-title="${label}" data-def="${p.color}"></button></label>`;
  }).join('');
}

function buildPlaces() {
  const el = $('#uvPlaces');
  if (!el) return;
  const list = model.places || [];
  el.classList.toggle('mox-places-grid', list.length > 5 || (list.length > 4 && list.some((p) => p.label.length > 8)));
  el.innerHTML = list.map((p, i) =>
    `<button type="button" class="sbt-seg-btn" data-act="place-uv" data-i="${i}">${p.label}</button>`).join('');
}

// ---------- layers ----------
let layerSerial = 0;
function addLayer(props) {
  const L = {
    id: 'L' + ++layerSerial, x: stage.area.wrap ? stage.facingX() : (stage.area.midX ?? 0.5), y: stage.area.midY, rot: 0, opacity: 1, flipX: false, flipY: false,
    visible: true, tile: false, gap: 0.3, brick: false, ...props,
  };
  if (L.type === 'text') measureText(L);
  if (!L.size) L.size = lay.fitSize(L.aspect, stage.area) * (L.type === 'text' ? 0.6 : 1);
  state.layers.push(L);
  state.selected = L.id;
  return L;
}

// A text layer's box follows its words, font and curve. The letters keep their size:
// when the box gets taller (a new line, more curve) the layer grows with it.
function measureText(L) {
  const fitBox = () => {
    const t = design.textBox(L);
    if (L.boxH) L.size *= t.h / L.boxH;
    L.boxH = t.h;
    L.aspect = t.w / t.h;
  };
  fitBox();
  const font = design.fontCss(L, 100);
  if (document.fonts.check(font)) return;
  document.fonts.load(font).then(() => { // fonts load on first use
    fitBox();
    artDirty = true;
    syncUI();
    stage.requestRender();
  }, () => {});
}

const loadImg = (url) => new Promise((resolve, reject) => {
  const img = new Image();
  img.onload = () => (img.naturalWidth ? resolve(img) : reject());
  img.onerror = reject;
  img.src = url;
});

async function readImage(file) {
  const url = URL.createObjectURL(file);
  try {
    return await loadImg(url);
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function addImages(files) {
  const at = imageAt;
  imageAt = null;
  let added = 0;
  for (const file of files) {
    let img;
    try {
      img = await readImage(file);
    } catch (e) {
      toast(`"${file.name}" bukan gambar yang bisa dibuka. Pakai PNG, JPG, WebP, atau SVG.`, true);
      continue;
    }
    state.layers = state.layers.filter((l) => !l.sample); // the example makes way for real art
    addLayer({
      type: 'image', asset: design.addAsset(img), name: file.name || 'Gambar tempel', aspect: img.naturalWidth / img.naturalHeight,
      bright: 1, contrast: 1, sat: 1, cut: false, cutTol: 0.12, tintMode: 'none', tintColor: '#FF6600', ...at,
    });
    added++;
  }
  if (!added) return;
  showTab('desain');
  changed('layers');
  commit();
  toast(added > 1 ? `${added} gambar ditambahkan` : 'Gambar ditambahkan. Seret di produk untuk memindahkannya.');
}

async function addSample() { // default Subfiksi logo template on first load / reset
  try {
    const img = await loadImg('logos/Logo_Subfiksi_Warna_Panjang_png.png');
    addLayer({
      type: 'image', asset: design.addAsset(img), name: 'Logo Subfiksi',
      aspect: img.naturalWidth / img.naturalHeight, sample: true,
      bright: 1, contrast: 1, sat: 1, cut: false, cutTol: 0.12, tintMode: 'none', tintColor: '#FF6600',
    });
    state.selected = null;
    return;
  } catch {}
  const c = document.createElement('canvas');
  c.width = 1200;
  c.height = 400;
  const g = c.getContext('2d');
  g.fillStyle = '#FF6600';
  g.fillRect(60, 100, 200, 200);
  g.fillStyle = '#003380';
  g.textBaseline = 'middle';
  g.font = '800 175px "Plus Jakarta Sans", system-ui, sans-serif';
  g.fillText('SUBFIKSI', 300, 205);
  addLayer({ type: 'image', asset: design.addAsset(c), name: 'Logo Subfiksi', aspect: 3, sample: true, bright: 1, contrast: 1, sat: 1, cut: false, cutTol: 0.12, tintMode: 'none', tintColor: '#FF6600' });
  state.selected = null;
}

const mod1 = (v) => ((v % 1) + 1) % 1;
function withLayer(fn) { // run fn on the selected layer, then record it
  const L = sel();
  if (!L) return;
  fn(L);
  changed('layer');
  commit();
}

// ---------- buttons ----------
function showTab(name) {
  const side = $('#side');
  if (side?.classList.contains('is-collapsed')) {
    side.classList.remove('is-collapsed');
    const tog = $('#toggleDrawer');
    if (tog) { tog.classList.add('is-active'); tog.setAttribute('aria-pressed', 'true'); }
  }
  for (const b of $$('.tabs button[data-tab]')) b.setAttribute('aria-selected', String(b.dataset.tab === name));
  for (const p of $$('.panel')) p.hidden = p.id !== 'tab-' + name;
}

function toast(msg, bad, btn, tempText) {
  if (btn && tempText) window.SubtilsUI?.flashButton(btn, tempText);
  if (bad && $('#side')?.classList.contains('is-collapsed')) {
    $('#side').classList.remove('is-collapsed');
    $('#toggleDrawer')?.classList.add('is-active');
  }
  window.SubtilsUI?.setBanner('#statusBanner', msg, bad ? 'editing' : 'info');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => window.SubtilsUI?.setBanner('#statusBanner', ''), bad ? 6500 : 3600);
}

// Renders the picture as it is on screen, without editing aids. Resolves to a Blob.
function renderPicture(format) {
  const f = FORMATS[format], [w, h] = outSize();
  clean = true;
  artDirty = true;
  const done = stage.snapshot(w, h, f.mime, state.out.quality, f.alpha && (state.out.transparent || state.scene.bg === 'transparent'));
  clean = false;
  artDirty = true;
  stage.requestRender();
  return done;
}

const ACTIONS = {
  tab: (b) => showTab(b.dataset.tab),
  'toggle-drawer': () => {
    const side = $('#side');
    if (!side) return;
    const collapsing = !side.classList.contains('is-collapsed');
    side.classList.toggle('is-collapsed', collapsing);
    const tog = $('#toggleDrawer');
    if (tog) {
      tog.classList.toggle('is-active', !collapsing);
      tog.setAttribute('aria-pressed', String(!collapsing));
    }
  },
  'dismiss-banner': () => {
    clearTimeout(toast.timer);
    window.SubtilsUI?.setBanner('#statusBanner', '');
  },
  help: () => $('#help').showModal(),
  credits: () => $('#credits').showModal(),
  undo: () => travel(-1),
  redo: () => travel(1),
  cat: (b) => {
    const cat = b.dataset.cat;
    for (const btn of $$('#productCats [data-cat]')) btn.classList.toggle('is-active', btn === b);
    for (const p of $$('#products button')) p.hidden = cat !== 'all' && p.dataset.cat !== cat;
  },
  product: (b) => setProduct(b.dataset.id).then(commit),
  'pick-image': () => $('#file').click(),
  'pick-photo': () => $('#photo').click(),
  'pick-glb': () => $('#glb').click(),
  'add-text': (b, at) => {
    addLayer({
      type: 'text', text: 'Teks Anda', font: FONTS[0].name, color: '#14171F', bold: true, italic: false,
      align: 'center', spacing: 0, stroke: 0, strokeColor: '#ffffff', curve: 0, ...at,
    });
    changed('layers');
    commit();
    $('#textBox').focus();
    $('#textBox').select();
  },
  'layer-select': (b) => {
    state.selected = b.closest('li').dataset.id;
    if (stage.area.wrap) stage.faceAround(sel().x); // bring it into view
    changed('selected');
  },
  'layer-eye': (b) => {
    const L = state.layers.find((l) => l.id === b.closest('li').dataset.id);
    L.visible = !L.visible;
    changed('layers');
    commit();
  },
  // from the layer list (its row) or from the right-click menu (the selected layer)
  'layer-lock': (b) => {
    const L = state.layers.find((l) => l.id === (b.closest('li')?.dataset.id ?? state.selected));
    if (!L) return;
    L.locked = !L.locked;
    changed('layers');
    commit();
  },
  'layer-del': (b) => removeLayer(b.closest('li')?.dataset.id ?? state.selected),
  'ctx-image': () => {
    imageAt = ctxAt;
    $('#file').click();
  },
  'ctx-text': () => ACTIONS['add-text'](null, ctxAt),
  'layer-dup': () => withLayer((L) => {
    const copy = { ...clone(L), id: 'L' + ++layerSerial, x: stage.area.wrap ? mod1(L.x + 0.04) : Math.min(1, L.x + 0.04), y: Math.max(0, L.y - 0.04) };
    delete copy.sample;
    state.layers.push(copy);
    state.selected = copy.id;
  }),
  'to-back': (b) => withLayer((L) => {
    const copy = { ...clone(L), id: 'L' + ++layerSerial, x: mod1(L.x + 0.5) };
    delete copy.sample;
    state.layers.push(copy);
    toast('Salinan dipasang di sisi seberangnya.', false, b, 'Disalin');
  }),
  'layer-up': () => withLayer((L) => moveLayer(L, 1)),
  'layer-down': () => withLayer((L) => moveLayer(L, -1)),
  'flip-x': () => withLayer((L) => { L.flipX = !L.flipX; }),
  'flip-y': () => withLayer((L) => { L.flipY = !L.flipY; }),
  'pattern-shuffle': (b) => {
    state.pattern.seed = (state.pattern.seed % 9999) + 1;
    changed('pattern.seed');
    commit();
    window.SubtilsUI?.flashButton(b, 'Diacak');
  },
  place: (b) => withLayer((L) => { L.x = Number(b.dataset.x); stage.faceAround(L.x); }),
  'place-uv': (b) => withLayer((L) => {
    const p = model.places?.[Number(b.dataset.i)];
    if (!p) return;
    L.x = p.x;
    L.y = p.y;
    if (p.az !== undefined) stage.setView(p.az, p.el);
  }),
  fit: () => withLayer((L) => {
    Object.assign(L, { x: stage.area.midX ?? 0.5, y: stage.area.midY, rot: 0, size: lay.fitSize(L.aspect, stage.area) });
    if (stage.area.wrap) stage.faceAround(0.5);
  }),
  wrap: () => withLayer((L) => {
    const a = stage.area; // around a body: as wide as the whole way round; on a plate/box: cover it
    Object.assign(L, { x: a.midX ?? 0.5, y: a.midY, rot: 0, size: a.wrap ? a.w / (L.aspect * a.h) : Math.max(1, 1 / L.aspect) });
  }),
  view: (b) => {
    stage.setView(Number(b.dataset.az), Number(b.dataset.el));
    for (const btn of $$('.mox-views .sbt-seg-btn')) btn.classList.toggle('is-active', btn === b);
  },
  'zoom-in': () => stage.zoom(0.85),
  'zoom-out': () => stage.zoom(1 / 0.85),
  'reset-scene': (b) => {
    state.scene = clone(DEFAULTS.scene);
    changed('scene.ratio');
    const [az, el] = model.view || (model.mode === 'cyl' ? [0, 12] : [0, 52]);
    stage.setView(az, el);
    commit();
    window.SubtilsUI?.flashButton(b, 'Direset');
  },
  'reset-all': async () => {
    const ok = await window.SubtilsUI.confirm({
      title: 'Mulai dari awal?',
      message: 'Semua desain dan pengaturan pada produk akan dihapus.',
      confirmText: 'Ya, mulai ulang',
      cancelText: 'Batal',
      tone: 'warning',
    });
    if (!ok) return;
    Object.assign(state, clone(DEFAULTS));
    await setProduct(state.product);
    await addSample();
    changed('scene.ratio');
    commit();
  },
  download: async (b) => {
    const blob = await renderPicture(state.out.format);
    if (!blob) return toast('Gambar gagal dibuat. Coba ukuran yang lebih kecil.', true);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${state.out.name.trim() || 'moxup'}-${model.id}.${state.out.format}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    toast('Gambar diunduh ke folder Unduhan.', false, b, 'Diunduh');
  },
  copy: async (b) => {
    try {
      const blob = await renderPicture('png');
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      toast('Gambar disalin ke clipboard.', false, b, 'Disalin');
    } catch (e) {
      toast('Browser ini tidak mengizinkan salin gambar. Pakai Unduh.', true);
    }
  },
};

function moveLayer(L, step) {
  const i = state.layers.indexOf(L), j = i + step;
  if (j < 0 || j >= state.layers.length) return;
  state.layers.splice(i, 1);
  state.layers.splice(j, 0, L);
}

function removeLayer(id) {
  state.layers = state.layers.filter((l) => l.id !== id);
  if (state.selected === id) state.selected = null;
  changed('layers');
  commit();
}

document.addEventListener('click', (e) => {
  const chip = e.target.closest('[data-chips] > [data-v]');
  if (chip) {
    const g = chip.parentElement;
    set(g.dataset.chips, g.dataset.type === 'num' ? Number(chip.dataset.v) : chip.dataset.v);
    changed(g.dataset.chips);
    commit();
    return;
  }
  const sw = e.target.closest('[data-swatch]');
  if (sw) {
    set(sw.dataset.swatch, sw.dataset.v);
    changed(sw.dataset.swatch);
    commit();
    return;
  }
  const b = e.target.closest('[data-act]');
  if (!b) return;
  if (ctxMenu.contains(b)) ctxMenu.hidePopover();
  ACTIONS[b.dataset.act]?.(b);
});

document.addEventListener('input', (e) => {
  const el = e.target.closest('[data-k]');
  if (!el) return;
  set(el.dataset.k, el.type === 'checkbox' ? el.checked : el.type === 'range' ? Number(el.value) : el.value);
  changed(el.dataset.k);
});
document.addEventListener('change', (e) => {
  if (e.target.closest('[data-k]')) commit();
});
document.addEventListener('dblclick', (e) => {
  const el = e.target.closest('input[type=range][data-k]');
  if (!el) return;
  const k = el.dataset.k;
  let def;
  if (k.startsWith('layer.')) {
    const L = sel();
    if (!L) return;
    const prop = k.slice(6);
    if (prop === 'size') def = stage.area ? lay.fitSize(L.aspect, stage.area) * (L.type === 'text' ? 0.6 : 1) : undefined;
    else def = { x: stage.area?.midX ?? 0.5, y: stage.area?.midY ?? 0.5, rot: 0, opacity: 1, cutTol: 0.12, bright: 1, contrast: 1, sat: 1, curve: 0, spacing: 0, stroke: 0, gap: 0.3 }[prop];
  } else if (k.startsWith('finish.')) {
    const prop = k.slice(7);
    def = (FINISHES[model?.finish]?.v || DEFAULTS.finish)[prop];
  } else if (k.startsWith('texture.')) {
    const prop = k.slice(8);
    def = (TEXTURES[state.texture.preset]?.v || DEFAULTS.texture)[prop];
  } else {
    def = k.split('.').reduce((o, p) => o?.[p], DEFAULTS);
  }
  if (def === undefined) return;
  set(k, def);
  changed(k);
  commit();
});

$('#file').addEventListener('change', (e) => {
  addImages([...e.target.files]);
  e.target.value = ''; // picking the same file again still fires change
});
$('#file').addEventListener('cancel', () => { imageAt = null; });
$('#photo').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    stage.setPhoto(await readImage(file));
    state.scene.bg = 'photo';
    changed('scene.bg');
    commit();
  } catch (err) {
    toast('Foto ini tidak bisa dibuka. Pakai PNG atau JPG.', true);
  }
});

// ---------- the user's own .glb models ----------
// The file never leaves the browser: it is read into a blob: URL that only this tab can open.
// Nothing is sent anywhere (serve.ps1 only serves the app's own files and accepts no uploads).
let customSerial = 0;
const MAX_GLB = 200 * 1024 * 1024;

async function isGlb(file) {
  const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  return String.fromCharCode(...head) === 'glTF'; // binary glTF magic
}

const hasUv = (p) => p.parts.some((x) => !x.part && x.g.attributes.uv);
const NO_UV = 'Model ini tidak punya peta UV. Pilih cara tempel "Melingkar badan" atau "Permukaan atas".';

async function refreshThumb(m) {
  try {
    const urls = await stage.thumbnails([m]);
    const img = $('#thumb-' + m.id);
    if (img && urls[m.id]) img.src = urls[m.id];
  } catch (e) { /* the list keeps an empty picture */ }
}

async function addCustomGlb(file) {
  if (!file) return;
  if (file.size > MAX_GLB) { toast('File GLB terlalu besar (maksimal 200 MB).', true); return; }
  if (!/\.glb$/i.test(file.name) || !(await isGlb(file))) {
    toast('Pilih file .glb (glTF biner). File .gltf dengan file terpisah belum didukung.', true);
    return;
  }
  const url = URL.createObjectURL(file);
  const cm = Number($('#glbCm').value);
  const m = {
    id: 'custom-' + ++customSerial, cat: 'custom', custom: true,
    name: file.name.replace(/\.glb$/i, '').slice(0, 28) || 'Model saya',
    file: url, mode: $('#glbMode').value, realCm: cm > 0 ? cm : 10, finish: 'glossy',
    credit: `"${file.name}" oleh Anda, file lokal, via perangkat ini`,
  };
  let p;
  try {
    p = await stage.preload(m);
  } catch (e) {
    URL.revokeObjectURL(url);
    toast('Model GLB ini tidak bisa dibuka. Pastikan file tidak rusak.', true);
    return;
  }
  MODELS.push(m);
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.dataset.act = 'product';
  btn.dataset.id = m.id;
  btn.dataset.cat = m.cat;
  btn.innerHTML = `<img alt="" id="thumb-${m.id}">`;
  btn.append(m.name);
  $('#products').append(btn);
  const active = $('#productCats .is-active')?.dataset.cat;
  btn.hidden = !!active && active !== 'all' && active !== 'custom';
  renderGlbList();
  await setProduct(m.id);
  commit();
  refreshThumb(m);
  if (m.mode === 'uv' && !hasUv(p)) toast(NO_UV, true);
  else toast(`Model "${m.name}" dimuat di browser Anda.`);
}

// One row per uploaded model: its name (editable) and a delete button. Names and the group name
// live only as long as the page, like the files themselves, and are not undo steps.
function renderGlbList() {
  const list = $('#glbList');
  list.replaceChildren();
  for (const m of MODELS.filter((x) => x.custom)) {
    const li = document.createElement('li');
    li.dataset.id = m.id;
    li.innerHTML = `<input type="text" class="sbt-input" maxlength="28" aria-label="Nama model">
      <button type="button" class="sbt-icon-key" data-act="glb-del" title="Hapus model">${icon('trash')}</button>`;
    $('input', li).value = m.name;
    $('button', li).setAttribute('aria-label', `Hapus model ${m.name}`);
    list.append(li);
  }
}

$('#glbList').addEventListener('change', (e) => {
  const m = MODELS.find((x) => x.id === e.target.closest('li').dataset.id);
  if (!m) return;
  const name = e.target.value.trim().slice(0, 28);
  if (name) { // an empty name is refused: the row goes back to the old one
    m.name = name;
    m.credit = `"${name}" oleh Anda, file lokal, via perangkat ini`;
    $(`#products button[data-id="${m.id}"]`).lastChild.textContent = name;
    if (model === m) renderCredit(m);
  }
  // not re-rendered: this fires on blur, and replacing the row would swallow a click on its delete button
  e.target.value = m.name;
  e.target.nextElementSibling.setAttribute('aria-label', `Hapus model ${m.name}`);
});

$('#glbGroup').addEventListener('input', (e) => {
  $('#productCats [data-cat="custom"]').textContent = e.target.value.trim() || 'Milik Saya';
});

ACTIONS['glb-del'] = async (b) => {
  const m = MODELS.find((x) => x.id === b.closest('li').dataset.id);
  if (!m) return;
  const ok = await window.SubtilsUI.confirm({
    title: 'Hapus model ini?',
    message: `"${m.name}" dihapus dari daftar produk. Desain Anda tetap ada.`,
    confirmText: 'Ya, hapus',
    cancelText: 'Batal',
    tone: 'warning',
  });
  if (!ok) return;
  if (model === m) {
    await setProduct(MODELS[0].id);
    if (model === m) return; // could not switch away: keep it rather than leave nothing on stage
    commit();
  }
  MODELS.splice(MODELS.indexOf(m), 1);
  $(`#products button[data-id="${m.id}"]`).remove();
  stage.forget(m.id);
  URL.revokeObjectURL(m.file);
  renderGlbList();
};

$('#glb').addEventListener('change', (e) => {
  const file = e.target.files[0];
  e.target.value = ''; // picking the same file again still fires change
  addCustomGlb(file);
});

// Changing the paste mode or size re-applies to the custom model on stage.
$('#glbMode').addEventListener('change', async (e) => {
  if (!model?.custom || model.mode === e.target.value) return;
  const m = model;
  m.mode = e.target.value;
  stage.forget(m.id);
  await setProduct(m.id);
  commit();
  refreshThumb(m);
  const p = await stage.preload(m);
  if (m.mode === 'uv' && !hasUv(p)) toast(NO_UV, true);
});
$('#glbCm').addEventListener('change', (e) => {
  const cm = Number(e.target.value);
  if (model?.custom && cm > 0) { model.realCm = cm; changed('layers'); }
});

// ---------- dragging the design on the product ----------
let drag = null, downAt = null;

// What is under the pointer: { L, mode } or null. The selected layer's handles win.
function under(e) {
  if (state.pattern.on) return null;
  const p = stage.pick(e.clientX, e.clientY);
  if (!p) return null;
  const S = sel();
  const mode = S?.visible ? lay.grab(S, stage.area, p.X, p.Y, true) : null;
  if (mode) return { L: S, mode, p };
  const L = [...state.layers].reverse().find((l) => l.visible && lay.grab(l, stage.area, p.X, p.Y, false));
  return L ? { L, mode: 'move', p } : null;
}

// capture phase: runs before the orbit controls, so grabbing a design does not also turn the product
frame.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  downAt = { x: e.clientX, y: e.clientY };
  const hit = under(e);
  if (!hit) return;
  if (hit.L.id !== state.selected) {
    state.selected = hit.L.id;
    showTab('desain');
    changed('selected');
  }
  // locked: selecting is all; no drag (it would let go of the layer on release), the camera turns instead
  if (hit.L.locked) { downAt = null; return; }
  drag = { mode: hit.mode, L: hit.L, start: { L: { ...hit.L }, X: hit.p.X, Y: hit.p.Y }, moved: false };
  stage.controls.enabled = false;
  stage.canvas.setPointerCapture(e.pointerId);
}, true);

frame.addEventListener('pointermove', (e) => {
  if (!drag) {
    if (e.buttons === 0) {
      const hit = under(e);
      frame.style.cursor = hit?.L.locked ? '' : { move: 'move', scale: 'nwse-resize', rotate: 'grab' }[hit?.mode] || '';
    }
    return;
  }
  const p = stage.pick(e.clientX, e.clientY);
  if (!p) return; // pointer left the printable surface: wait until it comes back
  const { L, start } = drag, a = stage.area;
  if (drag.mode === 'move') {
    const m = lay.dragMove(start, a, p.X, p.Y);
    L.x = m.x;
    L.y = m.y;
    snap = m.snapX || m.snapY ? { x: m.snapX, y: m.snapY } : null;
  } else if (drag.mode === 'scale') L.size = lay.dragScale(start, a, p.X, p.Y);
  else L.rot = lay.dragRotate(start, a, p.X, p.Y);
  drag.moved = true;
  artDirty = true;
  syncUI();
  stage.requestRender();
});

function endDrag(e) {
  if (drag) {
    stage.controls.enabled = true;
    snap = null;
    artDirty = true;
    stage.requestRender();
    if (drag.moved) commit();
    drag = null;
  } else if (downAt && state.selected && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) < 4) {
    state.selected = null; // a plain click beside the design lets go of it
    changed('selected');
  }
  downAt = null;
}
frame.addEventListener('pointerup', endDrag);
frame.addEventListener('pointercancel', endDrag);

frame.addEventListener('dblclick', (e) => {
  if (under(e)?.L.type !== 'text') return;
  showTab('desain');
  $('#textBox').focus();
});

// ---------- right-click menu on the picture ----------
const ctxMenu = $('#ctxMenu');
let ctxAt = null;   // { x, y } of the last right-click on the bare product, for what the menu adds there
let imageAt = null; // ctxAt handed to the image picker; used or cleared by the next addImages / cancel

frame.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  if (drag) return;
  const hit = under(e);
  ctxAt = null;
  if (hit) {
    state.selected = hit.L.id;
    changed('selected');
    const lock = $('[data-act="layer-lock"]', ctxMenu);
    lock.innerHTML = icon(hit.L.locked ? 'lock-open' : 'lock') + '<span></span>';
    lock.lastChild.textContent = hit.L.locked ? 'Buka kunci posisi' : 'Kunci posisi';
  } else {
    const p = stage.pick(e.clientX, e.clientY), a = stage.area;
    if (p) ctxAt = { x: p.X / a.w, y: 1 - p.Y / a.h }; // inverse of layout.boxOf
  }
  for (const g of $$('[data-ctx]', ctxMenu)) g.hidden = g.dataset.ctx !== (hit ? 'layer' : 'empty');
  if (!ctxMenu.matches(':popover-open')) ctxMenu.showPopover(); // closes itself on Esc or a click outside
  ctxMenu.style.left = Math.max(8, Math.min(e.clientX, innerWidth - ctxMenu.offsetWidth - 8)) + 'px';
  ctxMenu.style.top = Math.max(8, Math.min(e.clientY, innerHeight - ctxMenu.offsetHeight - 8)) + 'px';
  $('[data-ctx]:not([hidden]) button', ctxMenu).focus();
});

// ---------- drop, paste, keyboard ----------
const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
stageEl.addEventListener('dragover', (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  $('#drop').hidden = false;
});
stageEl.addEventListener('dragleave', (e) => {
  if (!stageEl.contains(e.relatedTarget)) $('#drop').hidden = true;
});
stageEl.addEventListener('drop', (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  $('#drop').hidden = true;
  addImages([...e.dataTransfer.files]);
});

document.addEventListener('paste', (e) => {
  const files = [...(e.clipboardData?.files || [])].filter((f) => f.type.startsWith('image/'));
  if (!files.length) return;
  e.preventDefault();
  addImages(files);
});

document.addEventListener('keydown', (e) => {
  const t = e.target;
  // while typing, every key belongs to the text box
  // the open right-click menu keeps its keys too (Esc closes it, it must not also let go of the layer)
  if (t.matches('textarea, select, input[type=text]') || t.closest('#ctxMenu') || $('#help').open || $('#credits').open) return;
  const ctrl = e.ctrlKey || e.metaKey, key = e.key.toLowerCase();
  if (ctrl && key === 'z') { e.preventDefault(); travel(e.shiftKey ? 1 : -1); return; }
  if (ctrl && key === 'y') { e.preventDefault(); travel(1); return; }
  const L = sel();
  if (!L || t.matches('input')) return; // sliders and checkboxes keep their own arrow keys
  if (ctrl && key === 'd') { e.preventDefault(); ACTIONS['layer-dup'](); return; }
  if (key === 'delete' || key === 'backspace') { e.preventDefault(); removeLayer(L.id); return; }
  if (key === 'escape') { state.selected = null; changed('selected'); return; }
  const step = e.shiftKey ? 0.02 : 0.004;
  const move = { arrowleft: [-step, 0], arrowright: [step, 0], arrowup: [0, step], arrowdown: [0, -step] }[key];
  if (!move) return;
  e.preventDefault();
  if (L.locked) return;
  withLayer((l) => {
    l.x = stage.area.wrap ? mod1(l.x + move[0]) : Math.min(1, Math.max(0, l.x + move[0]));
    l.y = Math.min(1, Math.max(0, l.y + move[1]));
  });
});

// ---------- start ----------
function syncSliderVisual(el) {
  const shell = el.closest('.sbt-slider-shell');
  if (!shell) return;
  const min = parseFloat(el.min || '0'), max = parseFloat(el.max || '100'), val = parseFloat(el.value || '0');
  const pct = max > min ? Math.max(0, Math.min(100, ((val - min) / (max - min)) * 100)) : 0;
  shell.querySelector('.sbt-slider-fill').style.width = pct + '%';
  shell.querySelector('.sbt-slider-knob').style.left = pct + '%';
}

function upgradeSliders() {
  for (const el of $$('input[type="range"]')) {
    if (el.closest('.sbt-slider-shell')) continue;
    const shell = document.createElement('div');
    shell.className = 'sbt-slider-shell';
    el.classList.add('sbt-range-input');
    el.replaceWith(shell);
    shell.append(el);
    shell.insertAdjacentHTML('beforeend', '<div class="sbt-slider-groove"><div class="sbt-slider-fill"></div></div><div class="sbt-slider-knob"></div>');
  }
}

function buildLists() {
  $('#products').innerHTML = MODELS.map((m) => `<button type="button" data-act="product" data-id="${m.id}" data-cat="${m.cat}"><img alt="" id="thumb-${m.id}">${m.name}</button>`).join('');
  const swatches = (path, list) => list.map((c) => `<button type="button" data-swatch="${path}" data-v="${c}" style="background:${c}" title="${c}" aria-label="Warna ${c}"></button>`).join('');
  $('#bodySwatches').innerHTML = swatches('colors.body', SWATCHES);
  $('#bgSwatches').innerHTML = swatches('scene.bg1', BG_SWATCHES);
  initColorPicker({ get, set, changed, commit, resolveDef: (btn) => btn.dataset.def });
  $('#finishes').innerHTML = Object.entries(FINISHES).map(([id, f]) => `<button type="button" data-v="${id}">${f.label}</button>`).join('');
  $('#textures').innerHTML = Object.entries(TEXTURES).map(([id, t]) => `<button type="button" data-v="${id}">${t.label}</button>`).join('');
  $('#envs').innerHTML = Object.entries(ENVS).map(([id, e]) => `<button type="button" data-v="${id}">${e.label}</button>`).join('');
  $('#fonts').innerHTML = FONTS.map((f) => `<option value="${f.name}" style="font-family:'${f.name}'">${f.label} (${f.name})</option>`).join('');
}

async function start() {
  buildLists();
  upgradeSliders();
  layoutFrame();
  applyScene();
  await document.fonts.load('800 20px "Plus Jakarta Sans"').catch(() => {}); // the sample art uses it
  await setProduct(state.product);
  if (!model) return;
  await addSample();
  hist.list = [snapshot()];
  changed('layers');
  document.body.dataset.ready = '1';
  $('#startup').remove();
  // pictures for the product list, once the first product is on screen
  stage.thumbnails(MODELS).then((urls) => {
    for (const [id, url] of Object.entries(urls)) $('#thumb-' + id).src = url;
  }, () => {});
}
if (!('closedBy' in HTMLDialogElement.prototype)) {
  const outside = (e, d) => {
    const r = d.getBoundingClientRect();
    return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
  };
  for (const d of document.querySelectorAll('dialog[closedby="any"]')) {
    let pressed = false;
    d.addEventListener('pointerdown', (e) => { pressed = outside(e, d); });
    d.addEventListener('pointerup', (e) => { if (pressed && outside(e, d)) d.close(); });
  }
}

start();
