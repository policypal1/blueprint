import { useEffect, useState } from 'react';

export const projectUrl = import.meta.env?.VITE_SUPABASE_URL?.trim();
export const publishableKey = import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
const enabled = Boolean(projectUrl && publishableKey);
const RETURN_TO = 'planpatch-sign-in-return';
const RECOVERY_OWNER = 'planpatch-recovery-owner';
const RETURN_ROUTES = new Set([
  '#/editor', '#/editor/workspace', '#/account', '#/account/security', '#/account/billing', '#/trial',
]);
const AUTH_ERRORS = {
  invalid_credentials: 'The email or password was incorrect.',
  email_not_confirmed: 'Confirm your email before signing in.',
  email_address_not_authorized: 'This address isn’t enabled for email testing.',
  over_email_send_rate_limit: 'Too many emails were requested. Wait a while and try again.',
  over_request_rate_limit: 'Too many attempts. Wait a moment and try again.',
  weak_password: 'Choose a stronger password.',
  same_password: 'Choose a password different from your current one.',
  draft_unsaved: 'Your draft could not be saved. Download a backup before signing in.',
};
let connection;

export const MIN_PASSWORD_LENGTH = 8;
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

function redirectUrl() {
  return new URL('/', window.location.origin).href;
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
  const errorCodes = ['error', 'error_code', 'error_description'];
  const hashParams = new URLSearchParams(url.hash.slice(1));
  const rejected = errorCodes.some((name) => url.searchParams.has(name) || hashParams.has(name));
  if (!code && !rejected) return { client };

  const returnTo = sessionValue(RETURN_TO);
  writeSessionValue(RETURN_TO, null);
  const exchange = code && !rejected
    ? await client.auth.exchangeCodeForSession(code).catch((error) => ({ error }))
    : null;
  const recovered = exchange?.data?.redirectType === 'recovery' ? exchange.data.user?.id : null;
  const callbackError = rejected || exchange?.error
    ? 'This sign-in or email link could not be completed. Try again from the browser where you started.'
    : '';

  writeSessionValue(RECOVERY_OWNER, recovered);
  const destination = RETURN_ROUTES.has(returnTo) ? returnTo : '#/account';
  url.hash = callbackError ? '#/sign-in' : recovered ? '#/reset-password' : destination;
  for (const name of ['code', 'flow_id', ...errorCodes]) url.searchParams.delete(name);
  window.history.replaceState(window.history.state, '', url);
  window.dispatchEvent(new Event('hashchange'));
  return { client, callbackError, recovered };
}

export function useAccount() {
  const [client, setClient] = useState(null);
  const [user, setUser] = useState(null);
  const [recoveryOwner, setRecoveryOwner] = useState(() => sessionValue(RECOVERY_OWNER));
  const [loading, setLoading] = useState(enabled);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const recovering = Boolean(user && recoveryOwner === user.id);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    let subscription;
    connection ??= connect();
    connection.then(({ client: connected, callbackError, recovered }) => {
      if (!active) return;
      setClient(connected);
      if (callbackError) setError(callbackError);
      if (recovered !== undefined) setRecoveryOwner(recovered ?? null);
      subscription = connected.auth.onAuthStateChange((event, session) => {
        setUser(session?.user ?? null);
        setLoading(false);
        if (event === 'SIGNED_OUT') {
          setRecoveryOwner(null);
          writeSessionValue(RECOVERY_OWNER, null);
        }
        if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') setError('');
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

  async function signInWithGoogle(beforeLeaving, returnTo) {
    await saveDraft(beforeLeaving);
    const data = authResult(await client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: redirectUrl(), skipBrowserRedirect: true },
    }));
    if (!data?.url) throw new Error('Missing Google authorization URL.');
    writeSessionValue(RETURN_TO, RETURN_ROUTES.has(returnTo) ? returnTo : '#/account');
    window.location.assign(data.url);
  }

  async function authenticate(mode, email, password, beforeLeaving, returnTo) {
    if (mode === 'forgot') {
      await requestPasswordReset(email);
      return false;
    }
    if (mode === 'resend') {
      writeSessionValue(RETURN_TO, RETURN_ROUTES.has(returnTo) ? returnTo : '#/account');
      authResult(await client.auth.resend({
        type: 'signup', email, options: { emailRedirectTo: redirectUrl() },
      }));
      return false;
    }

    await saveDraft(beforeLeaving);
    if (mode === 'create') writeSessionValue(RETURN_TO, RETURN_ROUTES.has(returnTo) ? returnTo : '#/account');
    const result = mode === 'create'
      ? await client.auth.signUp({ email, password, options: { emailRedirectTo: redirectUrl() } })
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
    enabled, client, user, loading, busy, error, recovering,
    authenticate, signInWithGoogle, signOut, requestPasswordReset, completePasswordReset,
    updateEmail, updateDisplayName, clearError: () => setError(''),
  };
}
