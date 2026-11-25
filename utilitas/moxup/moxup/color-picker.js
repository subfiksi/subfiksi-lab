// Subtils-UI custom HSV/Hue color picker popover shared across all MOXUP color controls.

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

/** Normalize `#rgb` or `#rrggbb` to uppercase `#RRGGBB`, or return null if invalid. */
export function normHex(raw) {
  if (typeof raw !== 'string') return null;
  const s = raw.trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(s)) return '#' + [...s].map((c) => c + c).join('').toUpperCase();
  if (/^[0-9a-f]{6}$/i.test(s)) return '#' + s.toUpperCase();
  return null;
}

/** Convert `#RRGGBB` to `{ h: 0..360, s: 0..1, v: 0..1 }`. */
export function hexToHsv(hex) {
  const n = normHex(hex) || '#FFFFFF';
  const r = parseInt(n.slice(1, 3), 16) / 255;
  const g = parseInt(n.slice(3, 5), 16) / 255;
  const b = parseInt(n.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d > 1e-6) {
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
    else if (max === g) h = ((b - r) / d + 2) * 60;
    else h = ((r - g) / d + 4) * 60;
  }
  return { h, s: max > 0 ? d / max : 0, v: max };
}

/** Convert `{ h: 0..360, s: 0..1, v: 0..1 }` to `#RRGGBB`. */
export function hsvToHex(h, s, v) {
  const hh = ((h % 360) + 360) % 360;
  const c = v * s, x = c * (1 - Math.abs(((hh / 60) % 2) - 1)), m = v - c;
  let r = 0, g = 0, b = 0;
  if (hh < 60) [r, g, b] = [c, x, 0];
  else if (hh < 120) [r, g, b] = [x, c, 0];
  else if (hh < 180) [r, g, b] = [0, c, x];
  else if (hh < 240) [r, g, b] = [0, x, c];
  else if (hh < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const byte = (u) => Math.round(clamp(u + m, 0, 1) * 255).toString(16).padStart(2, '0');
  return `#${byte(r)}${byte(g)}${byte(b)}`.toUpperCase();
}

let canDisplayTrans;
function canTransitionDisplay() {
  if (canDisplayTrans !== undefined) return canDisplayTrans;
  if (!window.CSS?.supports?.('transition-behavior', 'allow-discrete') || !document.body) return false;
  const p = document.createElement('div');
  p.style.cssText = 'transition: display 1s allow-discrete !important; display: block;';
  document.body.appendChild(p);
  getComputedStyle(p).display;
  p.style.display = 'none';
  canDisplayTrans = getComputedStyle(p).display === 'block';
  p.remove();
  return canDisplayTrans;
}

const supportsTopLayerExit = () => window.CSS?.supports?.('overlay', 'auto') && canTransitionDisplay();

async function closePopoverAnimated(pop) {
  if (!pop.matches(':popover-open')) return;
  if (!supportsTopLayerExit()) {
    pop.setAttribute('data-closing', '');
    const anims = pop.getAnimations({ subtree: true });
    if (anims.length) await Promise.race([Promise.allSettled(anims.map((a) => a.finished)), new Promise((r) => setTimeout(r, 300))]);
    if (!pop.hasAttribute('data-closing')) return;
    pop.removeAttribute('data-closing');
  }
  pop.hidePopover();
}

/** Populate each `[data-color]` trigger button with its live swatch chip and hex code. */
export function syncColorButtons(getVal, resolveDef) {
  for (const btn of document.querySelectorAll('[data-color]')) {
    if (!btn.firstElementChild) {
      btn.innerHTML = '<span class="mox-color-chip"></span><span class="mox-color-hex"></span><span class="mox-color-spectrum" aria-hidden="true"></span>';
    }
    const raw = getVal(btn.dataset.color) ?? resolveDef?.(btn);
    const hex = normHex(raw) || '#FFFFFF';
    btn.style.setProperty('--mox-btn-color', hex);
    btn.querySelector('.mox-color-hex').textContent = hex;
    btn.setAttribute('aria-label', `${btn.dataset.title || 'Pilih warna'}: ${hex}`);
  }
}

/** Wire `#colorPop` (`popover="auto"`) to all `[data-color]` buttons. */
export function initColorPicker({ get, set, changed, commit, resolveDef }) {
  const pop = document.getElementById('colorPop');
  if (!pop) return;
  const sv = document.getElementById('cpSv');
  const svThumb = document.getElementById('cpSvThumb');
  const hueBar = document.getElementById('cpHue');
  const hueThumb = document.getElementById('cpHueThumb');
  const hexEl = document.getElementById('cpHex');
  const preview = document.getElementById('cpPreview');
  const led = document.getElementById('cpLed');
  const titleEl = document.getElementById('cpTitle');
  const metaEl = document.getElementById('cpMeta');
  const eyeBtn = document.getElementById('cpEye');
  const resetBtn = document.getElementById('cpReset');
  const closeBtn = document.getElementById('cpClose');

  if (!('EyeDropper' in window)) eyeBtn.hidden = true;

  let activeBtn = null;
  let activePath = null;
  let suppressBtn = null;
  let hsv = { h: 215, s: 0.77, v: 0.33 };

  function setFromHex(hex) {
    const next = hexToHsv(hex);
    if (next.s > 0.001) hsv.h = next.h;
    hsv.s = next.s;
    hsv.v = next.v;
    return next;
  }

  function paintControls(hex) {
    const pureHue = hsvToHex(hsv.h, 1, 1);
    sv.style.setProperty('--cp-hue', pureHue);
    svThumb.style.left = (hsv.s * 100) + '%';
    svThumb.style.top = ((1 - hsv.v) * 100) + '%';
    svThumb.style.backgroundColor = hex;
    hueThumb.style.left = ((hsv.h / 360) * 100) + '%';
    hueThumb.style.backgroundColor = pureHue;
    preview.style.backgroundColor = hex;
    led.style.backgroundColor = hex;
    metaEl.textContent = `${Math.round(hsv.h)}° · ${Math.round(hsv.s * 100)}% · ${Math.round(hsv.v * 100)}%`;
    hueBar.setAttribute('aria-valuenow', String(Math.round(hsv.h)));
    sv.setAttribute('aria-valuetext', `${Math.round(hsv.s * 100)}% saturasi, ${Math.round(hsv.v * 100)}% kecerahan`);
    if (document.activeElement !== hexEl) hexEl.value = hex;
  }

  function applyHsv(doCommit = false) {
    if (!activePath) return;
    const hex = hsvToHex(hsv.h, hsv.s, hsv.v);
    paintControls(hex);
    set(activePath, hex);
    changed(activePath);
    if (doCommit) commit();
  }

  function placeFallback(btn) {
    if (window.CSS?.supports?.('position-area: block-end')) {
      pop.style.left = '';
      pop.style.top = '';
      return;
    }
    const r = btn.getBoundingClientRect();
    const w = pop.offsetWidth || 268;
    const h = pop.offsetHeight || 310;
    const left = clamp(r.right + 12 + w <= window.innerWidth - 12 ? r.right + 12 : r.left - w - 12, 12, window.innerWidth - w - 12);
    const top = clamp(r.top, 12, window.innerHeight - h - 12);
    pop.style.left = left + 'px';
    pop.style.top = top + 'px';
  }

  function clearAnchor() {
    if (activeBtn) {
      activeBtn.style.anchorName = '';
      activeBtn.removeAttribute('aria-expanded');
    }
    activeBtn = null;
    activePath = null;
  }

  function openFor(btn) {
    if (activeBtn === btn && pop.matches(':popover-open')) {
      closePopoverAnimated(pop);
      return;
    }
    clearAnchor();
    activeBtn = btn;
    activePath = btn.dataset.color;
    btn.style.anchorName = '--mox-cp-anchor';
    btn.setAttribute('aria-expanded', 'true');
    const cur = normHex(get(activePath) ?? resolveDef?.(btn)) || '#FFFFFF';
    setFromHex(cur);
    titleEl.textContent = btn.dataset.title || 'Pilih Warna';
    resetBtn.hidden = !resolveDef?.(btn);
    paintControls(cur);
    pop.removeAttribute('data-closing');
    try { pop.showPopover({ source: btn }); } catch { pop.showPopover(); }
    placeFallback(btn);
  }

  document.addEventListener('pointerdown', (e) => {
    const btn = e.target.closest('[data-color]');
    suppressBtn = btn && btn === activeBtn && pop.matches(':popover-open') ? btn : null;
  }, true);

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-color]');
    if (!btn) { suppressBtn = null; return; }
    if (btn === suppressBtn) { suppressBtn = null; return; }
    suppressBtn = null;
    openFor(btn);
  });

  pop.addEventListener('toggle', (e) => {
    if (e.newState === 'closed') clearAnchor();
  });

  closeBtn.addEventListener('click', () => closePopoverAnimated(pop));

  function bindDrag(pad, onMove) {
    let dragging = false;
    const update = (e) => {
      const r = pad.getBoundingClientRect();
      const x = clamp((e.clientX - r.left) / Math.max(1, r.width), 0, 1);
      const y = clamp((e.clientY - r.top) / Math.max(1, r.height), 0, 1);
      onMove(x, y);
      applyHsv(false);
    };
    pad.addEventListener('pointerdown', (e) => {
      dragging = true;
      pad.setPointerCapture(e.pointerId);
      pad.focus();
      update(e);
    });
    pad.addEventListener('pointermove', (e) => { if (dragging) update(e); });
    const stop = (e) => {
      if (!dragging) return;
      dragging = false;
      if (pad.hasPointerCapture?.(e.pointerId)) pad.releasePointerCapture(e.pointerId);
      commit();
    };
    pad.addEventListener('pointerup', stop);
    pad.addEventListener('pointercancel', stop);
  }

  bindDrag(sv, (x, y) => { hsv.s = x; hsv.v = 1 - y; });
  bindDrag(hueBar, (x) => { hsv.h = x * 359.99; });

  sv.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 0.08 : 0.02;
    let hit = true;
    if (e.key === 'ArrowLeft') hsv.s = clamp(hsv.s - step, 0, 1);
    else if (e.key === 'ArrowRight') hsv.s = clamp(hsv.s + step, 0, 1);
    else if (e.key === 'ArrowUp') hsv.v = clamp(hsv.v + step, 0, 1);
    else if (e.key === 'ArrowDown') hsv.v = clamp(hsv.v - step, 0, 1);
    else hit = false;
    if (!hit) return;
    e.preventDefault();
    applyHsv(true);
  });

  hueBar.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 15 : 3;
    let hit = true;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') hsv.h = (hsv.h - step + 360) % 360;
    else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') hsv.h = (hsv.h + step) % 360;
    else hit = false;
    if (!hit) return;
    e.preventDefault();
    applyHsv(true);
  });

  hexEl.addEventListener('input', () => {
    const hex = normHex(hexEl.value);
    if (!hex || !activePath) return;
    setFromHex(hex);
    paintControls(hex);
    set(activePath, hex);
    changed(activePath);
  });
  hexEl.addEventListener('change', () => {
    if (!activePath) return;
    const hex = normHex(hexEl.value) || normHex(get(activePath)) || '#FFFFFF';
    hexEl.value = hex;
    commit();
  });

  eyeBtn.addEventListener('click', async () => {
    if (!activePath || !('EyeDropper' in window)) return;
    try {
      const { sRGBHex } = await new window.EyeDropper().open();
      const hex = normHex(sRGBHex);
      if (!hex) return;
      setFromHex(hex);
      paintControls(hex);
      set(activePath, hex);
      changed(activePath);
      commit();
    } catch {}
  });

  resetBtn.addEventListener('click', () => {
    if (!activeBtn || !activePath) return;
    const def = normHex(resolveDef?.(activeBtn));
    if (!def) return;
    setFromHex(def);
    paintControls(def);
    set(activePath, def);
    changed(activePath);
    commit();
  });
}
