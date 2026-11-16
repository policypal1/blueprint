import { useCallback, useEffect, useRef, useState } from 'react';

async function accountRequest(client, body) {
  if (!client) throw new Error('Sign in to continue.');
  const { data, error } = await client.functions.invoke('planpatch-account', { body });
  if (!error) return data;
  const detail = await error.context?.json?.().catch(() => null);
  throw new Error(detail?.error || 'PlanPatch could not reach your account. Try again.');
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
      const data = await accountRequest(client, { action: 'status' });
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

  return {
    data: state.owner === owner ? state.data : null,
    loading: Boolean(owner && (state.owner !== owner || state.loading)),
    error: state.owner === owner ? state.error : '',
    refresh,
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
