import React, { useSyncExternalStore } from 'react';
import { Analytics } from '@vercel/analytics/react';

const preferenceKey = 'blueprint.analytics-choice.v1';
const preferenceEvent = 'blueprint:analytics-choice';
let tabChoice = null;

function currentChoice() {
  if (window.navigator.globalPrivacyControl === true) return 'protected';
  if (tabChoice) return tabChoice;
  try {
    const stored = window.localStorage.getItem(preferenceKey);
    return stored === 'accept' || stored === 'decline' ? stored : null;
  } catch {
    return null;
  }
}

function choose(value) {
  tabChoice = value;
  try {
    window.localStorage.setItem(preferenceKey, value);
    tabChoice = null;
  } catch {
    // Storage may be blocked or full. Apply this choice in the current document.
    if (value === 'decline') {
      try { window.localStorage.removeItem(preferenceKey); } catch { /* Storage is unavailable. */ }
    }
  }
  window.dispatchEvent(new Event(preferenceEvent));
}

function subscribe(notify) {
  function onStorage(event) {
    if (event.key === preferenceKey || event.key === null) {
      tabChoice = null;
      notify();
    }
  }
  window.addEventListener(preferenceEvent, notify);
  window.addEventListener('storage', onStorage);
  window.addEventListener('pageshow', notify);
  window.addEventListener('focus', notify);
  return () => {
    window.removeEventListener(preferenceEvent, notify);
    window.removeEventListener('storage', onStorage);
    window.removeEventListener('pageshow', notify);
    window.removeEventListener('focus', notify);
  };
}

function useChoice() {
  return useSyncExternalStore(subscribe, currentChoice, () => null);
}

function filterPageview(event) {
  // The analytics script can stay in the document after withdrawal.
  if (currentChoice() !== 'accept' || event.type !== 'pageview') return null;
  try {
    const url = new URL(event.url, window.location.origin);
    if (url.origin === window.location.origin) return { ...event, url: url.origin + url.pathname };
  } catch { /* Ignore invalid URLs. */ }
  return null;
}

export function ConsentAnalytics({ path }) {
  const choice = useChoice();
  return choice === 'accept' && path
    ? <Analytics route={path} path={path} beforeSend={filterPageview} />
    : null;
}

export function PrivacyChoices({ banner = false }) {
  const choice = useChoice();
  if (banner && choice !== null) return null;
  return (
    <section className={banner ? 'privacyChoices privacyBanner' : 'privacyChoices'} id={banner ? undefined : 'cookie-settings'} tabIndex={banner ? undefined : -1} aria-label="Cookie and privacy choices">
      <h2>Cookie and privacy choices</h2>
      <p>We use browser storage to keep you signed in and save drafts. May we use cookieless Vercel Analytics to count visits to pages and editor screens?</p>
      {banner && <a className="accountTextLink" href="/privacy#cookie-settings">Privacy Policy and settings</a>}
      {choice === 'protected' ? (
        <p role="status">Optional analytics is off because your browser sends Global Privacy Control.</p>
      ) : (
        <>
          {!banner && <p role="status">Optional analytics is {choice === 'accept' ? 'on' : 'off'} in this browser.</p>}
          <div className="privacyActions">
            <button type="button" aria-pressed={banner ? undefined : choice === 'accept'} onClick={() => choose('accept')}>Accept analytics</button>
            <button type="button" aria-pressed={banner ? undefined : choice === 'decline'} onClick={() => choose('decline')}>Decline analytics</button>
          </div>
        </>
      )}
    </section>
  );
}
