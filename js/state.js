/* ============================================================
   state.js - Global application state
   ============================================================ */

window.PE = window.PE || {};

PE.MAX_UNDO = 20;

PE.state = {
  // Current active tool id (e.g., 'transparency')
  activeTool: null,

  // Image
  imageData: null,
  imgWidth: 0,
  imgHeight: 0,
  fileName: '',
  fileType: '',
  fileSize: 0,

  // Zoom & Pan
  zoom: 1,
  panX: 0,
  panY: 0,
  isPanning: false,
  panStartX: 0,
  panStartY: 0,
  panStartPanX: 0,
  panStartPanY: 0,

  // History
  undoStack: [],
  redoStack: [],

  // Selection (shared across tools that use selection)
  selectionMask: null,
  borderDist: null,
};
