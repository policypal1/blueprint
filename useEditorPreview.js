import { useCallback, useEffect, useRef, useState } from 'react';
import { validateProject } from './editor-core.js';
import { openDB } from './useProjectStore.js';

const SESSION_KEY = 'editfloorplans.preview-return';
const PREFIX = 'preview-return:';
const DAY = 24 * 60 * 60 * 1000;
const STORAGE_WARNING = 'This browser can’t keep your plan through a redirect. Continue here with email, or continue with Google and upload your plan again.';

function readTicket() {
  try {
    const ticket = JSON.parse(sessionStorage.getItem(SESSION_KEY));
    return typeof ticket?.key === 'string' && ticket.key.startsWith(PREFIX) ? ticket : null;
  } catch { return null; }
}

async function previewRecord(key, operation, plan) {
  const db = await openDB();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('app', 'readwrite');
      const records = tx.objectStore('app');
      // Expiry is encoded in the key. Cleanup never scans account projects.
      records.delete(IDBKeyRange.bound(PREFIX, PREFIX + Date.now() + '\uffff'));
      const request = operation === 'save' ? records.put(plan, key)
        : operation === 'remove' ? records.delete(key) : records.get(key);
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = tx.onabort = () => reject(tx.error || new Error('Preview storage unavailable'));
    });
  } finally { db.close(); }
}

function removeRecord(key) {
  if (key) void previewRecord(key, 'remove').catch(() => {});
}

function forgetTicket() {
  const ticket = readTicket();
  try { sessionStorage.removeItem(SESSION_KEY); } catch { /* Private browsing. */ }
  removeRecord(ticket?.key);
}

const normalizedEmail = (email) => email?.trim().toLowerCase() || '';

export default function useEditorPreview(user, accountLoading, oauthReturnOwner) {
  const owner = user?.id;
  const email = normalizedEmail(user?.email);
  const [preview, setPreview] = useState(null);
  const [restoring, setRestoring] = useState(() => Boolean(readTicket()));
  const [redirectWarning, setRedirectWarning] = useState('');
  const warnedGooglePlan = useRef(null);
  const revision = useRef(0);

  useEffect(() => {
    const version = ++revision.current;
    const ticket = readTicket();
    if (!ticket || !(ticket.until > Date.now())) {
      if (ticket) forgetTicket();
      setRestoring(false);
    } else {
      previewRecord(ticket.key, 'read').then((stored) => {
        if (revision.current === version) setPreview({ plan: validateProject(stored), target: ticket.target });
      }).catch(() => {
        if (revision.current === version) forgetTicket();
      }).finally(() => {
        if (revision.current === version) setRestoring(false);
      });
    }
    return () => { revision.current++; };
  }, []);

  const setPlan = useCallback((plan) => {
    revision.current++;
    forgetTicket();
    warnedGooglePlan.current = null;
    setRedirectWarning('');
    setRestoring(false);
    setPreview(plan ? { plan, target: owner ? { owner } : null } : null);
  }, [owner]);
  const clear = useCallback(() => setPlan(null), [setPlan]);
  const cancelSignIn = useCallback(() => {
    revision.current++;
    forgetTicket();
    setRestoring(false);
    setPreview(current => current && ({ plan: current.plan, target: null }));
  }, []);

  async function keepForReturn(plan, target, version) {
    const until = Date.now() + DAY;
    let key;
    try {
      key = PREFIX + until + ':' + crypto.randomUUID();
      await previewRecord(key, 'save', plan);
      if (version !== revision.current) {
        removeRecord(key);
        return false;
      }
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ key, until, target }));
      setRedirectWarning('');
      return true;
    } catch {
      removeRecord(key);
      if (version === revision.current) setRedirectWarning(STORAGE_WARNING);
      return false;
    }
  }

  async function prepareNavigation(plan) {
    if (plan) {
      const target = owner ? { owner } : null;
      const version = ++revision.current;
      forgetTicket();
      setPreview({ plan, target });
      await keepForReturn(plan, target, version);
      return version === revision.current;
    }
    if (!preview?.plan) return true;
    const version = ++revision.current;
    forgetTicket();
    await keepForReturn(preview.plan, preview.target, version);
    return version === revision.current;
  }

  async function prepareSignIn(mode, address) {
    if (!preview?.plan || owner || mode === 'forgot') return;
    const google = mode === 'google';
    const target = google ? { google: true } : { email: normalizedEmail(address) };
    const version = ++revision.current;
    forgetTicket();
    setPreview(current => current?.target ? { plan: current.plan, target: null } : current);
    const saved = await keepForReturn(preview.plan, target, version);
    if (version !== revision.current) throw new Error('The preview changed during sign-in.');
    if (!saved && google && warnedGooglePlan.current !== preview.plan) {
      warnedGooglePlan.current = preview.plan;
      throw Object.assign(new Error(STORAGE_WARNING), { code: 'preview_redirect_unavailable' });
    }
    setPreview({ plan: preview.plan, target });
  }

  useEffect(() => {
    if (restoring || accountLoading || !preview) return;
    const target = preview.target;
    if (target?.owner) {
      if (target.owner !== owner) clear();
      return;
    }
    if (!owner) return;
    const matches = target?.google ? oauthReturnOwner === owner : Boolean(email && email === target?.email);
    if (!matches) { clear(); return; }
    const bound = { owner };
    const ticket = readTicket();
    if (ticket) {
      try { sessionStorage.setItem(SESSION_KEY, JSON.stringify({ ...ticket, target: bound })); }
      catch { forgetTicket(); }
    }
    setPreview({ plan: preview.plan, target: bound });
  }, [preview, owner, email, oauthReturnOwner, accountLoading, restoring, clear]);

  const available = preview && (owner ? preview.target?.owner === owner : !preview.target?.owner);
  const warning = owner && redirectWarning
    ? 'Your plan is open in this tab. If you leave for checkout, you’ll need to upload it again.'
    : redirectWarning;
  return { plan: available ? preview.plan : null, restoring, prepareNavigation, prepareSignIn, cancelSignIn, redirectWarning: warning, setPlan, clear };
}
