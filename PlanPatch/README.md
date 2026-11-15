# PlanPatch frontend beta

A refreshed version of `policypal1/blueprint`, based on commit `679effc`.
This package contains normal React, JavaScript, CSS, HTML, and configuration files.
There is no BAT file, generated installer, backend, payment collection, or password gate.

## Start here

1. Download backups of important drawings from your current app and keep a copy of your repository.
2. Extract the ZIP and open the `PlanPatch` folder. For a local preview, run the commands below in the folder containing `package.json`.
3. Use Node.js **22.12 or newer**:

```bash
npm ci
npm run dev
```

4. Open the localhost URL printed by Vite. **Open editor** takes you to Recent plans, where **Upload a plan** starts a new drawing. **Try a sample plan** opens the editable Oak St. Remodel.
5. Before deploying, run:

```bash
npm test
npm run build
npm run preview
```

For your existing Vercel project, use the Vite framework preset, `npm run build`, and output directory `dist`. Select Node 22 or 24. No environment variables are required for this beta. The included `vercel.json` sets basic browser security headers. This handoff does not push to GitHub or deploy your live site.

Opening `index.html` directly by double-clicking is not supported; Vite builds and serves this app.

## What changed

- A short landing page with an interactive plan comparison and a link straight into the editable example.
- A separate pricing page: proposed **$15 per project for 30 days**, or **$29/month** for regular use. Both buttons open the free beta. There is no checkout, credit meter, expiration enforcement, or hidden paywall.
- Charcoal toolbars, an orange action color, and warm drawing surfaces. The phone toolbar groups View, Edit, and Measure. Edit puts walls, doors, and fixtures within thumb reach. Desktop shows the full palette beside the drawing.
- On a phone, choose **Edit → Wall** and tap each endpoint. **Cancel** clears the first endpoint before a wall is placed. On desktop, drag to draw a wall.
- Returning to PlanPatch opens Recent plans. Open any plan saved in this browser, or upload a PDF or image as a separate plan.
- Password removal from the active application. `Root.jsx` routes the marketing pages and lazy-loads the editor.
- Safer project switching and autosave, honest save-failure messages, portable JSON backups and restoration, and a reusable sample project.
- Undo for property changes, persistent dimension rendering, better measurement input parsing, pointer capture, and corrected pointer coordinates when the viewport adds margins around the drawing.
- PDF page selection, import limits, non-destructive background cleanup, and calibrated scale handling.
- PDF export that preserves proportions, three sheet sizes, fixed drawing scales with fit checks, a 3200 × 2000 PNG export, embedded drawing fonts, and removal of editing overlays from downloads.
- Updated dependencies, input validation, security headers, and automated regression checks.

## Files you will edit most often

| File                   | Purpose                                            |
| ---------------------- | -------------------------------------------------- |
| `Marketing.jsx`        | Landing and pricing copy; `PRICING` values         |
| `styles.css`           | Shared design system and responsive layouts        |
| `PlanIllustration.jsx` | Original marketing illustration                    |
| `App.jsx`              | Editor interactions, geometry, imports and exports |
| `EditorControls.jsx`   | Phone toolbar and door and fixture choices         |
| `RecentPlans.jsx`      | Saved plan list and upload entry point              |
| `editor-core.js`       | Validation, measurements, coordinates, PDF layout  |
| `useProjectStore.js`   | Local IndexedDB saving and loading                 |
| `ui.jsx`               | Icons, brand and dialogs                           |
| `Root.jsx`             | Page routing                                       |
| `export-font.js`       | Embedding Inter in exported drawings               |
| `sample-project.js`    | Editable demonstration project                     |
| `vercel.json`          | Hosting security headers                           |

## Older files in your repository

The old `ProductApp.jsx`, `productServices.js`, `product.config.js`, `launch.css`, `editor-polish.js`, `editor-polish.css`, `auth.js`, `env.example`, `README-LAUNCH.md`, and `COPY-INSTRUCTIONS.txt` are not part of this build and are omitted from this ZIP. After replacing the current entry point, those old files are unused and can be removed. Do not reconnect the old mock account or payment screens. If you added an `api/auth` endpoint separately, remove that obsolete endpoint when publishing the public beta.

## What this beta actually does

PDFs and images become a raster background. You can mask details and draw new editable objects over it. Importing a PDF does **not** automatically turn its original walls into CAD objects. Advanced JSON import accepts explicitly structured editable geometry. PDF output is raster-based, not CAD/vector output. Dimensions use inches and feet.

Projects stay in IndexedDB in the current browser and origin. Existing storage keys are retained. Clearing browser data, switching domains/devices, private browsing, or storage limits can affect access. Download backups regularly. Avoid editing from multiple tabs; cross-tab conflict handling is not implemented. There is no cloud sync, account recovery, team sharing, or server backup yet.

The security measures cover the static beta. They do not substitute for backend authorization, secure payments, or a security review. Read `ROADMAP.md` before introducing accounts or billing.

See `TESTING.md` for what passed and the real-browser checks still required. This is not a promise of zero bugs or a production-readiness certification.
