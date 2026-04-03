# CLAUDE.md - AI Development Guide

## Commit Rules

Before every commit, update the `#build-info` element's timestamp in `index.html` to JST:

```html
<span id="build-info">Last commit: YYYY-MM-DD HH:MM JST</span>
```

Get current JST:
```bash
TZ=Asia/Tokyo date '+%Y-%m-%d %H:%M JST'
```

## Language

- **UI text**: English
- **Conversation with the user**: Japanese
- **Code comments / documentation**: English

## Architecture Overview

This is a modular, single-page pixel editor. All code lives under `window.PE` namespace.

```
index.html          ← Layout, modals, script loading order
css/style.css       ← All styles, theme via CSS custom properties
js/state.js         ← PE.state (global shared state)
js/common/ui.js     ← PE.log, PE.shortcuts, PE.overlay, PE.loading
js/common/file.js   ← PE.file (open, save, close, drag-drop)
js/common/history.js← PE.history (undo/redo)
js/common/zoom.js   ← PE.zoom (zoom, pan, mouse tracking)
js/tools/*.js       ← Self-contained tools registered via PE.registerTool()
js/app.js           ← Boot, tool registry, keyboard shortcuts (load last)
```

Script loading order matters: `state → common/* → tools/* → app`.

## Adding a New Tool

1. Create `js/tools/my-tool.js`
2. Add `<script>` in index.html before `app.js`
3. Call `PE.registerTool(PE.tools.myTool)` in `app.js`

Required tool interface:
```javascript
PE.tools.myTool = {
  id: 'my-tool',
  label: 'My Tool',
  icon: 'fa-icon-name',       // Font Awesome class
  description: '...',          // Shown in shortcuts modal

  activate()                   // Called when tool becomes active
  deactivate()                 // Called when switching away
  onCanvasClick(imgX, imgY, e) // Canvas click at image pixel coords
  onCanvasHover(imgX, imgY)    // Mouse move over image (optional)
  onDelete()                   // Delete/Backspace pressed (optional)
  onKeydown(e)                 // Tool-specific key handling (optional)
  getShortcutsHTML()           // Returns HTML for shortcuts modal right column
};
```

## Key Design Decisions

- **Single HTML entry point** — no build tools, open in browser directly
- **Tool isolation** — tools own their left panel entirely (build/destroy on activate/deactivate)
- **Cursor management** — tools set CSS classes on `#canvas-container` (`cursor-eyedropper`, `cursor-crosshair`); ID-level default is `cursor: default` so class selectors win
- **Button states** — buttons reflect availability (Open disabled when image loaded, Download/Close disabled when no image, Make Transparent disabled when no selection)

## Owner's UI/UX Preferences

These preferences were established through iterative review sessions. Follow them closely when making UI changes.

### Visual Theme
- **Dark professional aesthetic** inspired by Adobe Photoshop
- **Theme color: dark red** (`--accent: #8b2020`). All highlights, active states, and accents must use this palette
- Text on the interface should be **all English**
- Use **Font Awesome** for all icons (loaded via CDN)

### Layout Philosophy
- **Top menu bar**: minimal — only file actions (left), tool selector (center), shortcuts button (right)
- **Left panel**: appears per-tool. Sections flow **top-to-bottom matching workflow order**. Section titles can be **clickable toggle buttons** when they represent modes (e.g., Extract vs Select)
- **Bottom status bar**: image info + log (left), cursor/zoom/undo/commit time (right)
- **No floating overlays** — all persistent info belongs in the status bar or panels
- Undo/Redo/Zoom buttons are **NOT shown** — they are keyboard-shortcut-only. Shortcuts modal documents them

### Interaction Feedback
- **Confirmation flash**: When an action is confirmed (e.g., color picked), the relevant row should flash briefly using the **macOS-style double blink** (0.25s, no fade — snap on/off twice)
- **Live preview**: Values that can be previewed should update in real-time as the cursor moves (e.g., eyedropper color preview follows mouse)
- **Auto-advance workflow**: After completing a step, auto-switch to the next logical mode (e.g., after picking color → switch to select mode)
- **Disabled states**: Buttons that cannot be used in the current state must appear disabled (grayed out). Never leave actionless buttons looking clickable

### Selection Visualization
- Selected regions are overlaid with **vivid red** (rgb(200, 40, 40)) fill that **pulses** between 50% and 100% opacity on a **1.2s sine wave cycle**
- Border/feathered zones fade proportionally
- No marching ants, no jittery animations — the pulsing must feel **calm and professional**

### Cursors
- Use **browser-native cursors** (no custom SVG cursors): `pointer` for extract/eyedropper, `crosshair` for select
- Pan mode uses `grab`/`grabbing`

### Panel Components
- **Sliders**: value labels must not overflow — use `flex-shrink: 0` with enough `min-width`
- **Color previews**: keep small (20px), not oversized
- **Spacing**: panels should feel **spacious, not cramped** — generous padding and row margins
- **Compact action buttons**: important actions like "Make Transparent" use `btn-compact` (auto-width, centered with `margin: 0 auto`)

### Responsiveness to Feedback
The owner iterates quickly on visual details:
- Animation timings (flash speed, pulse rate)
- Text visibility (contrast, size)
- Element proportions (too big/too small)
- Layout alignment (centering, spacing)

When making UI changes, err on the side of **subtlety and restraint**. Over-designed or flashy effects will be rejected. The aesthetic is professional, clean, and functional.

### Shortcuts Modal
- **Two columns**: common shortcuts (left) and active tool shortcuts + description (right)
- Right column is **dynamically populated** from the active tool's `getShortcutsHTML()` method
- Divider line between columns

### Status Bar
- Log messages are **clickable** (copies to clipboard)
- Shows: image info (dimensions, format, file size) | log | cursor pos | zoom | undo count | last commit time

### File Operations
- Drag & drop loading with a centered guide when no image is loaded
- Open is disabled when an image is already loaded (must Close first)
- Download/Close are disabled when no image is loaded
