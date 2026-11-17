import { useCallback, useEffect, useRef, useState } from 'react';
import { fullEditorAccess, TERMS_VERSION } from './access.js';
import { projectUrl, publishableKey } from './useAccount.js';

async function accountRequest(client, body) {
  if (!client) throw new Error('Sign in to continue.');
  const { data, error } = await client.functions.invoke('planpatch-account', { body });
  if (!error) return data;
  const detail = await error.context?.json?.().catch(() => null);
  throw new Error(detail?.error || 'Could not reach your account. Try again.');
}

async function readAccess(client) {
  const [billing, details] = await Promise.all([
    accountRequest(client, { action: 'status' }),
    client.rpc('planpatch_trial_details').maybeSingle(),
  ]);
  if (details.error && details.error.code !== 'PGRST202') {
    throw new Error('Could not check your trial or plan access. Try again.');
  }
  return {
    ...billing,
    trialEndsAt: details.data?.trial_ends_at,
    monthlyEndsAt: details.data?.monthly_ends_at,
    canStartTrial: details.data?.can_start_trial,
    lockedProjectIds: details.data?.locked_project_ids ?? billing.projectIds ?? [],
  };
}

export function useTrialOffer() {
  const configured = Boolean(projectUrl && publishableKey);
  const [state, setState] = useState({ available: false, checking: configured, error: false });
  const pending = useRef(null);

  const refresh = useCallback(async () => {
    if (!configured || pending.current) return;
    const request = new AbortController();
    pending.current = request;
    const deadline = window.setTimeout(() => request.abort(), 8_000);
    setState((previous) => previous.error ? { ...previous, checking: true, error: false } : previous);
    try {
      const response = await fetch(new URL('/rest/v1/rpc/planpatch_trial_offer', projectUrl), {
        headers: { apikey: publishableKey },
        credentials: 'omit',
        cache: 'no-store',
        signal: request.signal,
      });
      if (!response.ok) throw new Error('Could not check trial availability.');
      const available = await response.json();
      if (typeof available !== 'boolean') throw new Error('Unexpected trial availability.');
      if (pending.current === request) setState({ available, checking: false, error: false });
    } catch {
      if (pending.current === request) setState({ available: false, checking: false, error: true });
    } finally {
      window.clearTimeout(deadline);
      if (pending.current === request) pending.current = null;
    }
  }, [configured]);

  useEffect(() => {
    if (!configured) return undefined;
    const whenVisible = () => { if (!document.hidden) void refresh(); };
    void refresh();
    window.addEventListener('focus', whenVisible);
    document.addEventListener('visibilitychange', whenVisible);
    const timer = window.setInterval(whenVisible, 60_000);
    return () => {
      const request = pending.current;
      pending.current = null;
      request?.abort();
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', whenVisible);
      window.removeEventListener('focus', whenVisible);
    };
  }, [configured, refresh]);

  return { ...state, refresh };
}

function goToStripe(url, host) {
  const target = new URL(url);
  if (target.protocol !== 'https:' || target.hostname !== host || target.port || target.username || target.password) {
    throw new Error('Stripe returned an unexpected address.');
  }
  window.location.assign(target.href);
}

export default function usePlanPatchAccount(client, owner) {
  const [state, setState] = useState({ owner: null, data: null, loading: false, error: '' });
  const version = useRef(0);
  const refresh = useCallback(async () => {
    if (!client || !owner) return;
    const request = ++version.current;
    setState((prev) => ({ owner, data: prev.owner === owner ? prev.data : null, loading: true, error: '' }));
    try {
      const data = await readAccess(client);
      if (request === version.current) setState({ owner, data, loading: false, error: '' });
    } catch (error) {
      if (request === version.current) {
        setState((prev) => ({ ...prev, loading: false, error: error.message }));
      }
    }
  }, [client, owner]);

  useEffect(() => {
    if (!client || !owner) return;
    const whenVisible = () => { if (!document.hidden) void refresh(); };
    void refresh();
    window.addEventListener('focus', whenVisible);
    const timer = window.setInterval(whenVisible, 60_000);
    return () => {
      version.current += 1;
      window.clearInterval(timer);
      window.removeEventListener('focus', whenVisible);
    };
  }, [client, owner, refresh]);

  const data = state.owner === owner ? state.data : null;
  const trialEnd = data?.trialEndsAt;
  const monthlyEnd = data?.monthlyEndsAt;
  useEffect(() => {
    const now = Date.now();
    const ends = [Date.parse(trialEnd), Date.parse(monthlyEnd)].filter((end) => end > now);
    if (!ends.length) return undefined;
    const timer = window.setTimeout(refresh, Math.min(2_147_483_647, Math.min(...ends) - now + 75));
    return () => window.clearTimeout(timer);
  }, [trialEnd, monthlyEnd, refresh]);

  return {
    data,
    loading: Boolean(owner && (state.owner !== owner || state.loading)),
    error: state.owner === owner ? state.error : '',
    refresh,
    async startTrial() {
      const { error } = await client.rpc('planpatch_start_trial', { accepted_version: TERMS_VERSION });
      if (error) {
        const detail = ['PT400', 'PT401', 'PT403'].includes(error.code) && error.message;
        throw new Error(detail || 'Could not start your trial. Try again.');
      }
      await refresh();
    },
    async canDownload(projectId) {
      const latest = await readAccess(client);
      if (fullEditorAccess(latest) || (!latest.deleting && latest.projectIds?.includes(projectId))) return true;
      void refresh();
      return false;
    },
    async checkout(plan, attempt) {
      const data = await accountRequest(client, { action: 'checkout', plan, attempt });
      goToStripe(data.url, 'checkout.stripe.com');
    },
    async portal() {
      const data = await accountRequest(client, { action: 'billing' });
      goToStripe(data.url, 'billing.stripe.com');
    },
    async deleteAccount(confirmation) {
      const result = await accountRequest(client, { action: 'delete', confirmation });
      if (!result?.deleted) throw new Error('Could not confirm account deletion. Try again.');
    },
  };
}
