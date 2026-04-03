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
};

/* --- Shortcuts Modal --- */
PE.shortcuts = {
  show() {
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

/* --- Selection overlay (marching ants) --- */
PE.overlay = {
  _timer: null,

  clear() {
    const ctx = PE.dom.overlayCtx;
    ctx.clearRect(0, 0, PE.dom.overlayCanvas.width, PE.dom.overlayCanvas.height);
    if (this._timer) {
      cancelAnimationFrame(this._timer);
      this._timer = null;
    }
  },

  /**
   * Draw the selection overlay with marching ants.
   * Supports both interior (mask=1) and border (mask=2) regions.
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

    // Build overlay image
    const imgData = ctx.createImageData(w, h);
    const od = imgData.data;

    for (let i = 0; i < mask.length; i++) {
      if (mask[i] === 1) {
        od[i * 4] = 0;
        od[i * 4 + 1] = 120;
        od[i * 4 + 2] = 255;
        od[i * 4 + 3] = 40;
      } else if (mask[i] === 2 && borderRadius > 0) {
        const edgeFactor = 1.0 - ((borderDist[i] - 1) / borderRadius);
        od[i * 4] = 255;
        od[i * 4 + 1] = 165;
        od[i * 4 + 2] = 0;
        od[i * 4 + 3] = Math.round(60 * edgeFactor);
      }
    }
    ctx.putImageData(imgData, 0, 0);

    // Precompute edge path
    const edgePath = new Path2D();
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (!mask[y * w + x]) continue;
        const isEdge =
          x === 0 || y === 0 || x === w - 1 || y === h - 1 ||
          !mask[y * w + x - 1] || !mask[y * w + x + 1] ||
          !mask[(y - 1) * w + x] || !mask[(y + 1) * w + x];
        if (isEdge) {
          edgePath.rect(x, y, 1, 1);
        }
      }
    }

    // Animate marching ants
    const s = PE.state;
    const self = this;

    function animate() {
      s.marchingAntsOffset = (s.marchingAntsOffset + 1) % 12;
      ctx.clearRect(0, 0, w, h);
      ctx.putImageData(imgData, 0, 0);

      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.lineDashOffset = s.marchingAntsOffset;
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1 / s.zoom;
      ctx.stroke(edgePath);

      ctx.lineDashOffset = s.marchingAntsOffset + 4;
      ctx.strokeStyle = '#fff';
      ctx.stroke(edgePath);
      ctx.restore();

      self._timer = requestAnimationFrame(animate);
    }

    animate();
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
