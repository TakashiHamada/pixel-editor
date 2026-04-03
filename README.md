# Pixel Editor

A lightweight, browser-based image editor designed for quick pixel-level edits during game development. Built as a single-page application with no build tools required.

## Quick Start

Open `index.html` in any modern browser (Chrome, Firefox, Edge, Safari). If loading from `file://` causes CORS issues with scripts, use any local HTTP server:

```bash
# Python
python3 -m http.server 8000

# Node.js
npx serve .

# PHP
php -S localhost:8000
```

## Features

### Common Features
- **Open / Save** - Load images and save as PNG (preserves transparency)
- **Undo / Redo** - Up to 20 levels of history (`Ctrl+Z` / `Ctrl+Shift+Z`)
- **Zoom** - Mouse wheel or `Ctrl+=`/`Ctrl+-`, fit to view with `0`
- **Pan** - `Space + Drag` or middle mouse button
- **Keyboard Shortcuts** - Press `?` to view all shortcuts
- **Status Bar** - Log messages, zoom level, undo/redo count, cursor position

### Transparency Tool
Remove background colors from sprites and game assets:

1. **Extract** - Use the eyedropper (`E`) to pick the background color
2. **Select** - Click to flood-fill select a region (`S`). Hold `Shift` to add to selection
3. **Make Transparent** - Apply transparency removal (`Delete`)

Adjustable parameters:
- **Tolerance** (1-100): How similar a pixel color must be to be included in selection
- **Border Width** (0-10): Feathered edge expansion around selected area

## Architecture

```
pixel-editor/
├── index.html              # Main HTML (layout, modals, script loading)
├── css/
│   └── style.css           # All styles (dark red Photoshop-like theme)
├── js/
│   ├── state.js            # Global state object (PE.state)
│   ├── app.js              # Main init, tool registry, keyboard shortcuts
│   ├── common/
│   │   ├── file.js         # File open/save operations
│   │   ├── history.js      # Undo/redo stack management
│   │   ├── zoom.js         # Zoom, pan, viewport controls
│   │   └── ui.js           # Log, loading overlay, shortcuts modal, selection overlay
│   └── tools/
│       └── transparency.js # Transparency removal tool
├── CLAUDE.md               # AI development guide
└── README.md               # This file
```

## Adding a New Tool

Tools are self-contained modules registered via `PE.registerTool()`. To add a new tool:

### 1. Create the tool file

Create `js/tools/my-tool.js`:

```javascript
window.PE = window.PE || {};
PE.tools = PE.tools || {};

PE.tools.myTool = {
  // Required properties
  id: 'my-tool',           // Unique identifier
  label: 'My Tool',        // Display name in menu bar
  icon: 'fa-magic',        // Font Awesome icon class

  // Called when tool is activated via menu bar
  activate() {
    const panel = document.getElementById('left-panel');
    panel.innerHTML = '<div class="panel-section">...</div>';
    panel.classList.add('visible');
    // Bind panel events...
  },

  // Called when switching to another tool
  deactivate() {
    const panel = document.getElementById('left-panel');
    panel.classList.remove('visible');
    panel.innerHTML = '';
  },

  // Called when user clicks on the canvas
  onCanvasClick(imgX, imgY, event) {
    // imgX, imgY = pixel coordinates in the image
    // event = original MouseEvent (check event.shiftKey, etc.)
  },
};
```

### 2. Add the script tag

In `index.html`, add before `app.js`:

```html
<script src="js/tools/my-tool.js"></script>
```

### 3. Register the tool

In `js/app.js`, inside the `DOMContentLoaded` handler, add:

```javascript
PE.registerTool(PE.tools.myTool);
```

The tool will automatically appear in the menu bar center section.

## Global Namespace

All code lives under the `window.PE` namespace:

| Path | Description |
|------|-------------|
| `PE.state` | Global application state (image data, zoom, history, etc.) |
| `PE.dom` | Cached DOM element references |
| `PE.file` | File open/save operations |
| `PE.history` | Undo/redo management |
| `PE.zoom` | Zoom/pan controls |
| `PE.log` | Logging system (`info`, `success`, `warn`, `error`) |
| `PE.overlay` | Selection overlay drawing (marching ants) |
| `PE.loading` | Loading spinner show/hide |
| `PE.shortcuts` | Shortcuts modal |
| `PE.tools.*` | Individual tool implementations |
| `PE.toolRegistry` | Map of registered tools |
| `PE.registerTool()` | Register a new tool |
| `PE.activateTool()` | Activate a tool by ID |

## Accessing Image Data

```javascript
const s = PE.state;

// Image dimensions
s.imgWidth, s.imgHeight

// Raw pixel data (Uint8ClampedArray, RGBA format)
s.imageData.data

// Get pixel color at (x, y)
const idx = (y * s.imgWidth + x) * 4;
const r = s.imageData.data[idx];
const g = s.imageData.data[idx + 1];
const b = s.imageData.data[idx + 2];
const a = s.imageData.data[idx + 3];

// After modifying imageData, update the canvas:
PE.dom.mainCtx.putImageData(s.imageData, 0, 0);
```

## UI Components for Tool Panels

Use these CSS classes when building tool panels:

```html
<div class="panel-section">
  <div class="panel-section-title">
    <i class="fa-solid fa-icon"></i> Section Title
  </div>
  <div class="panel-row">
    <span class="panel-label">Label</span>
    <input type="range" class="panel-slider" min="0" max="100" value="50">
    <span class="panel-slider-value">50</span>
  </div>
  <div class="panel-row">
    <button class="btn-panel">Normal Button</button>
  </div>
  <div class="panel-row">
    <button class="btn-panel btn-action">Primary Action</button>
  </div>
</div>
```

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Ctrl+O` | Open file |
| `Ctrl+S` | Save file |
| `Ctrl+Z` | Undo |
| `Ctrl+Shift+Z` | Redo |
| `Ctrl+=` | Zoom in |
| `Ctrl+-` | Zoom out |
| `Scroll` | Zoom at cursor |
| `0` | Fit to view |
| `Space+Drag` | Pan |
| `E` | Eyedropper mode |
| `S` | Select mode |
| `Shift+Click` | Add to selection |
| `Delete` | Make transparent |
| `?` | Show shortcuts |

## Theme

The editor uses a dark red theme inspired by Adobe Photoshop. Theme colors are defined as CSS custom properties in `css/style.css` under `:root`. Key variables:

- `--accent`: Primary accent color (dark red `#8b2020`)
- `--accent-hover`: Hover state
- `--accent-active`: Active/pressed state
- `--bg-darkest` to `--bg-lighter`: Background gradient levels
- `--text-primary`, `--text-secondary`, `--text-muted`: Text colors

## Dependencies

- [Font Awesome 6.5](https://fontawesome.com/) (loaded via CDN) - icons
- No other external dependencies
- No build tools required

## Browser Support

Modern browsers with Canvas API and ES6+ support:
- Chrome 80+
- Firefox 78+
- Edge 80+
- Safari 14+

## Development Rules

- Before each commit, update the `#build-info` timestamp in `index.html` to JST. See `CLAUDE.md` for details.
