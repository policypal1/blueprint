# Blueprint Studio

A browser-based 2D blueprint/floor-plan editor MVP built for repeatedly editing residential plans.

## What works

- Import JPG / PNG / WEBP blueprints
- Import the first page of a PDF blueprint
- Draw measured walls with snapping and 15-degree angle constraints
- Select and drag objects
- Add doors, windows, dimensions, text, toilets, sinks, showers, beds, and water-heater symbols
- Brush-erase imported blueprint content non-destructively
- Rectangle "Clean Area" masking
- Blueprint opacity toggle
- Calibrate an imported drawing by clicking two known points and entering the real distance in inches
- Edit an exact wall length numerically
- Undo / redo
- Autosave projects to IndexedDB (handles imported blueprint images much better than localStorage)
- Multiple local projects
- Export PNG
- Export 11x17 landscape PDF (fit-to-page raster export)
- JSON backup export and restore
- Sample blueprint included

## Run locally

```bash
npm install
npm run dev
```

Open the local Vite URL.

## Build / deploy

```bash
npm run build
```

Deploy the generated project to Vercel. Vercel detects Vite automatically in most cases; if asked, use `npm run build` and output directory `dist`.

## Important production note

This is a working drafting MVP, not a structural engineering or code-compliance system. Before using it as the only tool for permit submissions, test the exact workflow Zach uses, verify required sheet sizes/scales, and add any jurisdiction-specific notes, title blocks, elevations, structural sheets, or other permit-set requirements.

The PDF exporter currently fits the drawing to an 11x17 page. Geometry and displayed dimensions remain based on the calibrated drawing, but the exporter does not yet guarantee a specific architectural print scale such as 1/4\" = 1'-0\". That should be the next production feature if exact printed scale is required.
