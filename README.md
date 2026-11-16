# PlanPatch

PlanPatch edits existing blueprints on mobile and desktop.

## Start here

Run these commands from the repository root with Node.js **22.12 or newer**.

```bash
npm ci
npm run dev
```

Open the localhost URL printed by Vite. **Edit your blueprint** opens Recent plans. Upload a PDF or image, paste a clipboard image, or choose **Try a sample plan**. To check a release build, run the following commands.

```bash
npm test
npm run build
npm run preview
```

For the existing Vercel project, use the Vite framework preset, `npm run build`, and output directory `dist`. Select Node 22 or 24. The browser editor works with both account environment variables unset.

## Enable accounts

1. Create a dedicated Supabase project for PlanPatch. In its SQL Editor, run [the account migration](supabase/migrations/20261116052511_planpatch_accounts.sql) once. It creates the `projects` table, a private `blueprints` bucket, and owner-only permissions for both. If you manage the database through the Supabase CLI, apply the same migration with `supabase db push` from the linked checkout.
2. In Google Cloud, configure the Google Auth Platform consent screen for PlanPatch with the `openid`, `email`, and `profile` scopes. Create a **Web application** OAuth client. Add your live site origin and the callback URL shown in Supabase under **Authentication → Sign In / Providers → Google**. Save the Google Client ID and Client Secret in that Supabase provider and enable it. Add test users while the Google app is in Testing, and publish the consent screen before signing up customers. [Google sign-in setup](https://supabase.com/docs/guides/auth/social-sign-in/auth-google)
3. In Supabase **Authentication → URL Configuration**, set **Site URL** to the live Vercel origin. Allow the exact URL with its trailing slash, for example `https://blueprint-blue-theta.vercel.app/`. For local testing, also allow `http://localhost:5173/`. [Redirect URL setup](https://supabase.com/docs/guides/auth/redirect-urls)
4. In Vercel **Settings → Environment Variables**, add `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` from the Supabase project’s Connect panel. Redeploy with both variables. For local development use `.env.local`. Keep the Google Client Secret in Supabase. [Supabase API keys](https://supabase.com/docs/guides/api/api-keys)
5. On the deployed site, sign in, upload a sample PDF, and click **Save to account**. Add a wall and wait for **Saved to your account**. Sign in from another browser with the same Google account and check that the image and wall reopen. Then sign in with a second Google account and check that the first account’s plan is absent.

Drafts begin on the device. **Save to account** moves a draft after the cloud save succeeds, and future edits to that plan save automatically. If another device saved a newer version, use **Save a copy** to keep both drawings. Account plans can be deleted from the project menu. Payment collection is a separate integration.

## What changed

- A short landing page with a desktop and a phone demo, followed by the original and revised plans from the walkthrough.
- The pricing page shows **$10 per project** and **$19/month**.
- Charcoal toolbars, an orange action color, and warm drawing surfaces. The phone toolbar groups View, Edit, and Measure. Edit puts walls, doors, and fixtures within thumb reach. Desktop shows the full palette beside the drawing.
- On a phone, choose **Edit → Wall** and tap each endpoint. **Cancel** clears the first endpoint before a wall is placed. On desktop, drag to draw a wall.
- Recent plans opens drawings saved in this browser or in your account. Upload a PDF or image to start a separate plan.
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
| `useAccount.js`        | Sign-in and session handling                       |
| `account-projects.js`  | Account plans and private image storage            |
| `ui.jsx`               | Icons, brand and dialogs                           |
| `Root.jsx`             | Page routing                                       |
| `export-font.js`       | Embedding Inter in exported drawings               |
| `sample-project.js`    | Editable demonstration project                     |
| `vercel.json`          | Hosting security headers                           |

## Plan files and backups

PDFs and images become a raster background. You can mask details and draw new editable objects over it. Importing a PDF does **not** automatically turn its original walls into CAD objects. Advanced JSON import accepts explicitly structured editable geometry. PDF output is raster-based, not CAD/vector output. Dimensions use inches and feet.

Guest drafts stay in IndexedDB for the current browser and domain. Use **Download backup** under project settings to keep a portable copy.

Run `npm test` to check guest and account editor flows. Repeat the live two-account check in step 5 when the production login and database are connected.
