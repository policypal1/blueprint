import React, { useState } from 'react';
import { fullEditorAccess, timedAccessActive } from './access.js';
import { PolicyAgreement } from './Policies.jsx';

export default function TrialPage({ account, access, offer, onSignIn }) {
  const [accepted, setAccepted] = useState(false);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState('');
  const data = access.data;
  const active = timedAccessActive(data?.trialEndsAt);

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
    <main className="policyPage trialPage">
      <h1>{offer || data?.trialEndsAt ? 'Your 3-day free trial' : 'Free trial'}</h1>
      {account.loading || (account.user && (access.loading && !data)) ? (
        <p role="status">Checking trial access…</p>
      ) : active ? (
        <>
          <p>Trial access ends {new Date(data.trialEndsAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}.</p>
          <a className="button primary" href="#/editor">Open editor</a>
        </>
      ) : data?.trialEndsAt ? (
        <>
          <p>Your trial has ended. Choose a project credit or monthly access to edit and download your plans.</p>
          <a className="button primary" href="#/account/billing">Choose a plan</a>
        </>
      ) : !offer ? (
        <><p>Free trials are currently unavailable.</p><a className="button" href="#/editor">Open editor</a></>
      ) : !account.user ? (
        <>
          <p>Upload a blueprint, make your changes and export a PDF. No credit card needed.</p>
          <button type="button" className="primary" onClick={onSignIn} disabled={!account.client}>Create account</button>
        </>
      ) : data?.canStartTrial ? (
        <form className="trialForm" onSubmit={begin}>
          <p>Your 72 hours begin when you start. The trial ends automatically without a charge.</p>
          <label className="policyAgreement">
            <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} />
            <span><PolicyAgreement /></span>
          </label>
          <button className="primary" type="submit" disabled={!accepted || pending}>
            {pending ? 'Starting…' : 'Start free trial'}
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
        <p className="accountError" role="alert">{notice} <a className="accountTextLink" href="#/support">Contact support</a></p>
      )}
    </main>
  );
}
