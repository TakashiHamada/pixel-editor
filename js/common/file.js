/* ============================================================
   file.js - File open / save operations
   ============================================================ */

window.PE = window.PE || {};

PE.file = {
  /**
   * Open an image file via file dialog.
   * Accepted formats: PNG (preserves transparency).
   */
  open() {
    const input = document.getElementById('file-input');
    input.click();
  },

  /**
   * Handle file selection from <input>.
   * @param {Event} e - change event from file input
   */
  handleFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        PE.file.loadImage(img, file.name);
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  },

  /**
   * Load an Image object into the editor canvas.
   * @param {HTMLImageElement} img
   * @param {string} name - file name
   */
  loadImage(img, name) {
    const s = PE.state;
    const mainCanvas = PE.dom.mainCanvas;
    const overlayCanvas = PE.dom.overlayCanvas;
    const mainCtx = PE.dom.mainCtx;

    s.imgWidth = img.width;
    s.imgHeight = img.height;
    s.fileName = name || 'image.png';

    mainCanvas.width = img.width;
    mainCanvas.height = img.height;
    overlayCanvas.width = img.width;
    overlayCanvas.height = img.height;

    mainCtx.clearRect(0, 0, img.width, img.height);
    mainCtx.drawImage(img, 0, 0);
    mainCanvas.classList.add('has-image');

    s.imageData = mainCtx.getImageData(0, 0, img.width, img.height);
    s.selectionMask = null;
    s.borderDist = null;
    s.undoStack = [];
    s.redoStack = [];

    PE.history.updateUI();
    PE.overlay.clear();
    PE.zoom.fitToView();
    PE.log.info(`Opened: ${name} (${img.width} x ${img.height})`);
  },

  /**
   * Save / download the current image as PNG.
   */
  save() {
    const s = PE.state;
    if (!s.imageData) {
      PE.log.warn('No image loaded');
      return;
    }

    const mainCanvas = PE.dom.mainCanvas;
    mainCanvas.toBlob((blob) => {
      if (!blob) {
        PE.log.error('Save failed');
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      // Use original filename with _edited suffix
      const baseName = s.fileName.replace(/\.[^.]+$/, '');
      a.download = `${baseName}_edited.png`;
      a.click();
      URL.revokeObjectURL(url);
      PE.log.success('Saved: ' + a.download);
    }, 'image/png');
  },

  /**
   * Close the current image and reset the editor.
   */
  close() {
    const s = PE.state;
    if (!s.imageData) return;

    s.imageData = null;
    s.imgWidth = 0;
    s.imgHeight = 0;
    s.fileName = '';
    s.selectionMask = null;
    s.borderDist = null;
    s.undoStack = [];
    s.redoStack = [];

    const mainCanvas = PE.dom.mainCanvas;
    const overlayCanvas = PE.dom.overlayCanvas;
    const mainCtx = PE.dom.mainCtx;

    mainCtx.clearRect(0, 0, mainCanvas.width, mainCanvas.height);
    mainCanvas.width = 0;
    mainCanvas.height = 0;
    overlayCanvas.width = 0;
    overlayCanvas.height = 0;
    mainCanvas.classList.remove('has-image');

    PE.history.updateUI();
    PE.overlay.clear();
    PE.log.info('Image closed');
  },
};
