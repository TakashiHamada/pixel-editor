/* ============================================================
   scanner.js - Scanner Tool

   Workflow:
   1. Perspective & Crop: drag 4 corner handles to the true corners
      of the sketched document; Apply Warp rectifies it.
   2. Adjust: optional grayscale conversion + brightness / contrast
      sliders with live preview that is committed immediately
      (one undo entry per Adjust session).

   Exports as JPEG.
   ============================================================ */

window.PE = window.PE || {};
PE.tools = PE.tools || {};

PE.tools.scanner = {
  id: 'scanner',
  label: 'Scanner',
  icon: 'fa-wand-magic-sparkles',
  saveFormat: 'jpeg',

  description: 'Clean up photographed or scanned sketches. Drag the four corner handles '
    + 'to the corners of the page to remove perspective distortion, then adjust '
    + 'brightness and contrast for a clean result. Color is preserved by default; '
    + 'toggle Grayscale in Adjust to convert to monochrome. Adjust changes apply as '
    + 'you slide.',

  getShortcutsHTML() {
    return `
      <div class="modal-title">
        <i class="fa-solid fa-wand-magic-sparkles"></i> Scanner Tool
      </div>
      <p class="tool-description">${this.description}</p>
      <ul class="shortcut-list">
        <li><span class="shortcut-desc">Perspective mode</span> <span class="shortcut-key">P</span></li>
        <li><span class="shortcut-desc">Adjust mode</span> <span class="shortcut-key">A</span></li>
        <li><span class="shortcut-desc">Reset handles</span> <span class="shortcut-key">R</span></li>
      </ul>
    `;
  },

  // Tool state
  subTool: 'warp',          // 'warp' | 'adjust'
  selectMode: 'perspective',// 'perspective' | 'rectangle'
  corners: null,            // [{x,y}, ...] in image coords (TL, TR, BR, BL)
  baseData: null,           // ImageData snapshot used as adjust source
  grayscale: false,         // Off by default so Apply Warp preserves color
  brightness: 0,
  contrast: 0,

  // Internal
  _handles: [],
  _polygon: null,
  _dragging: -1,
  _transformHook: null,
  _pointerMoveHook: null,
  _pointerUpHook: null,

  activate() {
    const panel = document.getElementById('left-panel');
    panel.innerHTML = this._buildPanelHTML();
    panel.classList.add('visible');
    this._bindPanelEvents();
    this._setSelectMode(this.selectMode);
    // Force _setSubTool to treat this as a fresh entry (so Adjust re-snapshots
    // baseData and resets sliders even when the saved subTool was already
    // 'adjust'). The Adjust-session undo snapshot is pushed lazily from
    // _pushAdjustUndoOnce on the first control change (or eagerly on entry
    // when grayscale is already enabled — see _setSubTool for the full flow).
    const initial = this.subTool || 'warp';
    this.subTool = null;
    this._setSubTool(initial);
  },

  deactivate() {
    this._hideHandles();
    const panel = document.getElementById('left-panel');
    panel.classList.remove('visible');
    panel.innerHTML = '';
    // Adjust changes are already committed to s.imageData live. The Adjust
    // session's single undo entry (pushed lazily on the first control
    // interaction, or eagerly on entry if grayscale was already on and the
    // entry render mutates pixels) is enough to revert the whole session on
    // Ctrl+Z.
  },

  /**
   * Called by file.close() before the image is cleared. Tears down any
   * overlays that must not outlive the image (warp handles, corner state).
   */
  onImageClose() {
    this._hideHandles();
    this.corners = null;
    this.baseData = null;
    // If the user opens a fresh image while Scanner is still active, the next
    // _setSubTool('adjust') needs to re-snapshot baseData from the new image.
    // Clearing subTool here forces the `prev !== 'adjust'` branch to run.
    this.subTool = null;
  },

  onKeydown(e) {
    if (!PE.state.imageData) return;
    if (e.key === 'p' || e.key === 'P') this._setSubTool('warp');
    if (e.key === 'a' || e.key === 'A') this._setSubTool('adjust');
    if (e.key === 'r' || e.key === 'R') this._resetCorners();
  },

  onCanvasClick() { /* no-op: Scanner interactions happen via panel + handles */ },

  // ---------------------------------------------------------------
  // Panel
  // ---------------------------------------------------------------
  _buildPanelHTML() {
    return `
      <div class="panel-section" data-section="warp">
        <div class="panel-section-title selectable" id="scan-warp-title">
          <i class="fa-solid fa-crop-simple"></i> Crop Region
        </div>
        <div class="panel-row mk-mode-row">
          <button class="btn-panel scan-selmode-btn" id="scan-selmode-perspective" data-mode="perspective">
            <i class="fa-solid fa-object-ungroup"></i> Perspective
          </button>
          <button class="btn-panel scan-selmode-btn" id="scan-selmode-rectangle" data-mode="rectangle">
            <i class="fa-solid fa-vector-square"></i> Rectangle
          </button>
        </div>
        <div class="panel-hint" id="scan-warp-hint"></div>
        <div class="panel-row mk-mode-row">
          <button class="btn-panel btn-action" id="scan-apply-warp">
            <i class="fa-solid fa-check"></i> <span id="scan-apply-label">Apply Warp</span>
          </button>
          <button class="btn-panel btn-icon" id="scan-reset-corners"
                  title="Reset corners" aria-label="Reset corners">
            <i class="fa-solid fa-rotate-left"></i>
          </button>
        </div>
      </div>

      <div class="panel-section" data-section="adjust">
        <div class="panel-section-title selectable" id="scan-adjust-title">
          <i class="fa-solid fa-sliders"></i> Adjust
        </div>
        <div class="panel-hint">Changes apply live as you slide.</div>
        <div class="panel-row">
          <label class="panel-label" for="scan-grayscale" style="cursor:pointer;">Grayscale</label>
          <input type="checkbox" class="panel-checkbox" id="scan-grayscale" ${this.grayscale ? 'checked' : ''}>
        </div>
        <div class="panel-row">
          <span class="panel-label">Brightness</span>
          <input type="range" class="panel-slider" id="scan-brightness"
                 min="-100" max="100" value="${this.brightness}">
          <span class="panel-slider-value" id="scan-brightness-val">${this.brightness}</span>
        </div>
        <div class="panel-row">
          <span class="panel-label">Contrast</span>
          <input type="range" class="panel-slider" id="scan-contrast"
                 min="-100" max="100" value="${this.contrast}">
          <span class="panel-slider-value" id="scan-contrast-val">${this.contrast}</span>
        </div>
      </div>
    `;
  },

  _bindPanelEvents() {
    // Sub-tool sections: clicking anywhere in a disabled section activates it.
    PE.panels.wireSubSections((name) => this._setSubTool(name));

    document.querySelectorAll('.scan-selmode-btn').forEach(btn => {
      btn.addEventListener('click', () => this._setSelectMode(btn.dataset.mode));
    });

    document.getElementById('scan-reset-corners').addEventListener('click', () => this._resetCorners());
    document.getElementById('scan-apply-warp').addEventListener('click', () => this._applyWarp());

    document.getElementById('scan-grayscale').addEventListener('change', (e) => {
      this._pushAdjustUndoOnce();
      this.grayscale = e.target.checked;
      this._renderPreview();
    });
    const bindSlider = (id, key) => {
      const slider = document.getElementById(id);
      const val = document.getElementById(`${id}-val`);
      slider.addEventListener('input', (e) => {
        this._pushAdjustUndoOnce();
        this[key] = parseInt(e.target.value, 10);
        val.textContent = this[key];
        this._renderPreview();
      });
    };
    bindSlider('scan-brightness', 'brightness');
    bindSlider('scan-contrast', 'contrast');
  },

  _setSelectMode(mode) {
    this.selectMode = mode;
    document.querySelectorAll('.scan-selmode-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === mode);
    });
    const hint = document.getElementById('scan-warp-hint');
    if (hint) {
      hint.textContent = mode === 'perspective'
        ? 'Drag each corner to match the edges of the document.'
        : 'Drag a corner to resize the crop rectangle.';
    }
    const label = document.getElementById('scan-apply-label');
    if (label) label.textContent = mode === 'perspective' ? 'Apply Warp' : 'Apply Crop';
    // Snap corners to axis-aligned rectangle when entering rectangle mode.
    if (mode === 'rectangle' && this.corners) {
      const xs = this.corners.map(c => c.x);
      const ys = this.corners.map(c => c.y);
      const minX = Math.min(...xs), maxX = Math.max(...xs);
      const minY = Math.min(...ys), maxY = Math.max(...ys);
      this.corners = [
        { x: minX, y: minY },
        { x: maxX, y: minY },
        { x: maxX, y: maxY },
        { x: minX, y: maxY },
      ];
      this._repositionHandles();
    }
  },

  _setSubTool(name) {
    const prev = this.subTool;
    this.subTool = name;
    PE.panels.setActiveSection(name);

    const container = PE.dom.container;
    container.classList.remove('cursor-crosshair');

    if (name === 'warp') {
      if (!this.corners) this._resetCorners();
      this._showHandles();
    } else {
      this._hideHandles();
      // Entering Adjust from somewhere else: snapshot the pre-Adjust state and
      // reset sliders. The undo entry is deferred to the first real user
      // interaction (see _pushAdjustUndoOnce) so tabbing through Adjust
      // without touching a control leaves no no-op Ctrl+Z on the stack.
      // Exception: grayscale persists across sessions, so if it's still on
      // when we re-enter Adjust (e.g. after a second Apply Warp), the initial
      // render will mutate the pixels. Push undo eagerly in that case so the
      // conversion is reversible.
      if (PE.state.imageData && prev !== 'adjust') {
        this._snapshotBase();
        this._adjustUndoPushed = false;
        this.brightness = 0;
        this.contrast = 0;
        const bEl = document.getElementById('scan-brightness');
        const cEl = document.getElementById('scan-contrast');
        if (bEl) { bEl.value = 0; document.getElementById('scan-brightness-val').textContent = '0'; }
        if (cEl) { cEl.value = 0; document.getElementById('scan-contrast-val').textContent = '0'; }
        if (this.grayscale) this._pushAdjustUndoOnce();
        this._renderPreview();
      }
    }
  },

  // ---------------------------------------------------------------
  // Perspective & Crop
  // ---------------------------------------------------------------
  _resetCorners() {
    const s = PE.state;
    if (!s.imageData) return;
    const w = s.imgWidth;
    const h = s.imgHeight;
    this.corners = [
      { x: 0,     y: 0 },     // TL
      { x: w - 1, y: 0 },     // TR
      { x: w - 1, y: h - 1 }, // BR
      { x: 0,     y: h - 1 }, // BL
    ];
    if (this.subTool === 'warp') this._showHandles();
  },

  _showHandles() {
    if (!PE.state.imageData || !this.corners) return;
    this._hideHandles();

    const container = PE.dom.container;
    // SVG for polygon outline
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('warp-svg');
    svg.setAttribute('pointer-events', 'none');
    const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    poly.setAttribute('class', 'warp-polygon');
    svg.appendChild(poly);
    container.appendChild(svg);
    this._polygon = { svg, poly };

    // Handles
    this._handles = this.corners.map((_, i) => {
      const h = document.createElement('div');
      h.className = 'warp-handle';
      h.dataset.idx = String(i);
      h.addEventListener('pointerdown', (e) => this._beginHandleDrag(e, i));
      container.appendChild(h);
      return h;
    });

    this._transformHook = () => this._repositionHandles();
    PE.zoom.transformListeners.push(this._transformHook);
    this._repositionHandles();
  },

  _hideHandles() {
    if (this._polygon) {
      this._polygon.svg.remove();
      this._polygon = null;
    }
    this._handles.forEach(h => h.remove());
    this._handles = [];
    if (this._transformHook) {
      const idx = PE.zoom.transformListeners.indexOf(this._transformHook);
      if (idx >= 0) PE.zoom.transformListeners.splice(idx, 1);
      this._transformHook = null;
    }
    this._detachDragListeners();
    // Drop stale drag index so a buffered pointer event after teardown can't
    // mutate corners that no longer have a visible handle.
    this._dragging = -1;
  },

  _repositionHandles() {
    if (!this.corners || this._handles.length !== 4) return;
    const s = PE.state;
    const rect = PE.dom.container.getBoundingClientRect();
    const pts = this.corners.map(c => ({
      x: c.x * s.zoom + s.panX,
      y: c.y * s.zoom + s.panY,
    }));
    for (let i = 0; i < 4; i++) {
      const h = this._handles[i];
      h.style.left = `${pts[i].x}px`;
      h.style.top = `${pts[i].y}px`;
    }
    if (this._polygon) {
      this._polygon.svg.setAttribute('width', rect.width);
      this._polygon.svg.setAttribute('height', rect.height);
      this._polygon.poly.setAttribute(
        'points',
        pts.map(p => `${p.x},${p.y}`).join(' ')
      );
    }
  },

  _beginHandleDrag(e, idx) {
    e.preventDefault();
    this._dragging = idx;
    this._handles[idx].setPointerCapture(e.pointerId);

    this._pointerMoveHook = (ev) => {
      if (this._dragging < 0) return;
      const s = PE.state;
      const rect = PE.dom.container.getBoundingClientRect();
      const imgX = (ev.clientX - rect.left - s.panX) / s.zoom;
      const imgY = (ev.clientY - rect.top - s.panY) / s.zoom;
      const nx = Math.max(0, Math.min(s.imgWidth - 1, imgX));
      const ny = Math.max(0, Math.min(s.imgHeight - 1, imgY));
      const i = this._dragging;
      this.corners[i] = { x: nx, y: ny };
      if (this.selectMode === 'rectangle') {
        // Keep rectangle axis-aligned: update the two neighbors sharing an edge.
        // Corner order: 0=TL, 1=TR, 2=BR, 3=BL
        // Neighbor pairs [self, y-mate (shares y), x-mate (shares x)]
        const pairs = { 0: [1, 3], 1: [0, 2], 2: [3, 1], 3: [2, 0] };
        const [yMate, xMate] = pairs[i];
        this.corners[yMate].y = ny;
        this.corners[xMate].x = nx;
      }
      this._repositionHandles();
    };
    this._pointerUpHook = () => {
      this._dragging = -1;
      this._detachDragListeners();
    };
    window.addEventListener('pointermove', this._pointerMoveHook);
    window.addEventListener('pointerup', this._pointerUpHook);
  },

  _detachDragListeners() {
    if (this._pointerMoveHook) {
      window.removeEventListener('pointermove', this._pointerMoveHook);
      this._pointerMoveHook = null;
    }
    if (this._pointerUpHook) {
      window.removeEventListener('pointerup', this._pointerUpHook);
      this._pointerUpHook = null;
    }
  },

  _applyWarp() {
    const s = PE.state;
    if (!s.imageData || !this.corners) {
      PE.log.warn('No image loaded');
      return;
    }

    PE.loading.show();
    setTimeout(() => {
      PE.history.pushUndo();
      this._doWarp();
      PE.loading.hide();
    }, 10);
  },

  _doWarp() {
    const s = PE.state;
    const src = s.imageData;
    const sw = s.imgWidth;
    const sh = s.imgHeight;
    const c = this.corners;

    // Output size: averages of opposite edge lengths
    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const topW = dist(c[0], c[1]);
    const botW = dist(c[3], c[2]);
    const leftH = dist(c[0], c[3]);
    const rightH = dist(c[1], c[2]);
    const outW = Math.max(1, Math.round((topW + botW) / 2));
    const outH = Math.max(1, Math.round((leftH + rightH) / 2));

    // Destination corners: rectangle (TL, TR, BR, BL)
    const dst = [
      { x: 0,        y: 0 },
      { x: outW - 1, y: 0 },
      { x: outW - 1, y: outH - 1 },
      { x: 0,        y: outH - 1 },
    ];
    // Homography maps DST -> SRC for backward sampling
    const H = this._computeHomography(dst, c);
    if (!H) {
      PE.log.error('Invalid corner positions');
      return;
    }

    const out = new ImageData(outW, outH);
    const od = out.data;
    const sd = src.data;

    for (let y = 0; y < outH; y++) {
      for (let x = 0; x < outW; x++) {
        const denom = H[6] * x + H[7] * y + 1;
        const sx = (H[0] * x + H[1] * y + H[2]) / denom;
        const sy = (H[3] * x + H[4] * y + H[5]) / denom;
        const oi = (y * outW + x) * 4;
        if (sx < 0 || sx > sw - 1 || sy < 0 || sy > sh - 1) {
          // White background for out-of-bounds samples
          od[oi] = 255; od[oi + 1] = 255; od[oi + 2] = 255; od[oi + 3] = 255;
          continue;
        }
        // Bilinear sample
        const x0 = Math.floor(sx), y0 = Math.floor(sy);
        const x1 = Math.min(sw - 1, x0 + 1);
        const y1 = Math.min(sh - 1, y0 + 1);
        const fx = sx - x0, fy = sy - y0;
        const i00 = (y0 * sw + x0) * 4;
        const i10 = (y0 * sw + x1) * 4;
        const i01 = (y1 * sw + x0) * 4;
        const i11 = (y1 * sw + x1) * 4;
        for (let k = 0; k < 4; k++) {
          const v = sd[i00 + k] * (1 - fx) * (1 - fy)
                  + sd[i10 + k] * fx       * (1 - fy)
                  + sd[i01 + k] * (1 - fx) * fy
                  + sd[i11 + k] * fx       * fy;
          od[oi + k] = Math.round(v);
        }
      }
    }

    // Replace the main canvas + imageData
    s.imgWidth = outW;
    s.imgHeight = outH;
    s.imageData = out;
    PE.dom.mainCanvas.width = outW;
    PE.dom.mainCanvas.height = outH;
    PE.dom.overlayCanvas.width = outW;
    PE.dom.overlayCanvas.height = outH;
    PE.dom.mainCtx.putImageData(out, 0, 0);
    PE.overlay.clear();
    PE.zoom.fitToView();
    PE.file._updateImageInfo();
    this._resetCorners();
    const verb = this.selectMode === 'rectangle' ? 'Crop' : 'Warp';
    PE.log.success(`${verb} applied — switched to Adjust`);
    // Automatically move on to Adjust mode once the region is confirmed, and
    // flash the first Adjust row so the user sees the panel change. Adjust
    // manages its own lazy undo snapshot from the post-warp image, so Ctrl+Z
    // can revert an Adjust session first and the Warp on the next undo —
    // with no no-op entry if the user never touches the controls.
    this._setSubTool('adjust');
    const firstRow = document.querySelector(
      '#left-panel .panel-section[data-section="adjust"] .panel-row'
    );
    if (firstRow) {
      firstRow.classList.remove('flash');
      void firstRow.offsetWidth; // restart animation
      firstRow.classList.add('flash');
    }
  },

  /**
   * Solve an 8x8 linear system to compute homography coefficients
   * [a, b, c, d, e, f, g, h] mapping src -> dst (here we pass dst as src_param
   * to get DST -> SRC for backward sampling).
   * Returns null if the system is singular.
   */
  _computeHomography(srcPts, dstPts) {
    const M = [];
    const v = [];
    for (let i = 0; i < 4; i++) {
      const { x: u, y: w } = srcPts[i];
      const { x, y } = dstPts[i];
      M.push([u, w, 1, 0, 0, 0, -x * u, -x * w]); v.push(x);
      M.push([0, 0, 0, u, w, 1, -y * u, -y * w]); v.push(y);
    }
    // Gauss-Jordan
    const n = 8;
    for (let col = 0; col < n; col++) {
      // Find pivot
      let piv = col;
      for (let r = col + 1; r < n; r++) {
        if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
      }
      if (Math.abs(M[piv][col]) < 1e-10) return null;
      if (piv !== col) { [M[col], M[piv]] = [M[piv], M[col]]; [v[col], v[piv]] = [v[piv], v[col]]; }
      // Eliminate
      const pivVal = M[col][col];
      for (let c = col; c < n; c++) M[col][c] /= pivVal;
      v[col] /= pivVal;
      for (let r = 0; r < n; r++) {
        if (r === col) continue;
        const factor = M[r][col];
        if (factor === 0) continue;
        for (let c = col; c < n; c++) M[r][c] -= factor * M[col][c];
        v[r] -= factor * v[col];
      }
    }
    return v; // [a, b, c, d, e, f, g, h]
  },

  // ---------------------------------------------------------------
  // Adjust
  // ---------------------------------------------------------------
  _snapshotBase() {
    const s = PE.state;
    this.baseData = new ImageData(
      new Uint8ClampedArray(s.imageData.data),
      s.imgWidth, s.imgHeight
    );
  },

  /**
   * Lazy undo snapshot for the current Adjust session. Pushes baseData (the
   * pristine pre-adjust state captured on section entry) onto the global
   * undo stack the first time it runs in a given session, and marks the
   * session as pushed so subsequent calls are no-ops. `_adjustUndoPushed`
   * starts false when entering Adjust; the entry path calls this method
   * eagerly when grayscale is on (because the entry render mutates pixels),
   * otherwise it stays lazy until the first slider / checkbox interaction.
   */
  _pushAdjustUndoOnce() {
    if (this._adjustUndoPushed) return;
    if (!PE.state.imageData || !this.baseData) return;
    // Delegate stack push / trim / redo-clear / UI refresh to the shared
    // helper so any future tweak to the undo contract stays in one place.
    PE.history.pushSnapshot(this.baseData);
    this._adjustUndoPushed = true;
  },

  _renderPreview() {
    const s = PE.state;
    if (!this.baseData || !s.imageData) return;
    const src = this.baseData.data;
    const dst = s.imageData.data;
    const len = src.length;

    // Contrast factor
    const c = this.contrast;
    const cf = (259 * (c + 255)) / (255 * (259 - c));
    const b = this.brightness;
    const gray = this.grayscale;

    for (let i = 0; i < len; i += 4) {
      let r = src[i], g = src[i + 1], bl = src[i + 2];
      if (gray) {
        const y = 0.299 * r + 0.587 * g + 0.114 * bl;
        r = g = bl = y;
      }
      // Brightness + contrast
      r = cf * (r - 128) + 128 + b;
      g = cf * (g - 128) + 128 + b;
      bl = cf * (bl - 128) + 128 + b;
      dst[i]     = Math.max(0, Math.min(255, r));
      dst[i + 1] = Math.max(0, Math.min(255, g));
      dst[i + 2] = Math.max(0, Math.min(255, bl));
      dst[i + 3] = src[i + 3];
    }
    PE.dom.mainCtx.putImageData(s.imageData, 0, 0);
  },
};
