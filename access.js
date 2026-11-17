export const TERMS_VERSION = '2026-11-16';

export function timedAccessActive(expiresAt, now = Date.now()) {
  return Date.parse(expiresAt ?? '') > now;
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
