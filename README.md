# Blueprint Studio V9

Browser-based blueprint editor for remodeling and floor-plan revisions.

## Password
The built-in password is:

`1234`

This version intentionally keeps the password in the frontend code. There is no `api` folder, no `auth.js`, and no Vercel environment variable setup.

The app remembers the unlock only for the current browser session. Click **Lock** to require the password again immediately.

## GitHub / Vercel structure
Everything stays directly in the repository root. Do not create subfolders.

Upload these files directly to the root:

- `.gitignore`
- `App.jsx`
- `README.md`
- `favicon.svg`
- `index.html`
- `main.jsx`
- `package.json`
- `styles.css`
- `vite.config.js`

## Local development

```bash
npm install
npm run dev
```

## Production build

```bash
npm run build
```

## V9 additions

- Line tool now magnetically snaps to endpoints and edges of existing lines so segments connect cleanly.
- Added resizable **Counter** object.
- Added resizable **Stove** object.
- Sink remains available.

## AI editable-plan import
The top **Import** button accepts Blueprint Studio JSON and converts it into normal editable walls, lines, doors, windows, text, and supported fixtures. The import dialog includes a **Copy ChatGPT format prompt** button. Give a blueprint image to ChatGPT, use that prompt, then paste the returned JSON into Blueprint Studio.

If real dimensions are readable, the JSON can use `"units":"inches"` and Blueprint Studio will preserve measurement scale while fitting the plan to the canvas. If dimensions are unclear, `"units":"normalized"` maps coordinates from 0–1000 to the workspace; use **Set blueprint scale** afterward for exact measurements.


## V11 export fix
- Restores PDF and PNG export after the V10 import refactor removed the export handler.
- Export now strips temporary editor selection/measurement state and reports export failures instead of silently doing nothing.
