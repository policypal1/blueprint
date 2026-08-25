# Blueprint Studio V4

Browser-based 2D floor-plan editor for creating and modifying residential blueprints.

## Run locally

```bash
npm install
npm run dev
```

## Deploy to Vercel

This ZIP is **GitHub-root ready** for the current `policypal1/blueprint` repository. Upload/replace the files directly in the repository root. Vercel should detect Vite and run `npm run build`.

## V4 controls

- **Automatic drawing order:** walls render behind doors/windows; fixtures and text render above openings.
- **Door/window openings:** doors and windows visually mask the wall underneath them instead of being buried by it.
- **Wall drawing:** angle lock + magnetic wall-end/edge snapping. Starting a new wall on top of another wall no longer lets that starting wall pull the new wall off-axis.
- **Shift while drawing a wall:** free precision mode.
- **Wall resize:** select a wall and drag either blue endpoint. Drag the white side handle to change thickness.
- **Exact wall dimensions:** select a wall and type an exact length or thickness in Properties.
- **Measure:** drag between any two points to see the real distance using the current blueprint scale. This is temporary and is not added to the drawing.
- **Window size:** windows have editable width and height/wall-depth and a 2D resize handle.
- **Fixtures:** select and drag the blue bottom-right handle to resize.
- **Rotate:** select a door, window, or fixture and press **R**.
- **Copy / Paste:** select an object, then use **Ctrl/Cmd+C** and **Ctrl/Cmd+V**.
- **Brush erase:** adjustable brush size.
- **Clean area:** destructive cleanup. It permanently whites out that area of the imported blueprint and cuts/removes added walls and objects inside the box. Undo restores the previous state.
- **Zoom:** 25% through 300%.
- **Set blueprint scale:** click two known points, then enter their real distance in inches.
- **Undo / Redo:** Ctrl/Cmd+Z and Ctrl/Cmd+Y.
- **Delete:** Delete/Backspace.

## Included fixture set

Toilet, sink, shower, bathtub, bed, water heater, and washer/dryer (WD), plus windows and six door styles.

Project data autosaves in IndexedDB in the browser. Use JSON backups for portable copies.
