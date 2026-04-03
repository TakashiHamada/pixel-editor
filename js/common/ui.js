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

/* --- Selection overlay (soft glow pulse) --- */
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
   * Draw the selection overlay with a soft pulsing glow edge.
   * Interior fill is a subtle tint; edges breathe gently.
   * @param {Uint8Array} mask - selection mask
   * @param {Float32Array} borderDist - distance field for border pixels
   * @param {number} borderRadius - max border expansion radius
   */
  drawSelection(mask, borderDist, borderRadius) {
    this.clear();
    if (!mask) return;

    const w = PE.state.imgWidth;
    const h = PE.state.imgHeight;
    const ctx = PE.dom.overlayCtx;

    // Precompute: classify each pixel as interior fill, border zone, or edge
    // Edge = selected pixel adjacent to a non-selected pixel
    const EDGE = 1, INTERIOR = 2, BORDER = 3;
    const classify = new Uint8Array(w * h);

    for (let i = 0; i < mask.length; i++) {
      if (!mask[i]) continue;
      if (mask[i] === 2) {
        classify[i] = BORDER;
        continue;
      }
      // mask[i] === 1: check if edge
      const x = i % w;
      const y = (i - x) / w;
      const isEdge =
        x === 0 || y === 0 || x === w - 1 || y === h - 1 ||
        !mask[i - 1] || !mask[i + 1] ||
        !mask[i - w] || !mask[i + w];
      classify[i] = isEdge ? EDGE : INTERIOR;
    }

    // Build base overlay image (static parts)
    const baseData = ctx.createImageData(w, h);
    const bd = baseData.data;

    for (let i = 0; i < classify.length; i++) {
      const c = classify[i];
      if (c === INTERIOR) {
        // Subtle cool blue tint
        bd[i * 4]     = 100;
        bd[i * 4 + 1] = 160;
        bd[i * 4 + 2] = 255;
        bd[i * 4 + 3] = 25;
      } else if (c === BORDER && borderRadius > 0) {
        // Warm orange fade for feathered border
        const edgeFactor = 1.0 - ((borderDist[i] - 1) / borderRadius);
        bd[i * 4]     = 255;
        bd[i * 4 + 1] = 170;
        bd[i * 4 + 2] = 50;
        bd[i * 4 + 3] = Math.round(40 * edgeFactor);
      }
      // EDGE pixels are drawn dynamically in the animation
    }

    // Collect edge pixel indices for fast iteration
    const edgeIndices = [];
    for (let i = 0; i < classify.length; i++) {
      if (classify[i] === EDGE) edgeIndices.push(i);
    }

    // Smooth breathing animation
    this._startTime = performance.now();
    const self = this;

    function animate(now) {
      // Slow sine wave: 2.5s period, gentle alpha range
      const t = (now - self._startTime) / 2500;
      const pulse = 0.5 + 0.5 * Math.sin(t * Math.PI * 2);
      // Edge glow alpha: breathe between 40 and 110
      const edgeAlpha = Math.round(40 + 70 * pulse);
      // Edge color: soft cyan-white glow
      const edgeR = Math.round(140 + 80 * pulse);
      const edgeG = Math.round(200 + 40 * pulse);
      const edgeB = 255;

      // Copy base image and stamp edge pixels
      const frameData = new ImageData(
        new Uint8ClampedArray(baseData.data),
        w, h
      );
      const fd = frameData.data;

      for (let j = 0; j < edgeIndices.length; j++) {
        const i = edgeIndices[j];
        fd[i * 4]     = edgeR;
        fd[i * 4 + 1] = edgeG;
        fd[i * 4 + 2] = edgeB;
        fd[i * 4 + 3] = edgeAlpha;
      }

      ctx.clearRect(0, 0, w, h);
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
