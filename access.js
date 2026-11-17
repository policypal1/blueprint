export const TERMS_VERSION = '2026-11-16';

export function timedAccessActive(expiresAt, now = Date.now()) {
  return Date.parse(expiresAt ?? '') > now;
}

export function trialTimeLeft(expiresAt, now = Date.now()) {
  const minutes = Math.ceil((Date.parse(expiresAt ?? '') - now) / 60_000);
  if (!(minutes > 0)) return '';

  const days = Math.floor(minutes / 1440);
  const hours = Math.floor(minutes / 60) % 24;
  const rest = minutes % 60;
  if (days) return `${days} ${days === 1 ? 'day' : 'days'}${hours ? ` ${hours} hr` : ''}`;
  if (hours) return `${hours} hr${rest ? ` ${rest} min` : ''}`;
  return `${minutes} min`;
}

export function fullEditorAccess(policy) {
  return Boolean(policy && !policy.deleting && (
    !policy.paymentsRequired
    || timedAccessActive(policy.trialEndsAt)
    || (policy.monthly && (policy.monthlyEndsAt === undefined || timedAccessActive(policy.monthlyEndsAt)))
  ));
}

export function canOpenEditor(policy) {
  return Boolean(policy && !policy.deleting && (
    fullEditorAccess(policy) || policy.projectCredits > 0 || policy.projectIds?.length
  ));
}
