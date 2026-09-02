# Blueprint Studio launch frontend

This ZIP is an **overlay for the existing `policypal1/blueprint` repo**. Copy these files into the repo root and keep the existing `App.jsx`, `styles.css`, `favicon.svg`, `sample-blueprint.jpeg`, `package.json`, and `vite.config.js` unless a file in this ZIP has the same name.

## What changed

- Added a full product/marketing site with hero, product preview, how-it-works, pricing, FAQ, CTA, and responsive navigation.
- Added frontend signup/login with name, email, and password.
- Added a real frontend paywall state that blocks the editor until an active trial/subscription exists.
- Added monthly and annual pricing.
- Added a payment-method form and account/billing screen.
- Added an obvious temporary testing bypass. The code is `1234`.
- Removed the old Import feature from the visible editor UI.
- Removed the old Lock control from the visible editor UI.
- Replaced the old editor tool glyphs with cleaner inline SVG-style icons at runtime.
- Changed the product/editor type stack away from the generic AI-style font look.
- Added an account menu inside the editor.

## Pricing

Pricing lives in `product.config.js`:

- Monthly: `$99/month`
- Annual: `$948/year` (`$79/month` effective)
- Trial: `7 days`

Change those values in one place and the site/checkout/order summary update automatically.

## Important: frontend vs production backend

The account and billing flow is intentionally implemented as a **frontend-complete demo contract** so the product can be designed and tested before the backend is connected.

Current behavior:

- Account records and session state use `localStorage`.
- Passwords are SHA-256 hashed in the browser before local storage. This is still **not production authentication** because the client controls the code and storage.
- Payment form data is **not sent to a processor**.
- The demo only stores card brand, last four digits, cardholder name, and expiry for display. Full card numbers and CVC are not persisted.
- Editor projects continue to use the editor's existing IndexedDB/local browser storage.

Before accepting real customers:

1. Replace `productServices.js` auth functions with Supabase/Auth0/Clerk/Firebase or your own API.
2. Replace `activateSubscription()` with Stripe Checkout or Stripe Elements + server-side subscription creation.
3. Verify subscription status server-side before giving access to `#app`.
4. Move project storage to your database/cloud object storage if cross-device sync is required.
5. Remove `testBypassCode: '1234'` from `product.config.js` or disable the testing bypass UI.
6. Add production Terms, Privacy Policy, support email, and Stripe customer portal/cancellation handling.

## Backend integration points

You only need to swap implementations in `productServices.js`. `ProductApp.jsx` already expects these operations:

- `createAccount({ name, email, password })`
- `login({ email, password })`
- `logout()`
- `getCurrentAccount()`
- `updateAccount(...)`
- `activateSubscription(...)`
- `getSubscription(accountId)`
- `removeSubscription(accountId)`
- `updatePaymentMethod({ accountId, cardNumber, expiry, cardholder })`

Keep the return shapes and the UI should not need a redesign.

## Run locally

```bash
npm install
npm run dev
```

Production check:

```bash
npm run build
npm run preview
```
