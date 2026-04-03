/* ============================================================
   zoom.js - Zoom & Pan controls
   ============================================================ */

window.PE = window.PE || {};

PE.zoom = {
  spaceDown: false,

  /**
   * Apply current zoom and pan to both canvases.
   */
  applyTransform() {
    const s = PE.state;
    const t = `translate(${s.panX}px, ${s.panY}px) scale(${s.zoom})`;
    PE.dom.mainCanvas.style.transform = t;
    PE.dom.mainCanvas.style.transformOrigin = '0 0';
    PE.dom.overlayCanvas.style.transform = t;
    PE.dom.overlayCanvas.style.transformOrigin = '0 0';

    const el = document.getElementById('zoom-level');
    if (el) el.textContent = `${Math.round(s.zoom * 100)}%`;
  },

  /**
   * Fit the image into the current viewport with padding.
   */
  fitToView() {
    const s = PE.state;
    if (!s.imgWidth) return;
    const rect = PE.dom.container.getBoundingClientRect();
    const scaleX = (rect.width - 40) / s.imgWidth;
    const scaleY = (rect.height - 40) / s.imgHeight;
    s.zoom = Math.min(scaleX, scaleY, 4);
    s.panX = (rect.width - s.imgWidth * s.zoom) / 2;
    s.panY = (rect.height - s.imgHeight * s.zoom) / 2;
    PE.zoom.applyTransform();
  },

  /**
   * Zoom in by a fixed step, centered on viewport.
   */
  zoomIn() {
    const s = PE.state;
    const rect = PE.dom.container.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    PE.zoom._zoomAt(cx, cy, 1.25);
  },

  /**
   * Zoom out by a fixed step, centered on viewport.
   */
  zoomOut() {
    const s = PE.state;
    const rect = PE.dom.container.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    PE.zoom._zoomAt(cx, cy, 1 / 1.25);
  },

  /**
   * Zoom at a specific viewport point by a given factor.
   */
  _zoomAt(viewX, viewY, factor) {
    const s = PE.state;
    const imgX = (viewX - s.panX) / s.zoom;
    const imgY = (viewY - s.panY) / s.zoom;
    s.zoom = Math.max(0.1, Math.min(64, s.zoom * factor));
    s.panX = viewX - imgX * s.zoom;
    s.panY = viewY - imgY * s.zoom;
    PE.zoom.applyTransform();
  },

  /**
   * Initialize wheel zoom and pan event listeners.
   */
  init() {
    const container = PE.dom.container;

    // Wheel zoom
    container.addEventListener('wheel', (e) => {
      e.preventDefault();
      const rect = container.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const factor = e.deltaY < 0 ? 1.07 : 1 / 1.07;
      PE.zoom._zoomAt(mouseX, mouseY, factor);
    }, { passive: false });

    // Space key for pan mode
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && !e.repeat) {
        PE.zoom.spaceDown = true;
        container.classList.add('cursor-pan');
      }
    });

    document.addEventListener('keyup', (e) => {
      if (e.code === 'Space') {
        PE.zoom.spaceDown = false;
        container.classList.remove('cursor-pan');
      }
    });

    // Mouse pan (middle button or space+drag)
    container.addEventListener('mousedown', (e) => {
      if (e.button === 1 || PE.zoom.spaceDown) {
        const s = PE.state;
        s.isPanning = true;
        s.panStartX = e.clientX;
        s.panStartY = e.clientY;
        s.panStartPanX = s.panX;
        s.panStartPanY = s.panY;
        e.preventDefault();
      }
    });

    window.addEventListener('mousemove', (e) => {
      const s = PE.state;
      if (s.isPanning) {
        s.panX = s.panStartPanX + (e.clientX - s.panStartX);
        s.panY = s.panStartPanY + (e.clientY - s.panStartY);
        PE.zoom.applyTransform();
        return;
      }

      // Update mouse position in status bar
      const rect = container.getBoundingClientRect();
      const imgX = Math.floor((e.clientX - rect.left - s.panX) / s.zoom);
      const imgY = Math.floor((e.clientY - rect.top - s.panY) / s.zoom);
      const el = document.getElementById('cursor-pos');
      const inBounds = imgX >= 0 && imgX < s.imgWidth && imgY >= 0 && imgY < s.imgHeight;
      if (el) {
        el.textContent = inBounds ? `X: ${imgX}  Y: ${imgY}` : '';
      }

      // Notify active tool of hover position
      if (inBounds && s.activeTool && PE.toolRegistry[s.activeTool]) {
        const tool = PE.toolRegistry[s.activeTool];
        if (tool.onCanvasHover) tool.onCanvasHover(imgX, imgY);
      }
    });

    window.addEventListener('mouseup', () => {
      PE.state.isPanning = false;
    });

    // Resize
    window.addEventListener('resize', () => {
      if (PE.state.imgWidth) PE.zoom.fitToView();
    });

    // Prevent context menu
    container.addEventListener('contextmenu', (e) => e.preventDefault());
  },
};
