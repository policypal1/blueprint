import React, { useEffect, useState } from 'react';
import { trialTimeLeft } from './access.js';

const formatExpiry = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export default function TrialStatus({ expiresAt }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const update = () => setNow(Date.now());
    const timer = window.setInterval(update, 1000);
    document.addEventListener('visibilitychange', update);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', update);
    };
  }, []);

  const remaining = trialTimeLeft(expiresAt, now);
  if (!remaining) return <aside className="trialStatus" aria-label="Free trial status"><span>Your trial ended. Saved drafts are still here. Keep editing free.</span><a href="/?plan=project#/account/billing">Unlock to download</a></aside>;
  return (
    <aside className="trialStatus" aria-label="Free trial status">
      <span>Trial ends in <time role="timer" aria-live="off" dateTime={expiresAt} title={formatExpiry.format(new Date(expiresAt))}>{remaining}</time></span>
      <a href="/#/account/billing">View plans</a>
    </aside>
  );
}
