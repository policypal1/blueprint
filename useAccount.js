import { useEffect, useState } from 'react';

export const projectUrl = import.meta.env?.VITE_SUPABASE_URL?.trim();
export const publishableKey = import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
const enabled = Boolean(projectUrl && publishableKey);
const RETURN_TO = 'planpatch-sign-in-return';
const GOOGLE_PREVIEW_RETURN = 'editfloorplans-google-preview-return';
const RECOVERY_OWNER = 'planpatch-recovery-owner';
const EMAIL_CONFIRMATION_FLOW = 'confirm-email';
const RETURN_ROUTES = new Set([
  '#/editor', '#/editor/workspace', '#/account', '#/account/security', '#/account/billing', '#/trial',
]);
export const MIN_PASSWORD_LENGTH = 12;
export const MAX_DISPLAY_NAME_LENGTH = 80;
export const PASSWORD_HINT = `Use at least ${MIN_PASSWORD_LENGTH} characters.`;

const AUTH_ERRORS = {
  invalid_credentials: 'The email or password was incorrect.',
  email_not_confirmed: 'Confirm your email before signing in.',
  email_address_not_authorized: 'This address isn’t enabled for email testing.',
  over_email_send_rate_limit: 'Too many emails were requested. Wait a while and try again.',
  over_request_rate_limit: 'Too many attempts. Wait a moment and try again.',
  weak_password: PASSWORD_HINT,
  same_password: 'Choose a password different from your current one.',
  preview_redirect_unavailable: 'This browser couldn’t keep your plan for the redirect. Sign in with email here, or choose Google again and upload your plan afterward.',
  draft_unsaved: 'Your draft could not be saved. Download a backup before signing in.',
};
let connection;

export const authErrorText = (error, fallback) => Object.hasOwn(AUTH_ERRORS, error?.code)
  ? AUTH_ERRORS[error.code]
  : fallback;

function sessionValue(key) {
  try { return sessionStorage.getItem(key); } catch { return null; }
}

function writeSessionValue(key, value) {
  try {
    if (value) sessionStorage.setItem(key, value);
    else sessionStorage.removeItem(key);
  } catch {
    // Navigation can still use the default account page if storage is unavailable.
  }
}

function authResult({ data, error }) {
  if (error) throw error;
  return data;
}

function redirectUrl(flow) {
  const url = new URL('/', window.location.origin);
  if (flow) url.searchParams.set('auth', flow);
  return url.href;
}

async function saveDraft(beforeLeaving) {
  if ((await beforeLeaving?.()) === false) {
    throw Object.assign(new Error('The draft could not be saved.'), { code: 'draft_unsaved' });
  }
}

async function connect() {
  const { createClient } = await import('@supabase/supabase-js');
  const client = createClient(projectUrl, publishableKey, {
    auth: { flowType: 'pkce', detectSessionInUrl: false },
  });
  const url = new URL(window.location.href);
  const code = url.searchParams.get('code');
  const confirmationLink = url.searchParams.get('auth') === EMAIL_CONFIRMATION_FLOW;
  const errorCodes = ['error', 'error_code', 'error_description'];
  const hashParams = new URLSearchParams(url.hash.slice(1));
  const rejected = errorCodes.some((name) => url.searchParams.has(name) || hashParams.has(name));
  if (!code && !rejected) return { client };

  const returnTo = sessionValue(RETURN_TO);
  const googlePreview = sessionValue(GOOGLE_PREVIEW_RETURN) === '1';
  writeSessionValue(GOOGLE_PREVIEW_RETURN, null);
  writeSessionValue(RETURN_TO, null);
  const exchange = code && !rejected
    ? await client.auth.exchangeCodeForSession(code).catch((error) => ({ error }))
    : null;
  const recovered = exchange?.data?.redirectType === 'recovery' ? exchange.data.user?.id : null;
  // Supabase confirms the email before redirecting. The sign-in exchange still
  // requires the verifier stored in the browser that requested the link.
  const confirmedWithoutSession = confirmationLink && exchange?.error?.code === 'pkce_code_verifier_not_found';
  const callbackError = (rejected || exchange?.error) && !confirmedWithoutSession
    ? confirmationLink
      ? 'This confirmation link may have expired or already been used. Sign in or request a new link.'
      : 'This link couldn’t sign you in. For a password reset or Google sign-in, use the browser where you started.'
    : '';

  writeSessionValue(RECOVERY_OWNER, recovered);
  const destination = RETURN_ROUTES.has(returnTo) ? returnTo : '#/account';
  url.hash = callbackError || confirmedWithoutSession ? '#/sign-in' : recovered ? '#/reset-password' : destination;
  for (const name of ['code', 'flow_id', ...errorCodes]) url.searchParams.delete(name);
  if (confirmationLink) url.searchParams.delete('auth');
  window.history.replaceState(window.history.state, '', url);
  window.dispatchEvent(new Event('hashchange'));
  const oauthReturnOwner = googlePreview && !confirmationLink && !recovered && !exchange?.error
    ? exchange?.data?.session?.user?.id : null;
  return { client, callbackError, recovered, confirmedWithoutSession, oauthReturnOwner };
}

export function useAccount() {
  const [client, setClient] = useState(null);
  const [user, setUser] = useState(null);
  const [recoveryOwner, setRecoveryOwner] = useState(() => sessionValue(RECOVERY_OWNER));
  const [loading, setLoading] = useState(enabled);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [emailConfirmed, setEmailConfirmed] = useState(false);
  const [oauthReturnOwner, setOauthReturnOwner] = useState(null);
  const recovering = Boolean(user && recoveryOwner === user.id);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    let subscription;
    connection ??= connect();
    connection.then(({ client: connected, callbackError, recovered, confirmedWithoutSession, oauthReturnOwner }) => {
      if (!active) return;
      setClient(connected);
      setOauthReturnOwner(oauthReturnOwner ?? null);
      if (callbackError) setError(callbackError);
      if (confirmedWithoutSession) setEmailConfirmed(true);
      if (recovered !== undefined) setRecoveryOwner(recovered ?? null);
      subscription = connected.auth.onAuthStateChange((event, session) => {
        setUser(session?.user ?? null);
        setLoading(false);
        if (event === 'SIGNED_OUT') {
          setRecoveryOwner(null);
          setOauthReturnOwner(null);
          writeSessionValue(RECOVERY_OWNER, null);
        }
        if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
          setError('');
          setEmailConfirmed(false);
        }
      }).data.subscription;
    }).catch(() => {
      if (!active) return;
      setError('Sign-in is unavailable right now. Try again in a moment.');
      setLoading(false);
    });
    return () => {
      active = false;
      subscription?.unsubscribe();
    };
  }, []);

  async function signInWithGoogle(beforeLeaving, returnTo, resumePreview = false) {
    await saveDraft(beforeLeaving);
    const data = authResult(await client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: redirectUrl(), skipBrowserRedirect: true },
    }));
    if (!data?.url) throw new Error('Missing Google authorization URL.');
    writeSessionValue(RETURN_TO, RETURN_ROUTES.has(returnTo) ? returnTo : '#/account');
    writeSessionValue(GOOGLE_PREVIEW_RETURN, resumePreview ? '1' : null);
    window.location.assign(data.url);
  }

  async function authenticate(mode, email, password, { beforeLeaving, returnTo, displayName }) {
    writeSessionValue(GOOGLE_PREVIEW_RETURN, null);
    if (mode === 'forgot') {
      await requestPasswordReset(email);
      return false;
    }
    if (mode === 'resend') {
      writeSessionValue(RETURN_TO, RETURN_ROUTES.has(returnTo) ? returnTo : '#/account');
      authResult(await client.auth.resend({
        type: 'signup', email, options: { emailRedirectTo: redirectUrl(EMAIL_CONFIRMATION_FLOW) },
      }));
      return false;
    }

    await saveDraft(beforeLeaving);
    if (mode === 'create') writeSessionValue(RETURN_TO, RETURN_ROUTES.has(returnTo) ? returnTo : '#/account');
    const result = mode === 'create'
      ? await client.auth.signUp({
        email, password,
        options: {
          data: { planpatch_display_name: displayName },
          emailRedirectTo: redirectUrl(EMAIL_CONFIRMATION_FLOW),
        },
      })
      : await client.auth.signInWithPassword({ email, password });
    return Boolean(authResult(result)?.session);
  }

  async function signOut(beforeLeaving) {
    if (busy || !client) return;
    setError('');
    setBusy(true);
    try {
      if ((await beforeLeaving?.()) === false) {
        setError('Some account changes are unsaved. Reopen the plan to retry or save a copy.');
        return;
      }
      authResult(await client.auth.signOut({ scope: 'local' }));
    } catch {
      setError('Could not sign out. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function requestPasswordReset(email) {
    authResult(await client.auth.resetPasswordForEmail(email, { redirectTo: redirectUrl() }));
  }

  async function completePasswordReset(password) {
    if (!recovering) throw new Error('A password recovery session is required.');
    authResult(await client.auth.updateUser({ password }));
    setRecoveryOwner(null);
    writeSessionValue(RECOVERY_OWNER, null);
  }

  async function updateEmail(email) {
    if (!user || !client) throw new Error('An active account is required.');
    authResult(await client.auth.updateUser({ email }, { emailRedirectTo: redirectUrl() }));
  }

  async function updateDisplayName(displayName) {
    if (!user || !client) throw new Error('An active account is required.');
    authResult(await client.auth.updateUser({ data: { planpatch_display_name: displayName } }));
  }

  return {
    enabled, client, user, loading, busy, error, recovering, emailConfirmed, oauthReturnOwner,
    authenticate, signInWithGoogle, signOut, requestPasswordReset, completePasswordReset,
    updateEmail, updateDisplayName, clearError: () => setError(''),
  };
}
