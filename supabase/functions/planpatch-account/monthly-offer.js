// New checkouts record these exact terms. Older receipts retain the wording accepted at purchase.
export const MONTHLY_AGREEMENT = 'I agree to pay $19 today and $19 each month until I cancel.';
export const MONTHLY_CANCELLATION = 'Cancel before your next renewal in Account → Billing.';
export const MONTHLY_DETAILS = 'Samuel Kumpula operates EditFloorPlans.com. All charges are in US dollars. After you cancel, access continues through the paid period. Payments for the current period are nonrefundable except where required by law.';
export const MONTHLY_DISCLOSURE = [MONTHLY_AGREEMENT, MONTHLY_CANCELLATION, MONTHLY_DETAILS].join(' ');
export const MONTHLY_CANCELLATION_URL = 'https://www.editfloorplans.com/#/account/billing';

// A separate version prevents sandbox acceptance from authorizing live renewal.
export const MONTHLY_VERSION = 'monthly-usd19-2026-11-21';
export const LIVE_MONTHLY_VERSION = 'monthly-live-usd19-2026-11-21';
export const LIVE_MONTHLY_DISCLOSURE = MONTHLY_DISCLOSURE;
