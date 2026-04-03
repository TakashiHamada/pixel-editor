/* ============================================================
   transparency.js - Transparency Tool

   Workflow:
   1. Extract background color (eyedropper)
   2. Select region (flood fill with tolerance + border expansion)
   3. Make transparent (remove background color)

   Supports Shift+click for additive selection.
   ============================================================ */

window.PE = window.PE || {};
PE.tools = PE.tools || {};

PE.tools.transparency = {
  id: 'transparency',
  label: 'Transparency',
  icon: 'fa-eraser',

  description: 'Remove background colors from sprites and game assets. '
    + 'Extract a background color with the eyedropper, select a region by flood-fill, '
    + 'then apply transparency. Supports tolerance and border feathering for clean edges.',

  /**
   * Return HTML for the right column of the shortcuts modal.
   */
  getShortcutsHTML() {
    return `
      <div class="modal-title">
        <i class="fa-solid fa-eraser"></i> Transparency Tool
      </div>
      <p class="tool-description">${this.description}</p>
      <ul class="shortcut-list">
        <li><span class="shortcut-desc">Eyedropper mode</span> <span class="shortcut-key">E</span></li>
        <li><span class="shortcut-desc">Select mode</span> <span class="shortcut-key">S</span></li>
        <li><span class="shortcut-desc">Add to selection</span> <span class="shortcut-key">Shift + Click</span></li>
        <li><span class="shortcut-desc">Make transparent</span> <span class="shortcut-key">Delete</span></li>
      </ul>
    `;
  },

  // Tool-specific state
  bgColor: null,
  tolerance: 32,
  borderRadius: 4,
  subTool: 'eyedropper', // 'eyedropper' | 'select'

  /**
   * Called when this tool is activated.
   */
  activate() {
    const panel = document.getElementById('left-panel');
    panel.innerHTML = this._buildPanelHTML();
    panel.classList.add('visible');
    this._bindPanelEvents();
    this._updateColorDisplay();
    this._setSubTool(this.subTool);
  },

  /**
   * Called when this tool is deactivated.
   */
  deactivate() {
    const panel = document.getElementById('left-panel');
    panel.classList.remove('visible');
    panel.innerHTML = '';
  },

  /**
   * Handle canvas click.
   * @param {number} imgX - pixel X coordinate
   * @param {number} imgY - pixel Y coordinate
   * @param {MouseEvent} e - original mouse event
   */
  /**
   * Called on mouse move over canvas. Preview color under cursor in eyedropper mode.
   */
  onCanvasHover(imgX, imgY) {
    if (this.subTool !== 'eyedropper') return;
    const s = PE.state;
    if (!s.imageData) return;
    const d = s.imageData.data;
    const idx = (imgY * s.imgWidth + imgX) * 4;
    const r = d[idx], g = d[idx + 1], b = d[idx + 2];
    const hex = '#' + [r, g, b].map(c => c.toString(16).padStart(2, '0')).join('').toUpperCase();
    const preview = document.getElementById('tool-color-preview');
    const hexEl = document.getElementById('tool-color-hex');
    if (preview) preview.style.background = hex;
    if (hexEl) hexEl.textContent = hex;
  },

  onCanvasClick(imgX, imgY, e) {
    if (this.subTool === 'eyedropper') {
      this._pickColor(imgX, imgY);
    } else if (this.subTool === 'select') {
      this._floodFillSelect(imgX, imgY, e.shiftKey);
    }
  },

  _updateMakeTransparentButton() {
    const btn = document.getElementById('tool-make-transparent');
    if (btn) {
      btn.disabled = !PE.state.selectionMask;
    }
  },

  // ---- Panel HTML ----
  _buildPanelHTML() {
    return `
      <div class="panel-section">
        <div class="panel-section-title selectable" id="tool-eyedropper">
          <i class="fa-solid fa-eye-dropper"></i> Extract Background Color
        </div>
        <div class="panel-row">
          <span class="panel-label">Fill Color</span>
          <div class="color-preview" id="tool-color-preview"></div>
          <span class="color-hex" id="tool-color-hex">#FFFFFF</span>
        </div>
      </div>

      <div class="panel-section">
        <div class="panel-section-title selectable" id="tool-select">
          <i class="fa-solid fa-vector-square"></i> Select Region
        </div>
        <div class="panel-row">
          <span class="panel-label">Tolerance</span>
          <input type="range" class="panel-slider" id="tool-tolerance"
                 min="1" max="100" value="${this.tolerance}">
          <span class="panel-slider-value" id="tool-tolerance-val">${this.tolerance}</span>
        </div>
        <div class="panel-row">
          <span class="panel-label">Border</span>
          <input type="range" class="panel-slider" id="tool-border"
                 min="0" max="10" value="${this.borderRadius}">
          <span class="panel-slider-value" id="tool-border-val">${this.borderRadius}</span>
        </div>
        <div class="panel-row">
          <button class="btn-panel btn-action btn-compact" id="tool-make-transparent" disabled>
            <i class="fa-solid fa-eraser"></i> Make Transparent
          </button>
        </div>
      </div>
    `;
  },

  _bindPanelEvents() {
    const self = this;

    // Sub-tool buttons
    document.getElementById('tool-eyedropper').addEventListener('click', () => {
      self._setSubTool('eyedropper');
    });
    document.getElementById('tool-select').addEventListener('click', () => {
      self._setSubTool('select');
    });

    // Sliders
    document.getElementById('tool-tolerance').addEventListener('input', (e) => {
      self.tolerance = parseInt(e.target.value);
      document.getElementById('tool-tolerance-val').textContent = self.tolerance;
    });
    document.getElementById('tool-border').addEventListener('input', (e) => {
      self.borderRadius = parseInt(e.target.value);
      document.getElementById('tool-border-val').textContent = self.borderRadius;
    });

    // Make transparent
    document.getElementById('tool-make-transparent').addEventListener('click', () => {
      self._makeTransparent();
    });
  },

  _setSubTool(name) {
    this.subTool = name;
    const container = PE.dom.container;
    container.classList.remove('cursor-crosshair', 'cursor-eyedropper');

    const eyeTitle = document.getElementById('tool-eyedropper');
    const selTitle = document.getElementById('tool-select');

    if (name === 'eyedropper') {
      container.classList.add('cursor-eyedropper');
      if (eyeTitle) eyeTitle.classList.add('active');
      if (selTitle) selTitle.classList.remove('active');
    } else {
      container.classList.add('cursor-crosshair');
      if (selTitle) selTitle.classList.add('active');
      if (eyeTitle) eyeTitle.classList.remove('active');
    }
  },

  _updateColorDisplay() {
    const preview = document.getElementById('tool-color-preview');
    const hexEl = document.getElementById('tool-color-hex');
    if (!this.bgColor) {
      if (preview) preview.style.background = 'transparent';
      if (hexEl) hexEl.textContent = '---';
      return;
    }
    const hex = '#' + this.bgColor.map(c => c.toString(16).padStart(2, '0')).join('').toUpperCase();
    if (preview) preview.style.background = hex;
    if (hexEl) hexEl.textContent = hex;
  },

  // ---- Eyedropper ----
  _pickColor(x, y) {
    const s = PE.state;
    const d = s.imageData.data;
    const idx = (y * s.imgWidth + x) * 4;
    this.bgColor = [d[idx], d[idx + 1], d[idx + 2]];
    this._updateColorDisplay();
    const hex = '#' + this.bgColor.map(c => c.toString(16).padStart(2, '0')).join('').toUpperCase();
    PE.log.info(`Picked color: ${hex}`);
    // Auto-switch to select mode after picking
    this._setSubTool('select');
  },

  // ---- Flood Fill Selection ----
  _floodFillSelect(startX, startY, additive) {
    PE.loading.show();

    setTimeout(() => {
      const s = PE.state;
      const w = s.imgWidth;
      const h = s.imgHeight;
      const d = s.imageData.data;
      const tolerance = this.tolerance;

      // Start with existing mask if additive (Shift held)
      let mask;
      if (additive && s.selectionMask) {
        mask = new Uint8Array(s.selectionMask);
        // Clear border pixels (2) but keep interior (1)
        for (let i = 0; i < mask.length; i++) {
          if (mask[i] === 2) mask[i] = 0;
        }
      } else {
        mask = new Uint8Array(w * h);
      }

      // Color at start point
      const startIdx = (startY * w + startX) * 4;
      const startR = d[startIdx];
      const startG = d[startIdx + 1];
      const startB = d[startIdx + 2];

      function colorDistance(idx) {
        const dr = d[idx] - startR;
        const dg = d[idx + 1] - startG;
        const db = d[idx + 2] - startB;
        return Math.sqrt(dr * dr + dg * dg + db * db);
      }

      // Scanline flood fill
      const visited = new Uint8Array(w * h);
      // Mark already-selected pixels as visited to avoid re-processing
      if (additive) {
        for (let i = 0; i < mask.length; i++) {
          if (mask[i]) visited[i] = 1;
        }
      }

      const stack = [[startX, startY]];
      if (!visited[startY * w + startX]) {
        visited[startY * w + startX] = 1;
        mask[startY * w + startX] = 1;
      }

      while (stack.length > 0) {
        const [sx, sy] = stack.pop();
        let left = sx;
        while (left > 0) {
          const ni = sy * w + (left - 1);
          const pi = ni * 4;
          if (visited[ni] || colorDistance(pi) > tolerance) break;
          left--;
          visited[ni] = 1;
          mask[ni] = 1;
        }
        let right = sx;
        while (right < w - 1) {
          const ni = sy * w + (right + 1);
          const pi = ni * 4;
          if (visited[ni] || colorDistance(pi) > tolerance) break;
          right++;
          visited[ni] = 1;
          mask[ni] = 1;
        }
        for (let x = left; x <= right; x++) {
          if (sy > 0) {
            const ni = (sy - 1) * w + x;
            if (!visited[ni] && colorDistance(ni * 4) <= tolerance) {
              visited[ni] = 1;
              mask[ni] = 1;
              stack.push([x, sy - 1]);
            }
          }
          if (sy < h - 1) {
            const ni = (sy + 1) * w + x;
            if (!visited[ni] && colorDistance(ni * 4) <= tolerance) {
              visited[ni] = 1;
              mask[ni] = 1;
              stack.push([x, sy + 1]);
            }
          }
        }
      }

      // Border expansion
      const BORDER_RADIUS = this.borderRadius;
      let expandedMask;
      let borderDist;

      if (BORDER_RADIUS > 0) {
        expandedMask = new Uint8Array(mask);
        borderDist = new Float32Array(w * h);

        const queue = [];
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            if (mask[y * w + x]) continue;
            let adj = false;
            if (x > 0 && mask[y * w + x - 1]) adj = true;
            if (x < w - 1 && mask[y * w + x + 1]) adj = true;
            if (y > 0 && mask[(y - 1) * w + x]) adj = true;
            if (y < h - 1 && mask[(y + 1) * w + x]) adj = true;
            if (!adj) continue;
            expandedMask[y * w + x] = 2;
            borderDist[y * w + x] = 1;
            queue.push([x, y, 1]);
          }
        }

        let qi = 0;
        while (qi < queue.length) {
          const [cx, cy, dist] = queue[qi++];
          if (dist >= BORDER_RADIUS) continue;
          const nextDist = dist + 1;
          const neighbors = [[cx-1,cy],[cx+1,cy],[cx,cy-1],[cx,cy+1]];
          for (const [nx, ny] of neighbors) {
            if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
            const ni = ny * w + nx;
            if (expandedMask[ni]) continue;
            expandedMask[ni] = 2;
            borderDist[ni] = nextDist;
            queue.push([nx, ny, nextDist]);
          }
        }
      } else {
        expandedMask = new Uint8Array(mask);
        borderDist = new Float32Array(w * h);
      }

      s.selectionMask = expandedMask;
      s.borderDist = borderDist;

      PE.overlay.drawSelection(expandedMask, borderDist, BORDER_RADIUS);
      PE.loading.hide();

      let count = 0;
      for (let i = 0; i < expandedMask.length; i++) {
        if (expandedMask[i]) count++;
      }
      PE.log.info(`${count} pixels selected` + (additive ? ' (added)' : ''));
      this._updateMakeTransparentButton();
    }, 10);
  },

  // ---- Make Transparent ----
  _makeTransparent() {
    const s = PE.state;
    if (!s.imageData || !s.selectionMask) {
      PE.log.warn('Select a region first');
      return;
    }
    if (!this.bgColor) {
      PE.log.warn('Extract a background color first');
      return;
    }

    PE.loading.show();
    setTimeout(() => {
      PE.history.pushUndo();
      this._applyTransparency();
      PE.loading.hide();
    }, 10);
  },

  _applyTransparency() {
    const s = PE.state;
    const w = s.imgWidth;
    const h = s.imgHeight;
    const d = s.imageData.data;
    const mask = s.selectionMask;
    const borderDist = s.borderDist;
    const borderRadius = this.borderRadius;
    const bg = this.bgColor;

    function bgDistance(r, g, b) {
      const dr = r - bg[0];
      const dg = g - bg[1];
      const db = b - bg[2];
      return Math.sqrt(dr * dr + dg * dg + db * db) / (255 * Math.sqrt(3));
    }

    function unpremultiply(channel, bgChannel, alpha) {
      if (alpha < 0.001) return 0;
      return Math.round(Math.min(255, Math.max(0,
        (channel - bgChannel * (1 - alpha)) / alpha
      )));
    }

    // Pass 1: Main transparency
    for (let i = 0; i < mask.length; i++) {
      if (!mask[i]) continue;
      const pi = i * 4;
      const r = d[pi], g = d[pi+1], b = d[pi+2], a = d[pi+3];
      if (a === 0) continue;
      const dist = bgDistance(r, g, b);

      if (mask[i] === 1) {
        const newAlpha = Math.round(dist * a);
        if (newAlpha < 1) {
          d[pi] = 0; d[pi+1] = 0; d[pi+2] = 0; d[pi+3] = 0;
        } else {
          const alphaF = newAlpha / 255;
          d[pi]   = unpremultiply(r, bg[0], alphaF);
          d[pi+1] = unpremultiply(g, bg[1], alphaF);
          d[pi+2] = unpremultiply(b, bg[2], alphaF);
          d[pi+3] = newAlpha;
        }
      } else if (mask[i] === 2 && borderRadius > 0) {
        const edgeDist = borderDist[i];
        const edgeFactor = 1.0 - ((edgeDist - 1) / borderRadius);
        const newAlpha = Math.round((1.0 - (1.0 - dist) * edgeFactor) * a);
        if (newAlpha < 1) {
          d[pi] = 0; d[pi+1] = 0; d[pi+2] = 0; d[pi+3] = 0;
        } else {
          const alphaF = newAlpha / 255;
          const upR = unpremultiply(r, bg[0], alphaF);
          const upG = unpremultiply(g, bg[1], alphaF);
          const upB = unpremultiply(b, bg[2], alphaF);
          d[pi]   = Math.round(upR * edgeFactor + r * (1 - edgeFactor));
          d[pi+1] = Math.round(upG * edgeFactor + g * (1 - edgeFactor));
          d[pi+2] = Math.round(upB * edgeFactor + b * (1 - edgeFactor));
          d[pi+3] = newAlpha;
        }
      }
    }

    // Pass 2: Defringe
    const DEFRINGE_PASSES = 3;
    for (let pass = 0; pass < DEFRINGE_PASSES; pass++) {
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          const i = y * w + x;
          if (!mask[i]) continue;
          const pi = i * 4;
          const a = d[pi + 3];
          if (a === 0) continue;
          const r = d[pi], g = d[pi+1], b = d[pi+2];
          const dist = bgDistance(r, g, b);
          const bgSim = 1.0 - dist;
          if (bgSim < 0.15) continue;

          let transparentCount = 0;
          let lowAlphaSum = 0;
          let neighborCount = 0;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (dx === 0 && dy === 0) continue;
              const ni = (y + dy) * w + (x + dx);
              const na = d[ni * 4 + 3];
              neighborCount++;
              if (na === 0) transparentCount++;
              lowAlphaSum += (255 - na);
            }
          }

          const transparencyRatio = transparentCount / neighborCount;
          const avgTransparency = lowAlphaSum / (neighborCount * 255);
          if (transparentCount === 0 && avgTransparency < 0.1) continue;

          const aggressiveness = bgSim * (0.3 + 0.7 * Math.max(transparencyRatio, avgTransparency));
          if (aggressiveness > 0.08) {
            const alphaReduction = Math.round(aggressiveness * a * 0.6);
            const correctedAlpha = Math.max(0, a - alphaReduction);
            if (correctedAlpha < 2) {
              d[pi] = 0; d[pi+1] = 0; d[pi+2] = 0; d[pi+3] = 0;
            } else {
              const newAlphaF = correctedAlpha / 255;
              d[pi]   = unpremultiply(r, bg[0], newAlphaF);
              d[pi+1] = unpremultiply(g, bg[1], newAlphaF);
              d[pi+2] = unpremultiply(b, bg[2], newAlphaF);
              d[pi+3] = correctedAlpha;
            }
          }
        }
      }
    }

    // Pass 3: Isolated pixel cleanup
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        if (!mask[i]) continue;
        const pi = i * 4;
        const a = d[pi + 3];
        if (a === 0) continue;
        const r = d[pi], g = d[pi+1], b = d[pi+2];
        const bgSim = 1.0 - bgDistance(r, g, b);
        if (bgSim < 0.3) continue;

        let opaqueNeighborCount = 0;
        let darkerNeighborCount = 0;
        let totalNeighborBgSim = 0;

        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const ni = (y + dy) * w + (x + dx);
            const na = d[ni * 4 + 3];
            if (na > 0) {
              opaqueNeighborCount++;
              const nBgSim = 1.0 - bgDistance(d[ni*4], d[ni*4+1], d[ni*4+2]);
              totalNeighborBgSim += nBgSim;
              if (nBgSim < bgSim - 0.1) darkerNeighborCount++;
            }
          }
        }

        if (opaqueNeighborCount === 0) continue;
        const avgNeighborBgSim = totalNeighborBgSim / opaqueNeighborCount;

        if (bgSim - avgNeighborBgSim > 0.15 || darkerNeighborCount >= 3) {
          const excess = bgSim - avgNeighborBgSim;
          const reduction = Math.min(1.0, excess * 2 + 0.3) * bgSim;
          const correctedAlpha = Math.max(0, Math.round(a * (1.0 - reduction)));
          if (correctedAlpha < 2) {
            d[pi] = 0; d[pi+1] = 0; d[pi+2] = 0; d[pi+3] = 0;
          } else {
            const newAlphaF = correctedAlpha / 255;
            d[pi]   = unpremultiply(r, bg[0], newAlphaF);
            d[pi+1] = unpremultiply(g, bg[1], newAlphaF);
            d[pi+2] = unpremultiply(b, bg[2], newAlphaF);
            d[pi+3] = correctedAlpha;
          }
        }
      }
    }

    // Update canvas and clear selection
    PE.dom.mainCtx.putImageData(s.imageData, 0, 0);
    s.selectionMask = null;
    s.borderDist = null;
    PE.overlay.clear();
    PE.log.success('Transparency applied');
    this._updateMakeTransparentButton();
  },
};
