# Verification and handoff

## Handoff results

Verified on October 14, 2026 (UTC), with Node 24.19.0:

- `npm test`: 8 tests passed, 0 failed.
- `npm run build`: passed with Vite 7.3.7.
- `npm audit`: 0 known advisories reported for the installed dependency tree.
- Build warning: the editor chunk is approximately 800 KB minified, plus a PDF worker loaded when needed. The marketing page loads separately. Splitting PDF dependencies further is a future performance improvement; the warning does not prevent the build.
- Full browser, visual, touch, and print checks: outstanding, as described below.

## Automated checks

Run `npm ci`, `npm test`, `npm run build`, and `npm audit` from the project root.

Tests cover measurement parsing, pointer mapping with SVG letterboxing, PDF aspect ratio and calibrated sizing, backup validation, landing/pricing links, drawing, Undo/Redo, undoable properties, persistent dimensions, rapid project switching, backup rejection/restoration, PDF page selection, calibration, overlay-free PNG export, actual jsPDF file generation, and project reload from IndexedDB.

Component tests use jsdom and fake IndexedDB. PDF decoding, image rasterization, font asset loading, and canvas drawing are mocked platform operations. The PDF library itself encodes a real tiny PNG into a PDF in the export test. This verifies control flow and output creation; it does **not** prove a real contractor's PDF renders correctly, printed dimensions are correct, or the UI looks right in a browser.

The available preview browser could not open the local app in this environment. Full browser, visual, touch, and print verification remains outstanding. No live deployment was performed. A passing dependency audit is a point-in-time advisory check, not a complete security assessment.

## Before sharing with customers

- Open landing/pricing pages at desktop, tablet, and phone widths. Check for sideways scrolling, hidden content, overlapping controls, keyboard focus, working dialogs, and browser Back.
- Import real JPG, PNG, WebP, single-page and multi-page PDFs. Choose a non-first PDF page. Check portrait/landscape drawings, uncommon PDF fonts, 20–25 MB files, corrupt documents, password-protected PDFs, and oversized files.
- Upload the same file twice. Cancel page selection. Confirm the previous project remains usable.
- Draw, move, resize, rotate, copy/paste, delete, clean, and erase. Undo/Redo each. Edit wall lengths and labels. Pan/zoom and verify cursor alignment, especially on short windows and tablets.
- Calibrate a known distance and measure another known span. Export each sheet size using fit and fixed scale. Print fixed-scale output at **100% / Actual size** and measure with a ruler. Check text, background, dimensions, and door swings. Bad calibration or printer scaling produces wrong measurements.
- Export with the grid on and an object selected. Confirm grid, selection, temporary measurements, and calibration handles are absent. Check Inter labels in actual raster output across browsers.
- Make a last-second edit and immediately switch projects. Reload after saving settles. Restore a backup in a different browser. Confirm both original and restored copy are intact.
- Verify projects from your current app still load on the same origin. Keep backups before migration. If storage is unavailable or malformed, the UI should report it and should not silently overwrite the old archive.
- Test storage denial and quota exhaustion. Verify warnings and backup downloads. Do not promise cloud recovery in this beta.
- On Vercel preview, inspect actual security headers and the browser console. Verify PDF workers and font embedding under production CSP; Vite's development server does not apply `vercel.json` headers.

## Basic security included

- Upload size/raster-dimension limits, supported file types, structural JSON validation, and object/brush-point limits on restored data.
- Embedded PNG/JPEG/WebP backgrounds only for backup restoration; no remote image URLs or SVG payloads through that path.
- React renders labels as text; imported JSON is parsed as data rather than executed.
- PDF.js evaluation disabled for imports; updated locked dependencies.
- Self-hosted fonts/workers; Vercel CSP, framing and MIME-sniffing protection, referrer and permissions policies.
- No API keys, password gate, mock checkout, card entry, or client-side payment entitlement system in this build.

Limits reduce resource use; they are not a full defense against every hostile PDF or decompression bomb. Keep the PDF library patched. Backend access control, rate limiting, quotas, billing security, and recovery must accompany accounts before customer files are stored remotely.
