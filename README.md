# Pixel Editor

A lightweight, browser-based image editor for quick pixel-level edits during game development. No build tools required — open `index.html` in any modern browser.

## Quick Start

```bash
# Any local HTTP server works. Examples:
python3 -m http.server 8000
npx serve .
php -S localhost:8000
```

Or simply open `index.html` directly in a browser.

## Features

### Common
- **Open / Download / Close** — load images (file dialog or drag & drop), export as PNG
- **Undo / Redo** — up to 20 levels (`Ctrl+Z` / `Ctrl+Shift+Z`)
- **Zoom** — mouse wheel or `Ctrl+=`/`Ctrl+-`, fit to view with `0`
- **Pan** — `Space + Drag` or middle mouse button
- **Keyboard Shortcuts** — press `?` to view all (two-column modal: common + active tool)
- **Status Bar** — image info, log (click to copy), cursor position, zoom level, undo count

### Transparency Tool
Remove background colors from sprites and game assets:

1. **Extract Background Color** (`E`) — click to pick the background color. Live preview as you hover.
2. **Select Region** (`S`) — flood-fill select. Hold `Shift` to add to selection.
3. **Make Transparent** (`Delete`) — removes the background with anti-aliased edge handling.

Parameters:
- **Tolerance** (1–100): color similarity threshold for selection
- **Border** (0–10): feathered edge expansion for smooth transitions

## Architecture

```
pixel-editor/
├── index.html                 # Layout, modals, script loading
├── css/
│   └── style.css              # Dark red theme (CSS custom properties)
├── js/
│   ├── state.js               # PE.state — global shared state
│   ├── app.js                 # Boot, tool registry, keyboard shortcuts
│   ├── common/
│   │   ├── file.js            # Open, save, close, drag & drop
│   │   ├── history.js         # Undo / redo stack
│   │   ├── zoom.js            # Zoom, pan, cursor tracking
│   │   └── ui.js              # Log, loading, shortcuts modal, selection overlay
│   └── tools/
│       └── transparency.js    # Transparency removal tool
├── img/
│   └── favicon.svg            # Pixel grid + crosshair favicon
├── CLAUDE.md                  # AI development guide & UI preferences
└── README.md
```

Script loading order: `state.js → common/* → tools/* → app.js`

## Global Namespace

All code lives under `window.PE`:

| Module | Description |
|---|---|
| `PE.state` | Shared application state |
| `PE.dom` | Cached DOM references (container, canvases, contexts) |
| `PE.file` | File I/O and drag & drop |
| `PE.history` | Undo / redo |
| `PE.zoom` | Zoom, pan, viewport |
| `PE.log` | Status bar logging (`info`, `success`, `warn`, `error`) |
| `PE.overlay` | Selection overlay animation |
| `PE.loading` | Loading spinner |
| `PE.shortcuts` | Shortcuts modal |
| `PE.tools.*` | Tool implementations |
| `PE.toolRegistry` | Registered tools map |
| `PE.registerTool(tool)` | Register a new tool |
| `PE.activateTool(id)` | Activate a tool by ID |

## Adding a New Tool

Create `js/tools/my-tool.js`:

```javascript
window.PE = window.PE || {};
PE.tools = PE.tools || {};

PE.tools.myTool = {
  id: 'my-tool',
  label: 'My Tool',
  icon: 'fa-wand-magic',
  description: 'What this tool does.',

  activate() {
    const panel = document.getElementById('left-panel');
    panel.innerHTML = '...';  // Build your panel UI
    panel.classList.add('visible');
  },

  deactivate() {
    const panel = document.getElementById('left-panel');
    panel.classList.remove('visible');
    panel.innerHTML = '';
  },

  onCanvasClick(imgX, imgY, event) { /* pixel click */ },
  onCanvasHover(imgX, imgY) { /* mouse move (optional) */ },
  onDelete() { /* Delete key pressed (optional) */ },
  onKeydown(e) { /* tool-specific keys (optional) */ },

  getShortcutsHTML() {
    return `
      <div class="modal-title"><i class="fa-solid fa-wand-magic"></i> My Tool</div>
      <p class="tool-description">${this.description}</p>
      <ul class="shortcut-list">
        <li><span class="shortcut-desc">Action</span> <span class="shortcut-key">Key</span></li>
      </ul>
    `;
  },
};
```

Then in `index.html` add `<script src="js/tools/my-tool.js"></script>` before `app.js`, and in `app.js` add `PE.registerTool(PE.tools.myTool)`. The tool button appears automatically.

## UI Components

Panel sections for tool UIs:

```html
<div class="panel-section">
  <div class="panel-section-title">
    <i class="fa-solid fa-icon"></i> Section Title
  </div>
  <!-- Clickable mode title: add class "selectable", toggles "active" -->
  <div class="panel-section-title selectable active" id="my-mode">
    <i class="fa-solid fa-icon"></i> Mode Name
  </div>
  <div class="panel-row">
    <span class="panel-label">Label</span>
    <input type="range" class="panel-slider" min="0" max="100" value="50">
    <span class="panel-slider-value">50</span>
  </div>
  <div class="panel-row">
    <button class="btn-panel">Button</button>
  </div>
  <div class="panel-row">
    <button class="btn-panel btn-action btn-compact">Centered Action</button>
  </div>
</div>
```

## Image Data Access

```javascript
const s = PE.state;
const idx = (y * s.imgWidth + x) * 4;
const [r, g, b, a] = [
  s.imageData.data[idx],
  s.imageData.data[idx + 1],
  s.imageData.data[idx + 2],
  s.imageData.data[idx + 3],
];
// After modifying pixels:
PE.dom.mainCtx.putImageData(s.imageData, 0, 0);
```

## Keyboard Shortcuts

| Key | Action |
|---|---|
| `Ctrl+O` | Open file |
| `Ctrl+S` | Download file |
| `Ctrl+Z` | Undo |
| `Ctrl+Shift+Z` | Redo |
| `Ctrl+=` / `Ctrl+-` | Zoom in / out |
| `Scroll` | Zoom at cursor |
| `0` | Fit to view |
| `Space+Drag` | Pan |
| `?` | Show shortcuts |
| `E` | Eyedropper mode * |
| `S` | Select mode * |
| `Shift+Click` | Add to selection * |
| `Delete` | Make transparent * |

\* Tool-specific (Transparency tool)

## Theme

Dark red, Photoshop-inspired. Colors defined as CSS custom properties in `:root`:

- `--accent: #8b2020` — primary accent
- `--accent-hover: #a52a2a` — hover
- `--accent-active: #c03030` — active / pressed
- `--bg-darkest` through `--bg-lighter` — background levels
- `--text-primary`, `--text-secondary`, `--text-muted` — text hierarchy

## Dependencies

- [Font Awesome 6.5](https://fontawesome.com/) (CDN)
- No build tools, no frameworks, no other dependencies

## Browser Support

Chrome 80+, Firefox 78+, Edge 80+, Safari 14+

## Development

See `CLAUDE.md` for AI development guide, architecture details, and UI/UX preferences.
