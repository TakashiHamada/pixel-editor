/* ============================================================
   marker.js - Marker Tool

   Paint a photographed/scanned pencil sketch with translucent
   colored markers, one color per layer, composited with
   multiply blend. Pencil layer can be tinted to a single color
   via luminance-proportional blending (black -> tint, white -> white).

   Export: the main canvas already holds the composited result
   on a white background; saved as JPEG.
   ============================================================ */

window.PE = window.PE || {};
PE.tools = PE.tools || {};

PE.tools.marker = {
  id: 'marker',
  label: 'Marker',
  icon: 'fa-highlighter',
  saveFormat: 'jpeg',

  description: 'Paint over a pencil sketch with translucent markers. Each color lives on its own '
    + 'layer, composited via multiply. Tint the pencil layer, adjust per-layer opacity, and '
    + 'paint with pen-pressure sensitivity. Export as JPEG.',

  getShortcutsHTML() {
    return `
      <div class="modal-title">
        <i class="fa-solid fa-highlighter"></i> Marker Tool
      </div>
      <p class="tool-description">${this.description}</p>
      <ul class="shortcut-list">
        <li><span class="shortcut-desc">Brush</span> <span class="shortcut-key">B</span></li>
        <li><span class="shortcut-desc">Eraser</span> <span class="shortcut-key">E</span></li>
        <li><span class="shortcut-desc">Brush size</span> <span class="shortcut-key">[ / ]</span></li>
        <li><span class="shortcut-desc">New color layer</span> <span class="shortcut-key">N</span></li>
        <li><span class="shortcut-desc">Undo stroke</span> <span class="shortcut-key">Ctrl + Z</span></li>
      </ul>
    `;
  },

  // ---- State ----
  pencilSource: null,     // ImageData of the base sketch (captured on activate)
  pencilTint: '#000000',  // Current tint color for pencil layer
  pencilRender: null,     // Offscreen canvas holding tinted pencil output
  layers: [],             // [{ id, color, opacity, visible, canvas, ctx }]
  activeLayerId: null,
  _nextLayerId: 1,

  brushSize: 24,
  brushMode: 'brush',     // 'brush' | 'eraser'
  pressureEnabled: true,

  // Which section ("sub-tool") is currently focused. Mirrors the mode-group
  // pattern used by Transparency and Scanner: only the active section's
  // controls are interactive, canvas painting only works while 'brush'.
  activeSection: 'pencil', // 'pencil' | 'layers' | 'brush'

  undoStack: [],          // [{ layerId, before }]  (ImageData of layer pre-stroke)
  redoStack: [],
  MAX_UNDO: 30,

  // Ephemeral
  _drawing: false,
  _lastX: 0,
  _lastY: 0,
  _lastPressure: 0.5,
  _strokeBefore: null,

  // Event hooks
  _onPointerDown: null,
  _onPointerMove: null,
  _onPointerUp: null,
  _onPointerEnter: null,
  _onPointerLeave: null,
  _onZoomChange: null,

  // Brush cursor preview (DOM circle) and hover tracking
  _cursorEl: null,
  _hovering: false,

  // Default palette cycled when creating new layers
  _palette: ['#E85D5D', '#F2B84B', '#69B56A', '#4A8FD9', '#9b59b6', '#8b5a2b'],

  // ---------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------
  activate() {
    const s = PE.state;
    if (!s.imageData) {
      // No image loaded: still build panel (disabled controls)
      const panel = document.getElementById('left-panel');
      panel.innerHTML = this._buildPanelHTML();
      panel.classList.add('visible');
      this._bindPanelEvents();
      return;
    }

    // Capture the current image as pencil source. Also push it to global
    // undo so Ctrl+Z after leaving Marker reverts the paint session.
    PE.history.pushUndo();

    this.pencilSource = new ImageData(
      new Uint8ClampedArray(s.imageData.data),
      s.imgWidth, s.imgHeight
    );
    this._makePencilRender();

    // Fresh layer stack: one empty layer in default palette color
    this.layers = [];
    this._nextLayerId = 1;
    this.undoStack = [];
    this.redoStack = [];
    this._newLayer(this._palette[0]);

    const panel = document.getElementById('left-panel');
    panel.innerHTML = this._buildPanelHTML();
    panel.classList.add('visible');
    this._bindPanelEvents();
    this._renderLayerList();
    this._setBrushMode(this.brushMode);
    // Always start a new Marker session on the Pencil section.
    this.activeSection = 'pencil';
    this._setActiveSection(this.activeSection);

    // Attach pointer listeners on the canvas container
    const container = PE.dom.container;
    this._onPointerDown = (e) => this._handlePointerDown(e);
    this._onPointerMove = (e) => this._handlePointerMove(e);
    this._onPointerUp   = (e) => this._handlePointerUp(e);
    this._onPointerEnter = () => {
      this._hovering = true;
      if (this.activeSection === 'brush') this._showCursor();
    };
    this._onPointerLeave = () => {
      this._hovering = false;
      this._hideCursor();
    };
    container.addEventListener('pointerdown', this._onPointerDown);
    window.addEventListener('pointermove', this._onPointerMove);
    window.addEventListener('pointerup',   this._onPointerUp);
    container.addEventListener('pointerenter', this._onPointerEnter);
    container.addEventListener('pointerleave', this._onPointerLeave);

    // Create brush preview cursor and hook zoom changes so its size tracks zoom.
    this._createCursor();
    this._onZoomChange = () => this._updateCursorSize();
    PE.zoom.transformListeners.push(this._onZoomChange);

    this._composite();
  },

  /**
   * Return true if the tool may be deactivated, false to veto.
   * Marker vetoes unless the user confirms that layer data will be discarded.
   */
  canDeactivate() {
    if (!this._hasPaintedContent()) return true;
    return window.confirm(
      'Leaving the Marker tool will discard all color layers '
      + '(they will be baked into a single flat image).\n\n'
      + 'If you want to keep your work as editable layers, stay on Marker. '
      + 'To save the painted result, click Download (JPEG) first.\n\n'
      + 'Continue and discard layers?'
    );
  },

  _hasPaintedContent() {
    // Any undo history implies at least one stroke was drawn.
    return this.undoStack.length > 0;
  },

  deactivate() {
    const s = PE.state;
    const container = PE.dom.container;
    container.classList.remove('cursor-brush');

    if (this._onPointerDown) container.removeEventListener('pointerdown', this._onPointerDown);
    if (this._onPointerMove) window.removeEventListener('pointermove', this._onPointerMove);
    if (this._onPointerUp)   window.removeEventListener('pointerup',   this._onPointerUp);
    if (this._onPointerEnter) container.removeEventListener('pointerenter', this._onPointerEnter);
    if (this._onPointerLeave) container.removeEventListener('pointerleave', this._onPointerLeave);
    this._onPointerDown = this._onPointerMove = this._onPointerUp = null;
    this._onPointerEnter = this._onPointerLeave = null;

    if (this._onZoomChange) {
      const idx = PE.zoom.transformListeners.indexOf(this._onZoomChange);
      if (idx >= 0) PE.zoom.transformListeners.splice(idx, 1);
      this._onZoomChange = null;
    }
    this._destroyCursor();

    // Bake composite back into imageData so other tools see the painted result.
    if (s.imageData && this.pencilSource) {
      s.imageData = PE.dom.mainCtx.getImageData(0, 0, s.imgWidth, s.imgHeight);
    }

    const panel = document.getElementById('left-panel');
    panel.classList.remove('visible');
    panel.innerHTML = '';

    // Clear layer memory
    this.layers = [];
    this.pencilSource = null;
    this.pencilRender = null;
    this.undoStack = [];
    this.redoStack = [];
  },

  onCanvasClick() { /* pointer events do the work */ },

  onKeydown(e) {
    if (e.ctrlKey || e.metaKey) return;
    if (e.key === 'b' || e.key === 'B') this._setBrushMode('brush');
    if (e.key === 'e' || e.key === 'E') this._setBrushMode('eraser');
    if (e.key === '[') this._adjustBrushSize(-2);
    if (e.key === ']') this._adjustBrushSize(+2);
    if (e.key === 'n' || e.key === 'N') this._addNextPaletteLayer();
  },

  /**
   * Export canvas for Download: the main canvas already holds the composited
   * result with a white background, so we can use it directly.
   */
  getExportCanvas() {
    return PE.dom.mainCanvas;
  },

  // ---------------------------------------------------------------
  // Pencil layer tinting (luminance-proportional, "case B-2")
  // ---------------------------------------------------------------
  _makePencilRender() {
    if (!this.pencilSource) return;
    const w = this.pencilSource.width;
    const h = this.pencilSource.height;

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');

    const src = this.pencilSource.data;
    const out = ctx.createImageData(w, h);
    const od = out.data;

    const [tR, tG, tB] = this._hexToRgb(this.pencilTint);

    // output = white * (Y/255) + tint * (1 - Y/255)
    // Y = 0.299 R + 0.587 G + 0.114 B
    for (let i = 0; i < src.length; i += 4) {
      const a = src[i + 3];
      if (a === 0) {
        // Treat transparent source pixels as white paper
        od[i] = 255; od[i + 1] = 255; od[i + 2] = 255; od[i + 3] = 255;
        continue;
      }
      const Y = 0.299 * src[i] + 0.587 * src[i + 1] + 0.114 * src[i + 2];
      const t = Y / 255;           // 1 = white/paper, 0 = black/line
      od[i]     = Math.round(255 * t + tR * (1 - t));
      od[i + 1] = Math.round(255 * t + tG * (1 - t));
      od[i + 2] = Math.round(255 * t + tB * (1 - t));
      od[i + 3] = 255;
    }
    ctx.putImageData(out, 0, 0);
    this.pencilRender = canvas;
  },

  // ---------------------------------------------------------------
  // Layer management
  // ---------------------------------------------------------------
  _newLayer(color) {
    const s = PE.state;
    const id = this._nextLayerId++;
    const canvas = document.createElement('canvas');
    canvas.width = s.imgWidth;
    canvas.height = s.imgHeight;
    const ctx = canvas.getContext('2d');
    const layer = {
      id, color, opacity: 1.0, visible: true, canvas, ctx,
    };
    this.layers.push(layer);
    this.activeLayerId = id;
    return layer;
  },

  _addNextPaletteLayer() {
    const nextColor = this._palette[this.layers.length % this._palette.length];
    this._newLayer(nextColor);
    this._renderLayerList();
    this._composite();
  },

  _getActiveLayer() {
    return this.layers.find(l => l.id === this.activeLayerId) || null;
  },

  _deleteLayer(id) {
    const idx = this.layers.findIndex(l => l.id === id);
    if (idx < 0) return;
    this.layers.splice(idx, 1);
    if (this.activeLayerId === id) {
      this.activeLayerId = this.layers.length ? this.layers[this.layers.length - 1].id : null;
    }
    // Invalidate undo entries for deleted layer
    this.undoStack = this.undoStack.filter(u => u.layerId !== id);
    this.redoStack = this.redoStack.filter(u => u.layerId !== id);
    this._renderLayerList();
    this._composite();
  },

  _moveLayer(id, dir) {
    const idx = this.layers.findIndex(l => l.id === id);
    if (idx < 0) return;
    const ni = idx + dir;
    if (ni < 0 || ni >= this.layers.length) return;
    const [l] = this.layers.splice(idx, 1);
    this.layers.splice(ni, 0, l);
    this._renderLayerList();
    this._composite();
  },

  _setLayerOpacity(id, opacity) {
    const l = this.layers.find(x => x.id === id);
    if (!l) return;
    l.opacity = opacity;
    this._composite();
  },

  _toggleLayerVisible(id) {
    const l = this.layers.find(x => x.id === id);
    if (!l) return;
    l.visible = !l.visible;
    this._renderLayerList();
    this._composite();
  },

  _recolorLayer(id, newColor) {
    const l = this.layers.find(x => x.id === id);
    if (!l) return;
    l.color = newColor;
    // Recolor all non-transparent pixels in the layer canvas
    const [r, g, b] = this._hexToRgb(newColor);
    const img = l.ctx.getImageData(0, 0, l.canvas.width, l.canvas.height);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] > 0) { d[i] = r; d[i + 1] = g; d[i + 2] = b; }
    }
    l.ctx.putImageData(img, 0, 0);
    this._renderLayerList();
    this._composite();
  },

  // ---------------------------------------------------------------
  // Compositing
  // ---------------------------------------------------------------
  _composite() {
    const s = PE.state;
    const ctx = PE.dom.mainCtx;
    const w = s.imgWidth, h = s.imgHeight;

    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    // White paper background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    // Pencil (already tinted)
    if (this.pencilRender) ctx.drawImage(this.pencilRender, 0, 0);
    // Color layers (multiply)
    ctx.globalCompositeOperation = 'multiply';
    for (const layer of this.layers) {
      if (!layer.visible || layer.opacity <= 0) continue;
      ctx.globalAlpha = layer.opacity;
      ctx.drawImage(layer.canvas, 0, 0);
    }
    ctx.restore();
  },

  // ---------------------------------------------------------------
  // Painting
  // ---------------------------------------------------------------
  _eventToImageCoord(e) {
    const s = PE.state;
    const rect = PE.dom.container.getBoundingClientRect();
    const x = (e.clientX - rect.left - s.panX) / s.zoom;
    const y = (e.clientY - rect.top - s.panY) / s.zoom;
    return { x, y };
  },

  _getPressure(e) {
    if (!this.pressureEnabled) return 0.7;
    if (e.pointerType === 'pen') {
      // Pens report 0..1; treat 0 as "no data" and use 0.5.
      return e.pressure > 0 ? e.pressure : 0.5;
    }
    return 0.7; // Mouse: constant medium pressure
  },

  _handlePointerDown(e) {
    const s = PE.state;
    if (e.button !== 0) return;
    if (PE.zoom.spaceDown) return;
    if (this.activeSection !== 'brush') return;
    if (!s.imageData || !this.activeLayerId) return;

    const { x, y } = this._eventToImageCoord(e);
    if (x < 0 || x >= s.imgWidth || y < 0 || y >= s.imgHeight) return;

    const layer = this._getActiveLayer();
    if (!layer || !layer.visible) return;

    e.preventDefault();
    this._drawing = true;
    this._strokeBefore = layer.ctx.getImageData(0, 0, layer.canvas.width, layer.canvas.height);

    const p = this._getPressure(e);
    this._lastX = x; this._lastY = y; this._lastPressure = p;
    this._drawDab(layer, x, y, p);
    this._composite();

    try { PE.dom.container.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
  },

  _handlePointerMove(e) {
    // Always update the brush preview cursor, even when not drawing.
    this._positionCursor(e);

    if (!this._drawing) return;
    const layer = this._getActiveLayer();
    if (!layer) { this._drawing = false; return; }

    const { x, y } = this._eventToImageCoord(e);
    const p = this._getPressure(e);

    // Interpolate between last and current point with spacing ~= size/4
    const dx = x - this._lastX;
    const dy = y - this._lastY;
    const dist = Math.hypot(dx, dy);
    const spacing = Math.max(1, this.brushSize * 0.2);
    const steps = Math.max(1, Math.ceil(dist / spacing));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const xi = this._lastX + dx * t;
      const yi = this._lastY + dy * t;
      const pi = this._lastPressure + (p - this._lastPressure) * t;
      this._drawDab(layer, xi, yi, pi);
    }
    this._lastX = x; this._lastY = y; this._lastPressure = p;
    this._composite();
  },

  _handlePointerUp(e) {
    if (!this._drawing) return;
    this._drawing = false;

    const layer = this._getActiveLayer();
    if (layer && this._strokeBefore) {
      this.undoStack.push({ layerId: layer.id, before: this._strokeBefore });
      if (this.undoStack.length > this.MAX_UNDO) this.undoStack.shift();
      this.redoStack = [];
      this._updateUndoUI();
    }
    this._strokeBefore = null;

    try { PE.dom.container.releasePointerCapture(e.pointerId); } catch (_) { /* ignore */ }
  },

  _drawDab(layer, x, y, pressure) {
    const size = this.pressureEnabled
      ? Math.max(1, this.brushSize * (0.25 + 0.75 * pressure))
      : this.brushSize;
    const ctx = layer.ctx;
    ctx.save();
    if (this.brushMode === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = '#000';
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = layer.color;
    }
    ctx.beginPath();
    ctx.arc(x, y, size / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  },

  // ---------------------------------------------------------------
  // Undo / Redo (stroke-level, delegated from PE.history)
  // ---------------------------------------------------------------
  onUndo() {
    if (!this.undoStack.length) { PE.log.info('Nothing to undo'); return; }
    const entry = this.undoStack.pop();
    const layer = this.layers.find(l => l.id === entry.layerId);
    if (!layer) { this._updateUndoUI(); return; }
    const after = layer.ctx.getImageData(0, 0, layer.canvas.width, layer.canvas.height);
    this.redoStack.push({ layerId: entry.layerId, before: after });
    layer.ctx.putImageData(entry.before, 0, 0);
    this._updateUndoUI();
    this._composite();
    PE.log.info(`Undo stroke (${this.undoStack.length} remaining)`);
  },

  onRedo() {
    if (!this.redoStack.length) { PE.log.info('Nothing to redo'); return; }
    const entry = this.redoStack.pop();
    const layer = this.layers.find(l => l.id === entry.layerId);
    if (!layer) { this._updateUndoUI(); return; }
    const after = layer.ctx.getImageData(0, 0, layer.canvas.width, layer.canvas.height);
    this.undoStack.push({ layerId: entry.layerId, before: after });
    layer.ctx.putImageData(entry.before, 0, 0);
    this._updateUndoUI();
    this._composite();
    PE.log.info(`Redo stroke (${this.redoStack.length} remaining)`);
  },

  _updateUndoUI() {
    const el = document.getElementById('undo-count');
    if (!el) return;
    const parts = [];
    if (this.undoStack.length) parts.push(`Undo: ${this.undoStack.length}`);
    if (this.redoStack.length) parts.push(`Redo: ${this.redoStack.length}`);
    el.textContent = parts.join(' / ') || 'No history';
  },

  // ---------------------------------------------------------------
  // Panel
  // ---------------------------------------------------------------
  _buildPanelHTML() {
    return `
      <div class="panel-section">
        <div class="panel-section-title selectable" id="mk-pencil-title">
          <i class="fa-solid fa-pencil"></i> Pencil
        </div>
        <div class="panel-row">
          <span class="panel-label">Tint</span>
          <input type="color" class="panel-color-input" id="mk-pencil-tint" value="${this.pencilTint}">
          <span class="color-hex" id="mk-pencil-tint-hex">${this.pencilTint.toUpperCase()}</span>
        </div>
      </div>

      <div class="panel-section">
        <div class="panel-section-title selectable" id="mk-layers-title">
          <i class="fa-solid fa-layer-group"></i> Layers
        </div>
        <div class="layer-list" id="mk-layer-list"></div>
        <div class="panel-row">
          <button class="btn-panel" id="mk-new-layer">
            <i class="fa-solid fa-plus"></i> New Color Layer
          </button>
        </div>
      </div>

      <div class="panel-section">
        <div class="panel-section-title selectable" id="mk-brush-title">
          <i class="fa-solid fa-paintbrush"></i> Brush
        </div>
        <div class="panel-row mk-mode-row">
          <button class="btn-panel mk-mode-btn" id="mk-mode-brush" data-mode="brush">
            <i class="fa-solid fa-paintbrush"></i> Brush
          </button>
          <button class="btn-panel mk-mode-btn" id="mk-mode-eraser" data-mode="eraser">
            <i class="fa-solid fa-eraser"></i> Eraser
          </button>
        </div>
        <div class="panel-row">
          <span class="panel-label">Size</span>
          <input type="range" class="panel-slider" id="mk-size"
                 min="1" max="120" value="${this.brushSize}">
          <span class="panel-slider-value" id="mk-size-val">${this.brushSize}</span>
        </div>
        <div class="panel-row">
          <label class="panel-label" for="mk-pressure" style="cursor:pointer;">Pressure</label>
          <input type="checkbox" class="panel-checkbox" id="mk-pressure" ${this.pressureEnabled ? 'checked' : ''}>
        </div>
      </div>
    `;
  },

  _bindPanelEvents() {
    const tintEl = document.getElementById('mk-pencil-tint');
    const tintHex = document.getElementById('mk-pencil-tint-hex');
    if (tintEl) {
      tintEl.addEventListener('input', (e) => {
        this.pencilTint = e.target.value;
        if (tintHex) tintHex.textContent = this.pencilTint.toUpperCase();
        this._makePencilRender();
        this._composite();
      });
    }

    const newBtn = document.getElementById('mk-new-layer');
    if (newBtn) newBtn.addEventListener('click', () => this._addNextPaletteLayer());

    const sizeEl = document.getElementById('mk-size');
    const sizeVal = document.getElementById('mk-size-val');
    if (sizeEl) {
      sizeEl.addEventListener('input', (e) => {
        this.brushSize = parseInt(e.target.value, 10);
        if (sizeVal) sizeVal.textContent = this.brushSize;
        this._updateCursorSize();
      });
    }

    const pressEl = document.getElementById('mk-pressure');
    if (pressEl) pressEl.addEventListener('change', (e) => { this.pressureEnabled = e.target.checked; });

    document.querySelectorAll('.mk-mode-btn').forEach(btn => {
      btn.addEventListener('click', () => this._setBrushMode(btn.dataset.mode));
    });

    const sectionMap = { pencil: 'mk-pencil-title', layers: 'mk-layers-title', brush: 'mk-brush-title' };
    Object.entries(sectionMap).forEach(([name, id]) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('click', () => this._setActiveSection(name));
    });
  },

  /**
   * Switch which sub-section is active. Only the active section's controls
   * remain interactive (see `.panel-section.disabled` in CSS). Canvas
   * painting is gated on the Brush section being active.
   */
  _setActiveSection(name) {
    this.activeSection = name;
    const map = { pencil: 'mk-pencil-title', layers: 'mk-layers-title', brush: 'mk-brush-title' };
    Object.entries(map).forEach(([key, id]) => {
      const title = document.getElementById(id);
      if (!title) return;
      title.classList.toggle('active', key === name);
      const section = title.closest('.panel-section');
      if (section) section.classList.toggle('disabled', key !== name);
    });
    const container = PE.dom.container;
    if (name === 'brush') {
      container.classList.add('cursor-brush');
      if (this._hovering) this._showCursor();
    } else {
      container.classList.remove('cursor-brush');
      this._hideCursor();
    }
  },

  _setBrushMode(mode) {
    this.brushMode = mode;
    document.querySelectorAll('.mk-mode-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === mode);
    });
    this._updateCursorSize();
  },

  _adjustBrushSize(delta) {
    this.brushSize = Math.max(1, Math.min(120, this.brushSize + delta));
    const sizeEl = document.getElementById('mk-size');
    const sizeVal = document.getElementById('mk-size-val');
    if (sizeEl) sizeEl.value = this.brushSize;
    if (sizeVal) sizeVal.textContent = this.brushSize;
    this._updateCursorSize();
  },

  _renderLayerList() {
    const host = document.getElementById('mk-layer-list');
    if (!host) return;
    if (!this.layers.length) {
      host.innerHTML = '<div class="layer-empty">No layers yet.</div>';
      return;
    }
    // Render top-down for UX (visually the top layer is painted on top).
    // layers[0] is bottom in composite order; render last.
    const rows = [];
    for (let i = this.layers.length - 1; i >= 0; i--) {
      const l = this.layers[i];
      const active = l.id === this.activeLayerId;
      const hiddenCls = l.visible ? '' : ' layer-hidden';
      rows.push(`
        <div class="layer-row${active ? ' active' : ''}${hiddenCls}" data-id="${l.id}">
          <div class="layer-row-top">
            <span class="layer-active-dot" title="Active layer"></span>
            <button class="layer-btn layer-vis" data-act="vis" title="Toggle visibility">
              <i class="fa-solid ${l.visible ? 'fa-eye' : 'fa-eye-slash'}"></i>
            </button>
            <input type="color" class="layer-color" data-act="color" value="${l.color}">
            <span class="layer-hex">${l.color.toUpperCase()}</span>
            <span class="layer-spacer"></span>
            <button class="layer-btn" data-act="up" title="Move up"><i class="fa-solid fa-chevron-up"></i></button>
            <button class="layer-btn" data-act="down" title="Move down"><i class="fa-solid fa-chevron-down"></i></button>
            <button class="layer-btn layer-del" data-act="del" title="Delete layer"><i class="fa-solid fa-trash"></i></button>
          </div>
          <div class="layer-row-bot">
            <span class="panel-label">Opacity</span>
            <input type="range" class="panel-slider" data-act="op"
                   min="0" max="100" value="${Math.round(l.opacity * 100)}">
            <span class="panel-slider-value">${Math.round(l.opacity * 100)}</span>
          </div>
        </div>
      `);
    }
    host.innerHTML = rows.join('');

    // Bind events
    host.querySelectorAll('.layer-row').forEach(row => {
      const id = parseInt(row.dataset.id, 10);
      // Click anywhere on row to activate
      row.addEventListener('click', (e) => {
        if (e.target.closest('[data-act]')) return;
        this.activeLayerId = id;
        this._renderLayerList();
      });
      const vis = row.querySelector('[data-act="vis"]');
      if (vis) vis.addEventListener('click', (e) => { e.stopPropagation(); this._toggleLayerVisible(id); });
      const color = row.querySelector('[data-act="color"]');
      if (color) color.addEventListener('change', (e) => { this._recolorLayer(id, e.target.value); });
      const up = row.querySelector('[data-act="up"]');
      if (up) up.addEventListener('click', (e) => { e.stopPropagation(); this._moveLayer(id, +1); });
      const down = row.querySelector('[data-act="down"]');
      if (down) down.addEventListener('click', (e) => { e.stopPropagation(); this._moveLayer(id, -1); });
      const del = row.querySelector('[data-act="del"]');
      if (del) del.addEventListener('click', (e) => { e.stopPropagation(); this._deleteLayer(id); });
      const op = row.querySelector('[data-act="op"]');
      if (op) op.addEventListener('input', (e) => {
        const v = parseInt(e.target.value, 10);
        this._setLayerOpacity(id, v / 100);
        // Update adjacent value text
        const valEl = e.target.nextElementSibling;
        if (valEl) valEl.textContent = v;
      });
    });
  },

  // ---------------------------------------------------------------
  // Brush preview cursor (DOM element tracking the pointer)
  // ---------------------------------------------------------------
  _createCursor() {
    if (this._cursorEl) return;
    const el = document.createElement('div');
    el.className = 'marker-cursor';
    PE.dom.container.appendChild(el);
    this._cursorEl = el;
    this._updateCursorSize();
  },

  _destroyCursor() {
    if (this._cursorEl) {
      this._cursorEl.remove();
      this._cursorEl = null;
    }
  },

  _showCursor() { if (this._cursorEl) this._cursorEl.classList.add('visible'); },
  _hideCursor() { if (this._cursorEl) this._cursorEl.classList.remove('visible'); },

  _updateCursorSize() {
    if (!this._cursorEl) return;
    const size = Math.max(2, this.brushSize * PE.state.zoom);
    this._cursorEl.style.width  = `${size}px`;
    this._cursorEl.style.height = `${size}px`;
    this._cursorEl.classList.toggle('eraser', this.brushMode === 'eraser');
  },

  _positionCursor(e) {
    if (!this._cursorEl) return;
    const rect = PE.dom.container.getBoundingClientRect();
    this._cursorEl.style.left = `${e.clientX - rect.left}px`;
    this._cursorEl.style.top  = `${e.clientY - rect.top}px`;
  },

  // ---------------------------------------------------------------
  // Utility
  // ---------------------------------------------------------------
  _hexToRgb(hex) {
    const s = hex.replace('#', '');
    const n = parseInt(s.length === 3
      ? s.split('').map(c => c + c).join('')
      : s, 16);
    return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
  },
};
