/* ============================================================
   history.js - Undo / Redo management
   ============================================================ */

window.PE = window.PE || {};

PE.history = {
  /**
   * Push current imageData onto undo stack (before making changes).
   * Clears redo stack since a new action invalidates redo history.
   */
  pushUndo() {
    const s = PE.state;
    if (!s.imageData) return;

    const copy = new ImageData(
      new Uint8ClampedArray(s.imageData.data),
      s.imgWidth,
      s.imgHeight
    );
    s.undoStack.push(copy);
    if (s.undoStack.length > PE.MAX_UNDO) {
      s.undoStack.shift();
    }
    // New action clears redo
    s.redoStack = [];
    PE.history.updateUI();
  },

  /**
   * Undo: restore previous state and push current to redo stack.
   * If the active tool implements its own onUndo, delegate to it.
   */
  undo() {
    const s = PE.state;
    const tool = PE.toolRegistry && PE.toolRegistry[s.activeTool];
    if (tool && tool.onUndo) { tool.onUndo(); return; }
    if (s.undoStack.length === 0) return;

    // Save current to redo
    const current = new ImageData(
      new Uint8ClampedArray(s.imageData.data),
      s.imgWidth,
      s.imgHeight
    );
    s.redoStack.push(current);

    // Restore previous
    const prev = s.undoStack.pop();
    PE.history._restore(prev);
    PE.log.info(`Undo (${s.undoStack.length} remaining)`);
  },

  /**
   * Redo: restore next state and push current to undo stack.
   * If the active tool implements its own onRedo, delegate to it.
   */
  redo() {
    const s = PE.state;
    const tool = PE.toolRegistry && PE.toolRegistry[s.activeTool];
    if (tool && tool.onRedo) { tool.onRedo(); return; }
    if (s.redoStack.length === 0) return;

    // Save current to undo
    const current = new ImageData(
      new Uint8ClampedArray(s.imageData.data),
      s.imgWidth,
      s.imgHeight
    );
    s.undoStack.push(current);

    // Restore next
    const next = s.redoStack.pop();
    PE.history._restore(next);
    PE.log.info(`Redo (${s.redoStack.length} remaining)`);
  },

  /**
   * Restore an ImageData snapshot, resizing the canvases if the dimensions changed.
   */
  _restore(snap) {
    const s = PE.state;
    s.imageData = snap;
    s.imgWidth = snap.width;
    s.imgHeight = snap.height;
    if (PE.dom.mainCanvas.width !== snap.width || PE.dom.mainCanvas.height !== snap.height) {
      PE.dom.mainCanvas.width = snap.width;
      PE.dom.mainCanvas.height = snap.height;
      PE.dom.overlayCanvas.width = snap.width;
      PE.dom.overlayCanvas.height = snap.height;
    }
    PE.dom.mainCtx.putImageData(s.imageData, 0, 0);
    s.selectionMask = null;
    s.borderDist = null;
    PE.overlay.clear();
    PE.file._updateImageInfo();
    PE.history.updateUI();
  },

  /**
   * Update the status bar undo/redo display.
   */
  updateUI() {
    const s = PE.state;
    const el = document.getElementById('undo-count');
    if (el) {
      const parts = [];
      if (s.undoStack.length > 0) parts.push(`Undo: ${s.undoStack.length}`);
      if (s.redoStack.length > 0) parts.push(`Redo: ${s.redoStack.length}`);
      el.textContent = parts.join(' / ') || 'No history';
    }
  },
};
