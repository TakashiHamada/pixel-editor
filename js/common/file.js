/* ============================================================
   file.js - File open / save operations
   ============================================================ */

window.PE = window.PE || {};

PE.file = {
  /**
   * Open an image file via file dialog.
   * Accepts any browser-supported image format. Exports as PNG.
   */
  open() {
    if (PE.state.imageData) return;
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
    PE.file.loadFile(file);
    e.target.value = '';
  },

  /**
   * Update menu bar button states based on whether an image is loaded.
   */
  _updateButtons() {
    const hasImage = !!PE.state.imageData;
    const btnOpen = document.getElementById('btn-open');
    const btnSave = document.getElementById('btn-save');
    const btnClose = document.getElementById('btn-close');
    if (btnOpen) btnOpen.disabled = hasImage;
    if (btnSave) btnSave.disabled = !hasImage;
    if (btnClose) btnClose.disabled = !hasImage;
  },

  /**
   * Format bytes to human-readable string.
   * @param {number} bytes
   * @returns {string}
   */
  _formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  },

  /**
   * Update the image info display in the status bar.
   */
  _updateImageInfo() {
    const el = document.getElementById('image-info');
    if (!el) return;
    const s = PE.state;
    if (!s.imageData) {
      el.textContent = '';
      return;
    }
    let text = `${s.imgWidth} x ${s.imgHeight}`;
    if (s.fileType) text += ` | ${s.fileType}`;
    if (s.fileSize) text += ` | ${PE.file._formatSize(s.fileSize)}`;
    el.textContent = text;
  },

  /**
   * Load an Image object into the editor canvas.
   * @param {HTMLImageElement} img
   * @param {string} name - file name
   * @param {object} [meta] - optional metadata ({ type, size })
   */
  loadImage(img, name, meta) {
    const s = PE.state;
    const mainCanvas = PE.dom.mainCanvas;
    const overlayCanvas = PE.dom.overlayCanvas;
    const mainCtx = PE.dom.mainCtx;

    s.imgWidth = img.width;
    s.imgHeight = img.height;
    s.fileName = name || 'image.png';
    s.fileType = meta && meta.type ? meta.type : '';
    s.fileSize = meta && meta.size ? meta.size : 0;

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
    PE.file._updateImageInfo();
    PE.file._updateButtons();
    PE.log.info(`Opened: ${name} (${img.width} x ${img.height})`);
    PE.file.updateDropGuide();
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
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      s.fileSize = blob.size;
      s.fileType = 'image/png';
      PE.file._updateImageInfo();
      PE.log.success(`Downloaded: ${a.download} (${PE.file._formatSize(blob.size)})`);
    }, 'image/png');
  },

  /**
   * Load an image file from a File object (used by drag & drop).
   * @param {File} file
   */
  loadFile(file) {
    if (!file || !file.type.startsWith('image/')) return;
    const meta = { type: file.type, size: file.size };
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => PE.file.loadImage(img, file.name, meta);
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  },

  /**
   * Show or hide the drop guide based on whether an image is loaded.
   */
  updateDropGuide() {
    const guide = document.getElementById('drop-guide');
    if (guide) {
      guide.classList.toggle('hidden', !!PE.state.imageData);
    }
  },

  /**
   * Initialize drag & drop on the canvas container.
   */
  initDragDrop() {
    const container = PE.dom.container;
    let dragCounter = 0;

    container.addEventListener('dragenter', (e) => {
      e.preventDefault();
      dragCounter++;
      container.classList.add('drag-over');
    });

    container.addEventListener('dragleave', (e) => {
      e.preventDefault();
      dragCounter--;
      if (dragCounter <= 0) {
        dragCounter = 0;
        container.classList.remove('drag-over');
      }
    });

    container.addEventListener('dragover', (e) => {
      e.preventDefault();
    });

    container.addEventListener('drop', (e) => {
      e.preventDefault();
      dragCounter = 0;
      container.classList.remove('drag-over');
      const file = e.dataTransfer.files[0];
      if (file) PE.file.loadFile(file);
    });
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
    s.fileType = '';
    s.fileSize = 0;
    PE.file._updateImageInfo();
    PE.file._updateButtons();
    PE.log.info('Image closed');
    PE.file.updateDropGuide();
  },
};
