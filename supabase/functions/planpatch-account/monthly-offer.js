// The browser renders this same version and wording before opening Stripe Checkout.
export const MONTHLY_VERSION = 'monthly-usd19-2026-11-19';
export const MONTHLY_DISCLOSURE = 'I authorize Samuel Kumpula, the operator of EditFloorPlans.com, to charge $19 USD now and every month until I cancel. I can cancel before my next renewal in Account → Billing → Manage test billing. My access continues through the paid period. Payments for the current period are nonrefundable except where required by law.';
export const MONTHLY_CANCELLATION_URL = 'https://www.editfloorplans.com/#/account/billing';

// A separate version prevents sandbox acceptance from authorizing live renewal.
export const LIVE_MONTHLY_VERSION = 'monthly-live-usd19-2026-11-19';
export const LIVE_MONTHLY_DISCLOSURE = MONTHLY_DISCLOSURE.replace('Manage test billing', 'Manage billing');
