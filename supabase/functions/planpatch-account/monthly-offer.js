// New checkouts record these exact terms. Older receipts retain the wording accepted at purchase.
export const MONTHLY_PRICE = '$19 today, then $19 per month until canceled.';
export const MONTHLY_AGREEMENT = 'I agree to monthly billing.';
export const MONTHLY_CANCELLATION = 'Cancel anytime in Account → Billing before your next renewal.';
export const MONTHLY_DETAILS = 'Samuel Kumpula operates EditFloorPlans.com. All charges are in US dollars. After you cancel, access continues through the paid period. Payments for the current period are nonrefundable except where required by law.';
export const MONTHLY_DISCLOSURE = [MONTHLY_PRICE, MONTHLY_AGREEMENT, MONTHLY_CANCELLATION, MONTHLY_DETAILS].join(' ');
export const MONTHLY_CANCELLATION_URL = 'https://www.editfloorplans.com/#/account/billing';

// A separate version prevents sandbox acceptance from authorizing live renewal.
export const MONTHLY_VERSION = 'monthly-usd19-2026-11-21-compact';
export const LIVE_MONTHLY_VERSION = 'monthly-live-usd19-2026-11-21-compact';
export const LIVE_MONTHLY_DISCLOSURE = MONTHLY_DISCLOSURE;
