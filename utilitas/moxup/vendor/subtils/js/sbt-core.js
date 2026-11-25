/* ==========================================================================
   SUBTILS UI KIT — VANILLA JS CONTROLLER (`@subfiksi/subtils-ui` v0.1.0)
   Zero-dependency controller for Light Ceramic & Volumetric Obsidian widgets.
   Safe for offline `file://` preview & Google Apps Script HtmlService.
   ========================================================================== */
(function (global) {
  function uid(prefix) {
    return (prefix || 'sbt') + '-' + Math.random().toString(36).slice(2, 8);
  }

  /* 1. Single & Ticked Slider Binding */
  function initSliders(root) {
    (root || document).querySelectorAll('[data-sbt-slider]').forEach(function (wrap) {
      if (wrap.dataset.sbtBound) return;
      wrap.dataset.sbtBound = '1';
      const input = wrap.querySelector('input[type="range"]');
      const fill = wrap.querySelector('.sbt-slider-fill');
      const knob = wrap.querySelector('.sbt-slider-knob');
      const out = wrap.dataset.sbtOut ? document.querySelector(wrap.dataset.sbtOut) : wrap.querySelector('[data-sbt-readout]');
      const unit = wrap.dataset.sbtUnit || '';
      if (!input || !fill || !knob) return;

      function sync() {
        const min = parseFloat(input.min || '0');
        const max = parseFloat(input.max || '100');
        const val = parseFloat(input.value || '0');
        const pct = max > min ? ((val - min) / (max - min)) * 100 : 0;
        fill.style.width = pct + '%';
        knob.style.left = pct + '%';
        if (out) out.textContent = val + unit;
      }

      input.addEventListener('input', sync);
      sync();
    });
  }

  /* 2. Dual-Thumb Range Slider with Obsidian Bubbles */
  function initDualRanges(root) {
    (root || document).querySelectorAll('[data-sbt-dual-range]').forEach(function (wrap) {
      if (wrap.dataset.sbtBound) return;
      wrap.dataset.sbtBound = '1';
      const minIn = wrap.querySelector('[data-sbt-dual-min]');
      const maxIn = wrap.querySelector('[data-sbt-dual-max]');
      const fill = wrap.querySelector('.sbt-slider-fill');
      const kMin = wrap.querySelector('[data-sbt-knob-min]');
      const kMax = wrap.querySelector('[data-sbt-knob-max]');
      const bMin = wrap.querySelector('[data-sbt-bubble-min]');
      const bMax = wrap.querySelector('[data-sbt-bubble-max]');
      const eqBars = wrap.querySelectorAll('.sbt-eq-bar');
      if (!minIn || !maxIn || !fill) return;

      const minGap = parseFloat(wrap.dataset.sbtGap || '1');
      const lo = parseFloat(minIn.min || '0');
      const hi = parseFloat(minIn.max || '10');

      function sync(source) {
        let a = parseFloat(minIn.value);
        let b = parseFloat(maxIn.value);
        if (b - a < minGap) {
          if (source === minIn) {
            a = b - minGap;
            minIn.value = a;
          } else {
            b = a + minGap;
            maxIn.value = b;
          }
        }
        const p1 = ((a - lo) / (hi - lo)) * 100;
        const p2 = ((b - lo) / (hi - lo)) * 100;
        fill.style.left = p1 + '%';
        fill.style.width = Math.max(0, p2 - p1) + '%';
        if (kMin) kMin.style.left = p1 + '%';
        if (kMax) kMax.style.left = p2 + '%';
        if (bMin) { bMin.style.left = p1 + '%'; bMin.textContent = a; }
        if (bMax) { bMax.style.left = p2 + '%'; bMax.textContent = b; }

        if (eqBars.length) {
          eqBars.forEach(function (bar, i) {
            const pct = (i / Math.max(1, eqBars.length - 1)) * 100;
            bar.classList.toggle('is-in-range', pct >= p1 && pct <= p2);
          });
        }
        wrap.dispatchEvent(new CustomEvent('sbt:rangechange', { detail: { min: a, max: b } }));
      }

      minIn.addEventListener('input', function () { sync(minIn); });
      maxIn.addEventListener('input', function () { sync(maxIn); });
      sync();
    });
  }

  /* 3. Custom Borderless Select Dropdowns */
  function closeAllSelects(except) {
    document.querySelectorAll('.sbt-select.is-open').forEach(function (sel) {
      if (sel !== except) sel.classList.remove('is-open');
    });
  }

  function initSelects(root) {
    (root || document).querySelectorAll('[data-sbt-select]').forEach(function (sel) {
      if (sel.dataset.sbtBound) return;
      sel.dataset.sbtBound = '1';
      const trigger = sel.querySelector('.sbt-select-trigger');
      const label = sel.querySelector('[data-sbt-select-label]');
      const hidden = sel.querySelector('input[type="hidden"]');
      const opts = sel.querySelectorAll('.sbt-select-option');
      if (!trigger) return;

      trigger.addEventListener('click', function (e) {
        e.stopPropagation();
        const willOpen = !sel.classList.contains('is-open');
        closeAllSelects(sel);
        sel.classList.toggle('is-open', willOpen);
        trigger.setAttribute('aria-expanded', String(willOpen));
      });

      opts.forEach(function (opt) {
        opt.addEventListener('click', function () {
          opts.forEach(function (o) { o.classList.remove('is-selected'); });
          opt.classList.add('is-selected');
          const val = opt.dataset.value !== undefined ? opt.dataset.value : opt.textContent.trim();
          const text = opt.dataset.label || opt.textContent.trim();
          if (label) label.textContent = text;
          if (hidden) hidden.value = val;
          sel.dataset.value = val;
          sel.classList.remove('is-open');
          trigger.setAttribute('aria-expanded', 'false');
          sel.dispatchEvent(new CustomEvent('sbt:change', { detail: { value: val, label: text } }));
        });
      });
    });

    if (!document.body.dataset.sbtSelectDocBound) {
      document.body.dataset.sbtSelectDocBound = '1';
      document.addEventListener('click', function () { closeAllSelects(null); });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') closeAllSelects(null);
      });
    }
  }

  /* 4. Checkboxes, Switches, Segmented Tabs & Pagers */
  function initToggles(root) {
    (root || document).querySelectorAll('[data-sbt-check]').forEach(function (btn) {
      if (btn.dataset.sbtBound) return;
      btn.dataset.sbtBound = '1';
      btn.addEventListener('click', function () {
        const active = btn.classList.toggle('is-active');
        btn.setAttribute('aria-checked', String(active));
        btn.dispatchEvent(new CustomEvent('sbt:toggle', { detail: { checked: active } }));
      });
    });

    (root || document).querySelectorAll('[data-sbt-switch]').forEach(function (sw) {
      if (sw.dataset.sbtBound) return;
      sw.dataset.sbtBound = '1';
      sw.addEventListener('click', function () {
        const active = sw.classList.toggle('is-active');
        sw.setAttribute('aria-pressed', String(active));
        sw.dispatchEvent(new CustomEvent('sbt:switch', { detail: { active: active } }));
      });
    });

    (root || document).querySelectorAll('[data-sbt-segmented]').forEach(function (seg) {
      if (seg.dataset.sbtBound) return;
      seg.dataset.sbtBound = '1';
      const items = seg.querySelectorAll('.sbt-seg-btn, .sbt-view-btn');
      items.forEach(function (item) {
        item.addEventListener('click', function () {
          items.forEach(function (it) { it.classList.remove('is-active'); });
          item.classList.add('is-active');
          seg.dispatchEvent(new CustomEvent('sbt:tab', { detail: { value: item.dataset.value || item.textContent.trim() } }));
        });
      });
    });
  }

  /* 5. Soft-3D Radial Obsidian Gauge Renderer (SVG) */
  function renderGauge(el, opts) {
    const target = typeof el === 'string' ? document.querySelector(el) : el;
    if (!target) return;
    const min = opts.min !== undefined ? opts.min : 0;
    const max = opts.max !== undefined ? opts.max : 32;
    const val = Math.min(max, Math.max(min, opts.value !== undefined ? opts.value : 18));
    const ratio = max > min ? (val - min) / (max - min) : 0;
    const id = uid('gauge');

    const cx = 110, cy = 104, r = 74;
    const startAng = Math.PI;
    const endAng = 0;
    const valAng = Math.PI * (1 - ratio);

    function pt(ang, rad) {
      return {
        x: cx + Math.cos(ang) * rad,
        y: cy - Math.sin(ang) * rad
      };
    }

    const pStart = pt(startAng, r);
    const pEnd = pt(endAng, r);
    const pVal = pt(valAng, r);
    const tip = pt(valAng, r + 6);
    const baseL = pt(valAng + Math.PI / 2, 5.5);
    const baseR = pt(valAng - Math.PI / 2, 5.5);

    const trackPath = 'M ' + pStart.x.toFixed(1) + ' ' + pStart.y.toFixed(1) +
      ' A ' + r + ' ' + r + ' 0 1 1 ' + pEnd.x.toFixed(1) + ' ' + pEnd.y.toFixed(1);
    const arcPath = ratio <= 0.001
      ? ''
      : 'M ' + pStart.x.toFixed(1) + ' ' + pStart.y.toFixed(1) +
        ' A ' + r + ' ' + r + ' 0 0 1 ' + pVal.x.toFixed(1) + ' ' + pVal.y.toFixed(1);

    const needlePts = baseL.x.toFixed(1) + ',' + baseL.y.toFixed(1) + ' ' +
      tip.x.toFixed(1) + ',' + tip.y.toFixed(1) + ' ' +
      baseR.x.toFixed(1) + ',' + baseR.y.toFixed(1);

    target.innerHTML =
      '<div class="sbt-gauge-wrap">' +
        '<svg class="sbt-gauge-svg" viewBox="0 0 220 124" aria-hidden="true">' +
          '<defs>' +
            '<linearGradient id="' + id + '-arc" x1="0%" y1="100%" x2="100%" y2="0%">' +
              '<stop offset="0%" stop-color="#14161B"/>' +
              '<stop offset="55%" stop-color="#2E323D"/>' +
              '<stop offset="100%" stop-color="#181A20"/>' +
            '</linearGradient>' +
            '<filter id="' + id + '-shadow" x="-30%" y="-30%" width="160%" height="160%">' +
              '<feDropShadow dx="2" dy="6" stdDeviation="4" flood-color="#14171F" flood-opacity="0.22"/>' +
            '</filter>' +
          '</defs>' +
          '<path d="' + trackPath + '" fill="none" stroke="var(--sbt-bg-slot)" stroke-width="34" stroke-linecap="butt"/>' +
          (arcPath ? '<path d="' + arcPath + '" fill="none" stroke="url(#' + id + '-arc)" stroke-width="34" stroke-linecap="butt" filter="url(#' + id + '-shadow)"/>' : '') +
          '<polygon points="' + needlePts + '" fill="var(--sbt-obsidian-mid)" filter="url(#' + id + '-shadow)"/>' +
          '<circle cx="' + cx + '" cy="' + cy + '" r="6" fill="var(--sbt-obsidian-top)"/>' +
          (opts.suborenDot ? '<circle cx="' + cx + '" cy="' + cy + '" r="2.2" fill="var(--sbt-suboren)"/>' : '') +
        '</svg>' +
        '<div class="sbt-gauge-scale">' +
          '<span>' + min + '</span>' +
          '<span class="sbt-gauge-val">' + val + (opts.suffix || '') + '</span>' +
          '<span>' + max + '</span>' +
        '</div>' +
      '</div>';
  }

  /* 6. Smooth Area Trend Chart Renderer (SVG) */
  function renderAreaChart(el, points, secondaryPoints) {
    const target = typeof el === 'string' ? document.querySelector(el) : el;
    if (!target || !points || points.length < 2) return;
    const id = uid('trend');
    const w = 320, h = 100, padY = 12;
    const maxV = Math.max.apply(null, points.concat(secondaryPoints || [1]));

    function buildCurve(vals) {
      const coords = vals.map(function (v, i) {
        const x = (i / (vals.length - 1)) * w;
        const y = h - 4 - ((v / (maxV || 1)) * (h - padY - 8));
        return { x: x, y: y };
      });
      let d = 'M ' + coords[0].x.toFixed(1) + ' ' + coords[0].y.toFixed(1);
      for (let i = 0; i < coords.length - 1; i++) {
        const xc = (coords[i].x + coords[i + 1].x) / 2;
        const yc = (coords[i].y + coords[i + 1].y) / 2;
        d += ' Q ' + coords[i].x.toFixed(1) + ' ' + coords[i].y.toFixed(1) + ' ' + xc.toFixed(1) + ' ' + yc.toFixed(1);
      }
      const last = coords[coords.length - 1];
      d += ' L ' + last.x.toFixed(1) + ' ' + last.y.toFixed(1);
      return d + ' L ' + w + ' ' + h + ' L 0 ' + h + ' Z';
    }

    const secHtml = secondaryPoints
      ? '<path d="' + buildCurve(secondaryPoints) + '" fill="var(--sbt-bg-slot)"/>'
      : '';

    target.innerHTML =
      '<svg class="sbt-trend-svg" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none" aria-hidden="true">' +
        '<defs>' +
          '<linearGradient id="' + id + '-fill" x1="0" y1="0" x2="0" y2="1">' +
            '<stop offset="0%" stop-color="#3C414E"/>' +
            '<stop offset="100%" stop-color="#14161A"/>' +
          '</linearGradient>' +
        '</defs>' +
        secHtml +
        '<path d="' + buildCurve(points) + '" fill="url(#' + id + '-fill)"/>' +
      '</svg>';
  }

  /* 7. In-Place Action Feedback Helper (No Floating Toast Slop) */
  function flashButton(btn, tempText, durationMs, accentClass) {
    if (!btn) return;
    const textSpan = btn.querySelector('[data-sbt-btn-text]');
    const iconSpan = !textSpan ? btn.querySelector('[data-sbt-icon]') : null;
    if (!textSpan && iconSpan && global.SubtilsIcons) {
      const origHtml = btn.dataset.sbtOrigIconHtml || iconSpan.innerHTML;
      const origActive = btn.dataset.sbtOrigActive !== undefined ? (btn.dataset.sbtOrigActive === '1') : btn.classList.contains('is-active');
      btn.dataset.sbtOrigIconHtml = origHtml;
      btn.dataset.sbtOrigActive = origActive ? '1' : '0';
      iconSpan.innerHTML = global.SubtilsIcons.svg('check');
      btn.classList.add('is-active');
      clearTimeout(btn._sbtFlashTimer);
      btn._sbtFlashTimer = setTimeout(function () {
        iconSpan.innerHTML = origHtml;
        btn.classList.toggle('is-active', origActive);
      }, durationMs || 900);
      return;
    }
    const span = textSpan || btn;
    const orig = btn.dataset.sbtOrigText || span.textContent;
    btn.dataset.sbtOrigText = orig;
    span.textContent = tempText;
    if (accentClass) span.classList.add(accentClass);
    clearTimeout(btn._sbtFlashTimer);
    btn._sbtFlashTimer = setTimeout(function () {
      span.textContent = orig;
      if (accentClass) span.classList.remove(accentClass);
    }, durationMs || 1600);
  }

  /* 8. Physical Stacked Card Deck Swap */
  function initStackDecks(root) {
    (root || document).querySelectorAll('[data-sbt-stack-deck]').forEach(function (deck) {
      if (deck.dataset.sbtBound) return;
      deck.dataset.sbtBound = '1';
      const cards = Array.from(deck.querySelectorAll('.sbt-stack-card'));
      if (cards.length < 2) return;
      let active = 0;
      let busy = false;

      function applyPositions(skipIdx) {
        const n = cards.length;
        cards.forEach(function (card, idx) {
          if (idx === skipIdx) return;
          const rel = (idx - active + n) % n;
          card.setAttribute('data-stack-pos', rel <= 2 ? String(rel) : 'hidden');
        });
      }

      function step(dir) {
        if (busy) return;
        const n = cards.length;
        const oldIdx = active;
        const nextIdx = (active + dir + n) % n;
        busy = true;

        if (dir > 0) {
          const exiting = cards[oldIdx];
          exiting.classList.add('is-exiting-up');
          active = nextIdx;
          applyPositions(oldIdx);
          setTimeout(function () {
            exiting.classList.remove('is-exiting-up');
            applyPositions(-1);
            busy = false;
          }, 260);
        } else {
          const incoming = cards[nextIdx];
          incoming.classList.add('is-entering-top');
          void incoming.offsetWidth;
          active = nextIdx;
          requestAnimationFrame(function () {
            incoming.classList.remove('is-entering-top');
            applyPositions(-1);
            setTimeout(function () { busy = false; }, 280);
          });
        }
        deck.dispatchEvent(new CustomEvent('sbt:stackchange', { detail: { index: active, card: cards[active] } }));
      }

      deck.addEventListener('click', function (e) {
        if (e.target.closest('[data-stack-prev]')) step(-1);
        else if (e.target.closest('[data-stack-next]')) step(1);
      });

      applyPositions(-1);
    });
  }

  /* 9. Modal Controller */
  function openModal(selectorOrEl) {
    const el = typeof selectorOrEl === 'string' ? document.querySelector(selectorOrEl) : selectorOrEl;
    if (el) el.classList.add('is-open');
  }

  function closeModal(selectorOrEl) {
    const el = typeof selectorOrEl === 'string' ? document.querySelector(selectorOrEl) : selectorOrEl;
    if (el) el.classList.remove('is-open');
  }

  /* 9b. Tactile Promise Confirm Dialog (Zero Native confirm()) */
  let activeConfirmResolve = null;

  function ensureConfirmDialog() {
    let bd = document.getElementById('sbtConfirmDialog');
    if (bd) return bd;
    bd = document.createElement('div');
    bd.id = 'sbtConfirmDialog';
    bd.className = 'sbt-modal-backdrop';
    bd.setAttribute('role', 'alertdialog');
    bd.setAttribute('aria-modal', 'true');
    bd.setAttribute('aria-labelledby', 'sbtConfirmTitle');
    bd.innerHTML =
      '<div class="sbt-modal-sheet sbt-confirm-sheet">' +
        '<div class="sbt-modal-head">' +
          '<div style="display:flex; align-items:center; gap:10px;">' +
            '<span class="sbt-confirm-icon" id="sbtConfirmIcon"></span>' +
            '<h3 id="sbtConfirmTitle" class="sbt-heading" style="font-size:17px;">Konfirmasi</h3>' +
          '</div>' +
          '<button type="button" class="sbt-icon-key is-obsidian" data-sbt-confirm-cancel aria-label="Tutup"></button>' +
        '</div>' +
        '<div class="sbt-confirm-body" id="sbtConfirmMessage"></div>' +
        '<div class="sbt-modal-foot">' +
          '<button type="button" class="sbt-btn-ceramic sbt-btn--sm" data-sbt-confirm-cancel id="sbtConfirmCancelBtn">Batal</button>' +
          '<button type="button" class="sbt-btn-obsidian sbt-btn--sm" id="sbtConfirmOkBtn">' +
            '<span class="sbt-led" id="sbtConfirmLed"></span>' +
            '<span id="sbtConfirmOkLabel">Lanjutkan</span>' +
          '</button>' +
        '</div>' +
      '</div>';

    const finish = function (val) {
      bd.classList.remove('is-open');
      if (activeConfirmResolve) {
        const res = activeConfirmResolve;
        activeConfirmResolve = null;
        res(val);
      }
    };

    bd.addEventListener('click', function (e) {
      if (e.target === bd || e.target.closest('[data-sbt-confirm-cancel]')) finish(false);
    });
    bd.querySelector('#sbtConfirmOkBtn').addEventListener('click', function () {
      finish(true);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && bd.classList.contains('is-open')) finish(false);
    });

    const host = document.querySelector('.sbt-root') || document.body;
    host.appendChild(bd);
    return bd;
  }

  function confirmDialog(opts) {
    const cfg = typeof opts === 'string' ? { message: opts } : (opts || {});
    if (activeConfirmResolve) {
      const prev = activeConfirmResolve;
      activeConfirmResolve = null;
      prev(false);
    }
    const bd = ensureConfirmDialog();
    const titleEl = bd.querySelector('#sbtConfirmTitle');
    const msgEl = bd.querySelector('#sbtConfirmMessage');
    const okLabel = bd.querySelector('#sbtConfirmOkLabel');
    const cancelBtn = bd.querySelector('#sbtConfirmCancelBtn');
    const iconEl = bd.querySelector('#sbtConfirmIcon');
    const closeEl = bd.querySelector('[data-sbt-confirm-cancel]');
    const ledEl = bd.querySelector('#sbtConfirmLed');

    titleEl.textContent = cfg.title || 'Konfirmasi Aksi';
    msgEl.textContent = cfg.message || '';
    okLabel.textContent = cfg.confirmText || cfg.confirmLabel || 'Lanjutkan';
    cancelBtn.textContent = cfg.cancelText || cfg.cancelLabel || 'Batal';

    const isWarning = cfg.tone !== 'info';
    iconEl.classList.toggle('is-info', !isWarning);
    ledEl.classList.toggle('is-suboren', isWarning || !!cfg.suborenDot);

    if (global.SubtilsIcons) {
      iconEl.innerHTML = '<span class="sbt-icon sbt-icon--md">' + global.SubtilsIcons.svg(isWarning ? 'warning-circle' : 'info') + '</span>';
      closeEl.innerHTML = '<span class="sbt-icon sbt-icon--sm sbt-icon-glow-white">' + global.SubtilsIcons.svg('x') + '</span>';
    }

    bd.classList.add('is-open');
    const cancelFocus = bd.querySelector('#sbtConfirmCancelBtn');
    if (cancelFocus) requestAnimationFrame(function () { cancelFocus.focus(); });

    return new Promise(function (resolve) {
      activeConfirmResolve = resolve;
    });
  }

  /* 9c. Inline Status Banner Helper (Zero Floating Toast Overlays) */
  function setBanner(target, message, tone) {
    const el = typeof target === 'string' ? document.querySelector(target) : target;
    if (!el) return;
    el.classList.remove('sbt-banner--editing', 'sbt-banner--info', 'sbt-banner--success');
    if (!message) {
      el.hidden = true;
      return;
    }
    const textEl = el.querySelector('[data-sbt-banner-text]') || el;
    textEl.textContent = message;
    if (tone === 'editing') el.classList.add('sbt-banner--editing');
    else if (tone === 'info') el.classList.add('sbt-banner--info');
    else if (tone === 'success') el.classList.add('sbt-banner--success');
    el.hidden = false;
  }

  function initModals() {
    document.querySelectorAll('.sbt-modal-backdrop').forEach(function (bd) {
      if (bd.dataset.sbtBound) return;
      bd.dataset.sbtBound = '1';
      bd.addEventListener('click', function (e) {
        if (e.target === bd) bd.classList.remove('is-open');
      });
    });
    document.querySelectorAll('[data-sbt-close-modal]').forEach(function (btn) {
      if (btn.dataset.sbtBound) return;
      btn.dataset.sbtBound = '1';
      btn.addEventListener('click', function () {
        const bd = btn.closest('.sbt-modal-backdrop');
        if (bd) bd.classList.remove('is-open');
      });
    });
  }

  function init(root) {
    if (global.SubtilsIcons) global.SubtilsIcons.hydrate(root);
    initSliders(root);
    initDualRanges(root);
    initSelects(root);
    initToggles(root);
    initStackDecks(root);
    initModals();
  }

  global.SubtilsUI = {
    init: init,
    renderGauge: renderGauge,
    renderAreaChart: renderAreaChart,
    flashButton: flashButton,
    openModal: openModal,
    closeModal: closeModal,
    confirm: confirmDialog,
    setBanner: setBanner
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { init(); });
  } else {
    init();
  }
})(window);
