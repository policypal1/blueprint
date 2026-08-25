# Blueprint Studio V3

A browser-based 2D floor-plan editor for creating and modifying residential blueprints.

## Run locally

```bash
npm install
npm run dev
```

## Deploy to Vercel

This ZIP is intentionally **GitHub-root ready** for the current `policypal1/blueprint` repository. Upload the files directly to the repository root. Vercel should detect Vite automatically and run `npm run build`.

## V3 controls

- **Wall:** normal drawing uses angle/grid snapping plus stronger magnetic snapping to existing wall endpoints and edges.
- **Shift while drawing a wall:** precision mode. It turns off angle/grid presets while keeping useful wall magnet snapping. The live exact length appears in the top status bar, not on the plan.
- **Exact wall length:** select a wall and enter either `106` or `8' 10"` in Properties.
- **Resize:** select a fixture, window, or door and drag its blue resize handle.
- **Rotate:** select a fixture, window, or door and press **R** to rotate 90 degrees.
- **Brush erase:** select Brush erase, then change brush size with the slider in the left panel.
- **Set blueprint scale:** click two known points on an imported plan, then enter their real distance in inches.
- **Undo / Redo:** Ctrl/Cmd+Z and Ctrl/Cmd+Y.
- **Delete:** select an object and press Delete/Backspace.

## Included fixture set

Toilet, sink, shower, bathtub, bed, water heater, and washer/dryer (WD), plus windows and six door styles.

Project data autosaves in IndexedDB in the browser. Use JSON backups for portable copies.
