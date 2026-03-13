# PDF Editor Pro

A web-based PDF editor built with React that lets you upload PDFs, add text and image overlays, and export the edited PDF with all modifications embedded.

## Features

- **PDF Upload & Viewing** — Load any PDF and render it in the browser
- **Multi-Page Navigation** — Browse pages with prev/next controls
- **Text Overlays** — Add draggable, resizable text boxes with font size (8–72px) and bold styling
- **Image Overlays** — Add images from file or clipboard (Ctrl+V), with crop support via edge handles
- **Zoom Controls** — Manual zoom (0.25x–5x), fit-to-screen, and Ctrl+Scroll zoom
- **PDF Export** — Download the edited PDF with all overlays permanently baked in
- **Session Persistence** — Overlays survive page refreshes via sessionStorage

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | React 19 |
| Build Tool | Vite 7 |
| PDF Rendering | pdfjs-dist |
| PDF Editing | pdf-lib |
| Drag & Resize | react-rnd |
| Icons | lucide-react |
| File Download | file-saver |

## Getting Started

### Prerequisites

- Node.js 18+
- npm

### Installation

```bash
cd pdf-editor-pro
npm install
```

### Development

```bash
npm run dev
```

### Production Build

```bash
npm run build
npm run preview
```

## Project Structure

```
pdf-editor-pro/
├── src/
│   ├── App.jsx              # Main app state and layout
│   ├── components/
│   │   ├── Toolbar.jsx      # Upload, zoom, font, export controls
│   │   ├── PdfViewer.jsx    # Canvas-based PDF renderer
│   │   ├── TextOverlay.jsx  # Draggable/resizable text boxes
│   │   └── ImageOverlay.jsx # Draggable/resizable images with crop
│   ├── hooks/
│   │   └── useSessionStorage.js  # Session persistence hook
│   └── utils/
│       └── pdfExport.js     # Export overlays into PDF via pdf-lib
├── index.html
├── vite.config.js
└── package.json
```

## License

See [LICENSE](LICENSE).
