import React, { useState } from 'react';
import { canOpenEditor, fullEditorAccess, timedAccessActive } from './access.js';
import { PRICING } from './Marketing.jsx';
import { PolicyAgreement } from './Policies.jsx';
import { Icon, Modal } from './ui.jsx';

function AccessLayout({ title, onClose, paid = false, children }) {
  if (onClose) {
    return <Modal title={title} onClose={onClose} className="editorAccessDialog">{children}</Modal>;
  }
  return (
    <main className={paid ? 'accessPage' : 'trialPage'}>
      <section className={paid ? 'accessCard expiredTrialCard' : 'trialCard'} aria-labelledby="access-offer-title">
        <h1 id="access-offer-title">{title}</h1>
        {children}
      </section>
    </main>
  );
}

export function ExpiredTrialPlans({ expired = true, onClose, onChoose, previewWarning }) {
  const title = expired ? 'Your trial ended. Your work is saved.' : 'Your plan is ready to download';
  return (
    <AccessLayout title={title} onClose={onClose} paid>
      <p>Keep editing for free. Unlock a clean PDF or PNG download when you’re ready. Your drafts are saved in this browser.</p>
      <nav className="expiredTrialOptions" aria-label="Choose a plan">
        <a href="/?plan=project#/account/billing" onClick={onChoose}>
          <Icon name="file" />
          <span>Unlock to download<small>Single project · unlimited revisions</small></span>
          <span className="expiredTrialPrice">${PRICING.project}<small>one time</small></span>
        </a>
        <a href="/?plan=monthly#/account/billing" onClick={onChoose}>
          <Icon name="folder" />
          <span>Monthly access<small>Unlimited projects and downloads</small></span>
          <span className="expiredTrialPrice">${PRICING.monthly}<small>per month</small></span>
        </a>
      </nav>
      {previewWarning && <p role="status">{previewWarning}</p>}
    </AccessLayout>
  );
}

export default function TrialPage({ account, access, offer, offerChecking, offerError, onCheckOffer, onSignIn, onClose }) {
  const [accepted, setAccepted] = useState(false);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState('');
  const data = access.data;
  const active = timedAccessActive(data?.trialEndsAt);
  const expired = Boolean(data?.trialEndsAt && !active);
  const available = offer || data?.canStartTrial;
  const starting = available && !data?.trialEndsAt && (!account.user || data?.canStartTrial);
  const title = active ? 'Your trial is active' : expired ? 'Your editor access'
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

  if (expired && !canOpenEditor(data) && !account.loading) return <ExpiredTrialPlans onClose={onClose} />;

  return (
    <AccessLayout title={title} onClose={onClose && (() => { if (!pending) onClose(); })}>
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
      ) : expired ? (
        <a className="button primary" href="#/editor">Open editor</a>
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
    </AccessLayout>
  );
}
