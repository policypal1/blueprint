import React, { useState } from 'react';
import { fullEditorAccess, timedAccessActive } from './access.js';
import { PolicyAgreement } from './Policies.jsx';
import { Icon } from './ui.jsx';

export default function TrialPage({ account, access, offer, offerChecking, offerError, onCheckOffer, onSignIn }) {
  const [accepted, setAccepted] = useState(false);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState('');
  const data = access.data;
  const active = timedAccessActive(data?.trialEndsAt);
  const available = offer || data?.canStartTrial;
  const starting = available && !data?.trialEndsAt && (!account.user || data?.canStartTrial);
  const title = active ? 'Your trial is active' : data?.trialEndsAt ? 'Your trial has ended'
    : starting ? 'Try the editor free for 3 days' : 'Free trial';

  async function begin(event) {
    event.preventDefault();
    if (!accepted || pending) return;
    setPending(true);
    setNotice('');
    try {
      await access.startTrial();
      window.location.hash = '#/editor';
    } catch (error) {
      setNotice(error.message);
      setPending(false);
    }
  }

  return (
    <main className="trialPage">
      <section className="trialCard" aria-labelledby="trial-title">
      <h1 id="trial-title">{title}</h1>
      {starting && (
        <p className="trialOfferLine"><strong className="trialNoCard">No credit card needed</strong></p>
      )}
      {account.loading || (account.user && (access.loading && !data)) ? (
        <p role="status">Checking trial access…</p>
      ) : active ? (
        <>
          <p>Trial access ends {new Date(data.trialEndsAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}.</p>
          <a className="button primary" href="#/editor">Open editor</a>
        </>
      ) : data?.trialEndsAt ? (
        <>
          <p>Choose a project credit or monthly access to edit and download your plans.</p>
          <a className="button primary" href="#/account/billing">Choose a plan</a>
        </>
      ) : !available && offerChecking ? (
        <p role="status">Checking trial availability…</p>
      ) : !available && offerError ? (
        <>
          <p role="alert">Could not check trial availability.</p>
          <button type="button" onClick={onCheckOffer}>Check again</button>
        </>
      ) : !available ? (
        <><p>Free trials are currently unavailable.</p><a className="button" href="#/editor">Open editor</a></>
      ) : !account.user ? (
        <>
          <p>Upload a blueprint, make your changes, and export a revised plan. Create an account to get started.</p>
          <div className="trialActions">
            <button type="button" className="primary" onClick={() => onSignIn('create')} disabled={!account.client}>
              Start free trial <Icon name="arrow" size={17} />
            </button>
            <button type="button" className="authTextButton" onClick={() => onSignIn('signIn')} disabled={!account.client}>Sign in</button>
          </div>
          <nav className="trialPolicyLinks" aria-label="Trial policies">
            <a href="/terms">Terms</a>
            <a href="/privacy">Privacy</a>
          </nav>
        </>
      ) : data?.canStartTrial ? (
        <form className="trialForm" onSubmit={begin}>
          <p>Your 72 hours begin when you start. The trial ends automatically.</p>
          <label className="policyAgreement">
            <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} />
            <span><PolicyAgreement /></span>
          </label>
          <button className="primary" type="submit" disabled={!accepted || pending}>
            {pending ? 'Starting…' : 'Start free trial'} <Icon name="arrow" size={17} />
          </button>
        </form>
      ) : fullEditorAccess(data) ? (
        <a className="button primary" href="#/editor">Open editor</a>
      ) : (
        <>
          <p>{access.error || 'This account is not eligible for a free trial.'}</p>
          <a className="button primary" href="#/account/billing">View plans</a>
        </>
      )}
      {notice && (
        <p className="accountError" role="alert">{notice} <a className="accountTextLink" href="/support">Contact support</a></p>
      )}
      </section>
    </main>
  );
}
