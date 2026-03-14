# PDF Editor Pro — Copilot Instructions

## Project Overview

**PDF Editor Pro** is a browser-based PDF editing application built with **Vite + React**. Users can upload PDFs, add/resize/drag images, add/edit/drag text overlays, and download the modified PDF with all edits baked in.

### Key Features

- Upload and render PDFs (via PDF.js)
- Add images from file or **Ctrl+V** clipboard paste
- Drag and resize images freely on the PDF page
- Add text boxes with adjustable font size and bold toggle
- Drag text to reposition; double-click to edit
- Page navigation (arrow buttons + keyboard arrows)
- Download edited PDF with all overlays embedded (via pdf-lib)
- Session storage persistence for overlay data

---

## Tech Stack

| Tool | Purpose |
|---|---|
| Vite 7.x | Build tool / dev server |
| React 19.x | UI framework |
| pdfjs-dist | PDF rendering on canvas |
| pdf-lib | PDF modification & export |
| react-rnd | Drag & resize for overlays |
| lucide-react | Icon library |
| file-saver | Trigger file downloads |

---

## Folder Structure

```
pdf-editor-pro/
├── index.html                    # Entry HTML (loads /src/main.jsx)
├── vite.config.js                # Vite config (chunk splitting, optimizeDeps)
├── package.json                  # Dependencies & scripts
├── eslint.config.js              # ESLint config
├── public/
│   └── vite.svg                  # Favicon
├── src/
│   ├── main.jsx                  # React root mount
│   ├── index.css                 # Global CSS variables & reset
│   ├── App.jsx                   # Main app — state, PDF loading, overlay CRUD, clipboard paste, keyboard shortcuts
│   ├── App.css                   # Layout styles (editor area, empty state, loading, page indicator)
│   ├── assets/
│   │   └── react.svg             # Default React logo (unused)
│   ├── components/
│   │   ├── PdfViewer.jsx         # Renders a single PDF page on <canvas> via PDF.js; auto-scales to container
│   │   ├── ImageOverlay.jsx      # Draggable + resizable image overlay (react-rnd); delete button
│   │   ├── TextOverlay.jsx       # Draggable + resizable text overlay; inline editing, bold, font size
│   │   ├── Toolbar.jsx           # Top toolbar — upload, add image/text, font controls, page nav, download, clear
│   │   └── Toolbar.css           # Toolbar styles
│   ├── hooks/
│   │   └── useSessionStorage.js  # Custom hook — persists overlay data per page in sessionStorage
│   └── utils/
│       └── pdfExport.js          # Exports edited PDF — embeds images (png/jpg) and text into pages via pdf-lib
└── dist/                         # Production build output (gitignored)
```

---

## File Responsibilities

### `src/App.jsx`
- Central state management (no external state library)
- PDF loading via `pdfjs-dist`
- Manages overlays per page: `{ [pageIndex]: { images: [], texts: [] } }`
- Clipboard paste handler (`Ctrl+V` for images)
- Keyboard shortcuts (arrow keys for page navigation)
- Calls `exportPdfWithEdits()` on download

### `src/components/PdfViewer.jsx`
- Receives `pdfDoc` (PDF.js document) and `pageIndex`
- Renders the page onto a `<canvas>` element
- Auto-scales to fit the container while capping at 2x
- Reports rendered dimensions back via `onDimensionsReady` callback
- Re-renders on window resize

### `src/components/ImageOverlay.jsx`
- Wraps an `<img>` in a `<Rnd>` component for drag + resize
- Bounded to parent container (the PDF canvas area)
- Delete button positioned at top-right corner
- Updates parent state on drag/resize stop

### `src/components/TextOverlay.jsx`
- Wraps a text area / div in a `<Rnd>` component
- Drag handle on the left side (grip icon)
- Double-click to enter edit mode; Enter to confirm
- Supports `fontSize` and `bold` properties
- Delete button at top-right

### `src/components/Toolbar.jsx` + `Toolbar.css`
- Top bar with all controls grouped by function
- Upload (file input), Add Image, Add Text
- Font size +/- buttons, Bold toggle
- Page prev/next with current page display
- Clear page, Download buttons
- Clipboard paste hint at the right end

### `src/hooks/useSessionStorage.js`
- Stores overlays as JSON in `sessionStorage` under key `pdf-editor-pro-overlays`
- Provides `getPageOverlays(pageIndex)`, `setPageOverlays(pageIndex, data)`, `clearAll()`
- Auto-syncs to sessionStorage on every change

### `src/utils/pdfExport.js`
- `exportPdfWithEdits(originalPdfBytes, overlaysByPage, pageDimensions)` → `Uint8Array`
- Loads original PDF with pdf-lib
- Iterates each page, scales overlay coordinates from render-space to PDF-space
- Embeds PNG/JPG images, draws text with Helvetica/Helvetica-Bold
- Returns the modified PDF bytes

---

## Scripts

```bash
npm run dev       # Start Vite dev server (default port 5173)
npm run build     # Production build to dist/
npm run preview   # Preview production build
npm run lint      # Run ESLint
```

---

## CSS Theming

Global CSS variables are defined in `src/index.css`:

```
--bg-primary:   #1a1a2e
--bg-secondary: #16213e
--bg-surface:   #0f3460
--accent:       #e94560
--accent-hover: #ff6b81
--text-primary: #eee
--text-secondary: #aaa
--border:       #2a2a4a
--toolbar-bg:   #16213e
```

---

## Important Patterns

- **Overlay coordinate system**: Overlays are positioned in CSS pixels relative to the rendered canvas. On export, coordinates are scaled to PDF points using `pdfWidth / renderWidth` ratios.
- **No external state library**: All state lives in `App.jsx` and is passed down as props.
- **Session storage**: Only overlay positions/content are stored. The PDF binary itself is NOT stored in session storage (too large).
- **PDF.js worker**: Configured via `import.meta.url` to resolve the worker file from `pdfjs-dist/build/pdf.worker.mjs`.
