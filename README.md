# Blueprint Studio V8

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
