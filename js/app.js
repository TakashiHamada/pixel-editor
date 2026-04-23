/* ============================================================
   app.js - Main application initialization & keyboard shortcuts

   This is the entry point that wires everything together.
   ============================================================ */

window.PE = window.PE || {};

// ============================================================
// Tool Registry
// ============================================================
PE.toolRegistry = {};

/**
 * Register a tool so it appears in the menu bar.
 * @param {object} tool - tool object with id, label, icon, activate(), deactivate(), onCanvasClick()
 */
PE.registerTool = function(tool) {
  PE.toolRegistry[tool.id] = tool;
};

/**
 * Activate a tool by id.
 * @param {string} toolId
 */
PE.activateTool = function(toolId) {
  const s = PE.state;

  // Let the current tool veto the switch (e.g. Marker with unsaved layers).
  const current = s.activeTool && PE.toolRegistry[s.activeTool];
  if (current && current.canDeactivate && !current.canDeactivate()) {
    // User declined; keep current tool highlighted.
    document.querySelectorAll('.btn-tool').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.toolId === s.activeTool);
    });
    return;
  }

  // Deactivate current tool
  if (current) current.deactivate();

  // Update menu bar buttons
  document.querySelectorAll('.btn-tool').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.toolId === toolId);
  });

  s.activeTool = toolId;
  const tool = PE.toolRegistry[toolId];
  if (tool) {
    tool.activate();
    PE.log.info(`Tool: ${tool.label}`);
  }
  // Download button label depends on active tool's saveFormat
  PE.file._updateButtons();
};

// ============================================================
// DOM References (cached after DOMContentLoaded)
// ============================================================
PE.dom = {};

// ============================================================
// Boot
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  // Cache DOM refs
  PE.dom.container = document.getElementById('canvas-container');
  PE.dom.mainCanvas = document.getElementById('main-canvas');
  PE.dom.overlayCanvas = document.getElementById('overlay-canvas');
  PE.dom.mainCtx = PE.dom.mainCanvas.getContext('2d', { willReadFrequently: true });
  PE.dom.overlayCtx = PE.dom.overlayCanvas.getContext('2d');

  // Initialize common systems
  PE.zoom.init();
  PE.shortcuts.init();
  PE.log.init();
  PE.file.initDragDrop();
  PE.file._updateButtons();
  PE.history.updateUI();

  // File input listener
  document.getElementById('file-input').addEventListener('change', PE.file.handleFileSelect);

  // Menu bar buttons
  document.getElementById('btn-open').addEventListener('click', () => PE.file.open());
  document.getElementById('btn-save').addEventListener('click', () => PE.file.save());
  document.getElementById('btn-close').addEventListener('click', () => PE.file.close());
  document.getElementById('btn-shortcuts').addEventListener('click', () => PE.shortcuts.show());

  // Register tools
  PE.registerTool(PE.tools.transparency);
  PE.registerTool(PE.tools.scanner);
  PE.registerTool(PE.tools.marker);

  // Build tool buttons in menu bar center
  const center = document.getElementById('menubar-center');
  Object.values(PE.toolRegistry).forEach(tool => {
    const btn = document.createElement('button');
    btn.className = 'btn btn-tool';
    btn.dataset.toolId = tool.id;
    btn.innerHTML = `<i class="fa-solid ${tool.icon}"></i> ${tool.label}`;
    btn.addEventListener('click', () => PE.activateTool(tool.id));
    center.appendChild(btn);
  });

  // Canvas click handler (delegates to active tool)
  PE.dom.container.addEventListener('click', (e) => {
    const s = PE.state;
    if (s.isPanning || e.button !== 0 || PE.zoom.spaceDown) return;
    if (!s.imageData) return;
    if (!s.activeTool || !PE.toolRegistry[s.activeTool]) return;

    const rect = PE.dom.container.getBoundingClientRect();
    const imgX = Math.floor((e.clientX - rect.left - s.panX) / s.zoom);
    const imgY = Math.floor((e.clientY - rect.top - s.panY) / s.zoom);

    if (imgX < 0 || imgX >= s.imgWidth || imgY < 0 || imgY >= s.imgHeight) return;

    PE.toolRegistry[s.activeTool].onCanvasClick(imgX, imgY, e);
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // Don't capture if typing in an input
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    // Undo: Ctrl+Z
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'z') {
      e.preventDefault();
      PE.history.undo();
      return;
    }

    // Redo: Ctrl+Shift+Z or Ctrl+Y
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'Z') {
      e.preventDefault();
      PE.history.redo();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
      e.preventDefault();
      PE.history.redo();
      return;
    }

    // Zoom: Ctrl+ +/- or = for zoom in
    if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+')) {
      e.preventDefault();
      PE.zoom.zoomIn();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === '-') {
      e.preventDefault();
      PE.zoom.zoomOut();
      return;
    }

    // Fit to view: 0
    if (e.key === '0' && !e.ctrlKey && !e.metaKey) {
      PE.zoom.fitToView();
      return;
    }

    // Open: Ctrl+O
    if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
      e.preventDefault();
      PE.file.open();
      return;
    }

    // Save: Ctrl+S
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      PE.file.save();
      return;
    }

    // Delete / Backspace: delegate to active tool's action
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      const tool = PE.toolRegistry[PE.state.activeTool];
      if (tool && tool.onDelete) tool.onDelete();
      return;
    }

    // Shortcuts help: ?
    if (e.key === '?') {
      PE.shortcuts.toggle();
      return;
    }

    // Delegate remaining keys to active tool
    const tool = PE.toolRegistry[PE.state.activeTool];
    if (tool && tool.onKeydown) tool.onKeydown(e);
  });

  // Activate default tool
  PE.activateTool('transparency');

  PE.log.info('Pixel Editor ready');
});
