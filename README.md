# Blueprint Studio

Browser-based 2D blueprint editor built with React + Vite.

## Current features

- Upload PNG/JPG/WebP/PDF blueprints
- Erase or clean areas on imported plans
- Draw walls without automatic wall-length markings
- Dimension tool, text, lines, rectangles, and ellipses
- Six door types: single-left, single-right, double, pocket, sliding, bifold
- Improved architectural window symbol with rotation
- Resizable fixtures and objects: toilet, sink, shower, bathtub, vanity, bed, water heater, washer/dryer, cabinet, refrigerator, range, sofa, stairs
- Exact wall length and wall thickness editing
- Object rotation controls and 90-degree quick rotation
- Undo / redo
- Clear-all with confirmation and undo support
- Scale calibration
- Local IndexedDB autosave
- Multiple local projects
- JSON backup/restore
- PNG and 11x17 PDF export

## Run locally

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

Vite outputs the production site to `dist/`.

## Deploy to Vercel

Vercel should auto-detect Vite. Standard settings are:

- Framework preset: Vite
- Build command: `npm run build`
- Output directory: `dist`

No environment variables are required for this local-storage version.

## Important

This is a drafting/editor tool. It does not certify code compliance, engineering adequacy, or permit approval.
