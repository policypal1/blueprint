import { useEffect, useState } from 'react';

const projectUrl = import.meta.env?.VITE_SUPABASE_URL?.trim();
const publishableKey = import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
const enabled = Boolean(projectUrl && publishableKey);
const RETURN_TO = 'planpatch-sign-in-return';
const RETURN_ROUTES = new Set(['#/editor', '#/editor/workspace', '#/account', '#/account/billing']);
let connection;

async function connect() {
  const { createClient } = await import('@supabase/supabase-js');
  const client = createClient(projectUrl, publishableKey, {
    auth: { flowType: 'pkce', detectSessionInUrl: false },
  });
  const url = new URL(window.location.href);
  const code = url.searchParams.get('code');
  const rejected = url.searchParams.has('error') || url.hash.startsWith('#error=');
  if (!code && !rejected) return { client, signInFailed: false };

  let returnTo;
  try {
    returnTo = sessionStorage.getItem(RETURN_TO);
    sessionStorage.removeItem(RETURN_TO);
  } catch {
    // The editor can still reopen its list if return navigation is unavailable.
  }
  const exchange = code ? await client.auth.exchangeCodeForSession(code) : null;
  for (const name of ['code', 'error', 'error_code', 'error_description']) url.searchParams.delete(name);
  url.hash = RETURN_ROUTES.has(returnTo) ? returnTo : url.hash.startsWith('#/') ? url.hash : '#/editor';
  window.history.replaceState(window.history.state, '', url);
  window.dispatchEvent(new Event('hashchange'));
  return { client, signInFailed: rejected || Boolean(exchange?.error) };
}

export function useAccount() {
  const [client, setClient] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(enabled);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    let subscription;
    connection ??= connect();
    connection.then(({ client: connected, signInFailed }) => {
      if (!active) return;
      setClient(connected);
      if (signInFailed) setError('Sign-in did not finish. Please try again.');
      subscription = connected.auth.onAuthStateChange((event, session) => {
        setUser(session?.user ?? null);
        setLoading(false);
        if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') setError('');
      }).data.subscription;
    }).catch(() => {
      if (!active) return;
      setError('Sign-in is unavailable right now. You can still edit plans on this device.');
      setLoading(false);
    });
    return () => {
      active = false;
      subscription?.unsubscribe();
    };
  }, []);

  async function signIn(beforeLeaving) {
    if (busy || !client) return;
    setError('');
    setBusy(true);
    try {
      if ((await beforeLeaving?.()) === false) {
        setError('Your draft could not be saved on this device. Download a backup before signing in.');
        return;
      }
      const hash = window.location.hash;
      const next = RETURN_ROUTES.has(hash) ? hash : '#/editor';
      const { data, error: oauthError } = await client.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/`, skipBrowserRedirect: true },
      });
      if (oauthError || !data.url) throw oauthError || new Error('Missing sign-in URL');
      sessionStorage.setItem(RETURN_TO, next);
      window.location.assign(data.url);
    } catch {
      setError('Could not open Google sign-in. Please try again.');
    } finally {
      setBusy(false);
    }
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
      const { error: signOutError } = await client.auth.signOut({ scope: 'local' });
      if (signOutError) throw signOutError;
    } catch {
      setError('Could not sign out. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function updateDisplayName(displayName) {
    if (!user || !client) throw new Error('An active account is required.');
    const { error: profileError } = await client.auth.updateUser({
      data: { planpatch_display_name: displayName },
    });
    if (profileError) throw profileError;
  }

  return { enabled, client, user, loading, busy, error, signIn, signOut, updateDisplayName, clearError: () => setError('') };
}
