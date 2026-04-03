/* ============================================================
   ui.js - UI helpers: log, shortcuts modal, overlay drawing
   ============================================================ */

window.PE = window.PE || {};

/* --- Log system --- */
PE.log = {
  _el: null,
  _timeout: null,

  _getEl() {
    if (!this._el) this._el = document.getElementById('log-message');
    return this._el;
  },

  _show(msg, cls, duration) {
    const el = this._getEl();
    if (!el) return;
    el.textContent = msg;
    el.className = cls ? `log-${cls}` : '';
    if (this._timeout) clearTimeout(this._timeout);
    if (duration) {
      this._timeout = setTimeout(() => {
        el.textContent = '';
        el.className = '';
      }, duration);
    }
    // Also log to console for debugging
    console.log(`[PE] ${msg}`);
  },

  info(msg)    { this._show(msg, '', 8000); },
  success(msg) { this._show(msg, 'success', 8000); },
  warn(msg)    { this._show(msg, 'warning', 8000); },
  error(msg)   { this._show(msg, 'error', 12000); },

  /**
   * Copy the current log message to clipboard.
   */
  copyToClipboard() {
    const el = this._getEl();
    if (!el || !el.textContent) return;
    navigator.clipboard.writeText(el.textContent).then(() => {
      const original = el.textContent;
      const originalClass = el.className;
      el.textContent = 'Copied to clipboard';
      el.className = 'log-success';
      setTimeout(() => {
        el.textContent = original;
        el.className = originalClass;
      }, 1500);
    });
  },

  init() {
    const el = this._getEl();
    if (el) {
      el.style.cursor = 'pointer';
      el.title = 'Click to copy';
      el.addEventListener('click', () => PE.log.copyToClipboard());
    }
  },
};

/* --- Shortcuts Modal --- */
PE.shortcuts = {
  show() {
    // Update the right column with active tool's shortcuts
    const col = document.getElementById('shortcuts-tool-column');
    if (col) {
      const tool = PE.toolRegistry && PE.toolRegistry[PE.state.activeTool];
      if (tool && tool.getShortcutsHTML) {
        col.innerHTML = tool.getShortcutsHTML();
      } else {
        col.innerHTML = '<div class="modal-title modal-title-muted">'
          + '<i class="fa-solid fa-puzzle-piece"></i> No tool selected</div>';
      }
    }
    const modal = document.getElementById('shortcuts-modal');
    if (modal) modal.classList.add('visible');
  },

  hide() {
    const modal = document.getElementById('shortcuts-modal');
    if (modal) modal.classList.remove('visible');
  },

  toggle() {
    const modal = document.getElementById('shortcuts-modal');
    if (modal) modal.classList.toggle('visible');
  },

  init() {
    // Close on backdrop click
    const modal = document.getElementById('shortcuts-modal');
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) PE.shortcuts.hide();
      });
    }
    // Close button
    const closeBtn = document.getElementById('shortcuts-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => PE.shortcuts.hide());
    }
  },
};

/* --- Selection overlay (dark red pulsing fill) --- */
PE.overlay = {
  _timer: null,
  _startTime: 0,

  clear() {
    const ctx = PE.dom.overlayCtx;
    ctx.clearRect(0, 0, PE.dom.overlayCanvas.width, PE.dom.overlayCanvas.height);
    if (this._timer) {
      cancelAnimationFrame(this._timer);
      this._timer = null;
    }
  },

  /**
   * Draw the selection overlay as a dark-red tinted region that pulses
   * between 50% and 100% opacity. Border zone fades proportionally.
   * @param {Uint8Array} mask - selection mask (1=interior, 2=border)
   * @param {Float32Array} borderDist - distance field for border pixels
   * @param {number} borderRadius - max border expansion radius
   */
  drawSelection(mask, borderDist, borderRadius) {
    this.clear();
    if (!mask) return;

    const w = PE.state.imgWidth;
    const h = PE.state.imgHeight;
    const ctx = PE.dom.overlayCtx;

    // Vivid red: brighter than --accent for clear visibility
    const R = 200, G = 40, B = 40;
    const BASE_ALPHA = 110; // max alpha for interior at full pulse

    // Precompute per-pixel alpha multiplier (0.0 - 1.0)
    // Interior = 1.0, Border = fades from 1.0 to 0.0
    const alphaMap = new Float32Array(w * h);
    for (let i = 0; i < mask.length; i++) {
      if (mask[i] === 1) {
        alphaMap[i] = 1.0;
      } else if (mask[i] === 2 && borderRadius > 0) {
        alphaMap[i] = 1.0 - ((borderDist[i] - 1) / borderRadius);
      }
    }

    // Collect selected pixel indices for fast per-frame updates
    const selectedIndices = [];
    for (let i = 0; i < mask.length; i++) {
      if (mask[i]) selectedIndices.push(i);
    }

    // Reusable ImageData for animation frames
    const frameData = ctx.createImageData(w, h);
    const fd = frameData.data;

    this._startTime = performance.now();
    const self = this;

    function animate(now) {
      // Sine wave: 1.2s period, pulse between 0.5 and 1.0
      const t = (now - self._startTime) / 1200;
      const pulse = 0.75 + 0.25 * Math.sin(t * Math.PI * 2);

      for (let j = 0; j < selectedIndices.length; j++) {
        const i = selectedIndices[j];
        const p = i * 4;
        fd[p]     = R;
        fd[p + 1] = G;
        fd[p + 2] = B;
        fd[p + 3] = Math.round(BASE_ALPHA * alphaMap[i] * pulse);
      }

      ctx.putImageData(frameData, 0, 0);
      self._timer = requestAnimationFrame(animate);
    }

    this._timer = requestAnimationFrame(animate);
  },
};

/* --- Loading spinner --- */
PE.loading = {
  show() {
    document.getElementById('loading').classList.add('visible');
  },
  hide() {
    document.getElementById('loading').classList.remove('visible');
  },
};
