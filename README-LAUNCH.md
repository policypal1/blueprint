# Blueprint Studio launch frontend — V2

This package is the public/product layer for the existing Blueprint Studio editor. It does not push anything to GitHub and it does not replace the drawing engine in `App.jsx`.

## What changed

- Rebuilt the public landing page around the actual customer journey: old plan → cleanup → revision → usable updated plan.
- Added true separate routes/tabs for **Home**, **How it works**, **Pricing**, and **FAQ**.
- Rebuilt login/signup as a centered, focused authentication screen.
- Removed the forced trial/checkout step after signup. A new account now goes directly into the free editor.
- Added a permanent **Free workspace** instead of a time-limited free trial.
- Added a **Pro** upgrade at a $49/month regular price with a $48/month launch price.
- Added free-tool gating inside the existing editor without rebuilding the editor engine.
- Added an upgrade modal when a free user clicks a Pro-only tool.
- Added developer mode / override code `1234` for testing.
- Fixed marketing-page scrolling by explicitly separating marketing mode from the editor's fixed full-screen mode.
- Preserved the cleaner editor icon treatment and removed the visible old Import/Lock controls.

## Free workspace access

After creating an account, users can enter Blueprint Studio immediately and use:

- Upload blueprint
- Select / Pan
- Wall
- Window
- All door types
- Brush erase
- Clean area
- Set blueprint scale
- Clear all / basic file preparation controls

The rest of the drawing/annotation tools and Export are visibly marked **PRO** and open the upgrade prompt when clicked.

## Pricing

Pricing is centralized in `product.config.js`:

- Regular monthly price: `$49`
- Launch price: `$48/month`
- No free trial
- Free account remains usable without a card

## Developer mode

Temporary test override code:

`1234`

Developer mode is available on the login/signup screen and from the editor account menu. It grants Pro access in the frontend state.

**Remove or disable this before a real production launch.** A client-side bypass is intentionally not secure.

## Backend handoff

`productServices.js` currently simulates:

- account creation
- login/session state
- account editing
- free vs Pro access
- subscription state
- payment-method display metadata

The state is stored in the browser so the complete frontend flow works before the backend exists.

For production, replace the functions in `productServices.js` with your real services, for example:

- Supabase/Auth0/Clerk/custom auth for accounts
- Stripe Checkout or Stripe Elements for billing
- Database-backed subscription entitlement
- Cloud project storage instead of browser-only IndexedDB

Do **not** collect real card numbers with this frontend demo. The current form is only a frontend placeholder and intentionally saves only display-safe metadata such as brand and last four digits.

## Existing editor

This package expects the existing repository to already contain:

- `App.jsx`
- `styles.css`
- `sample-blueprint.jpeg`
- `favicon.svg`
- `package.json`
- `vite.config.js`

Copy the files in this ZIP over the root of the current project, then run the normal Vite build.
