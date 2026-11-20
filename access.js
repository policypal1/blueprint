export const TERMS_VERSION = '2026-11-16';

export function timedAccessActive(expiresAt, now = Date.now()) {
  return Date.parse(expiresAt ?? '') > now;
}

export function trialTimeLeft(expiresAt, now = Date.now()) {
  const seconds = Math.ceil((Date.parse(expiresAt ?? '') - now) / 1000);
  if (!(seconds > 0)) return '';
  const days = Math.floor(seconds / 86400);
  const clock = [Math.floor(seconds / 3600) % 24, Math.floor(seconds / 60) % 60, seconds % 60]
    .map((part) => String(part).padStart(2, '0')).join(':');
  return days ? `${days}d ${clock}` : clock;
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
