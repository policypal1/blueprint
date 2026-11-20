import React, { useEffect, useRef, useState } from 'react';
import { AccountAvatar, profileName } from './AccountMenu.jsx';
import { Icon, Modal, PRODUCT_NAME } from './ui.jsx';
import { authErrorText, MAX_DISPLAY_NAME_LENGTH } from './useAccount.js';
import { canOpenEditor } from './access.js';
import { PRICING } from './Marketing.jsx';
import { MONTHLY_VERSION, MONTHLY_DISCLOSURE, LIVE_MONTHLY_VERSION, LIVE_MONTHLY_DISCLOSURE, MONTHLY_CANCELLATION_URL } from './supabase/functions/planpatch-account/monthly-offer.js';
import { PolicyAgreement } from './Policies.jsx';

const SANDBOX_PORTAL_URL = 'https://billing.stripe.com/p/login/test_00w8wIf8fdke23P1oO4ZG00';
const BILLING_PORTAL_URL = import.meta.env?.VITE_STRIPE_PORTAL_URL?.trim() || SANDBOX_PORTAL_URL;
const STRIPE_TEST_PORTAL = /^https:\/\/billing\.stripe\.com\/p\/login\/test_[a-z0-9_-]+\/?$/i;

function ProfileSettings({ account, onSignOut }) {
  const { user, busy, updateDisplayName } = account;
  const savedName = profileName(user);
  const [name, setName] = useState(savedName);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const nextName = name.trim();
  const canSave = nextName && nextName.length <= MAX_DISPLAY_NAME_LENGTH
    && nextName !== savedName && !saving && !busy;

  useEffect(() => { setName(savedName); }, [savedName]);

  async function saveProfile(event) {
    event.preventDefault();
    if (!canSave) return;
    setSaving(true);
    setMessage('');
    setError('');
    try {
      await updateDisplayName(nextName);
      setMessage('Profile saved.');
    } catch {
      setError('Could not save your profile. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="accountCard" aria-labelledby="profile-settings-title">
      <div className="profileTitle">
        <AccountAvatar user={user} />
        <h2 id="profile-settings-title">Profile settings</h2>
      </div>
      <form className="profileSettings" onSubmit={saveProfile}>
        <label>
          Display name
          <input
            autoComplete="name"
            value={name}
            maxLength={MAX_DISPLAY_NAME_LENGTH}
            required
            disabled={saving || busy}
            onChange={(event) => {
              setName(event.target.value);
              setMessage('');
              setError('');
            }}
          />
        </label>
        <label>
          Email address
          <input type="email" value={user.email ?? ''} readOnly />
        </label>
        <p><a className="accountTextLink" href="#/account/security">Change email or password</a></p>
        {error && <p className="accountError" role="alert">{error}</p>}
        {message && <p role="status">{message}</p>}
        <div className="accountActions">
          <button className="primary" type="submit" disabled={!canSave}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
          <button type="button" onClick={onSignOut} disabled={busy || saving}>Sign out</button>
        </div>
      </form>
    </section>
  );
}

function SecuritySettings({ account }) {
  const [email, setEmail] = useState('');
  const [pending, setPending] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const currentEmail = account.user.email ?? '';
  const nextEmail = email.trim();

  async function perform(action, request, success, failure) {
    if (pending) return;
    setPending(action);
    setNotice('');
    setError('');
    try {
      await request();
      setNotice(success);
      if (action === 'email') setEmail('');
    } catch (problem) {
      setError(authErrorText(problem, failure));
    } finally {
      setPending('');
    }
  }

  function changeEmail(event) {
    event.preventDefault();
    if (!nextEmail || nextEmail.toLowerCase() === currentEmail.toLowerCase()) return;
    return perform('email', () => account.updateEmail(nextEmail),
      'Follow the instructions sent by email to confirm the change.',
      'Could not request an email change. Try again.');
  }

  return (
    <section className="accountCard securitySettings" aria-labelledby="security-title">
      <h2 id="security-title">Sign-in &amp; security</h2>
      <form className="profileSettings" method="post" onSubmit={changeEmail}>
        <p>Current email <strong>{currentEmail}</strong></p>
        <label>New email address
          <input type="email" autoComplete="email" name="email" required
            value={email} disabled={Boolean(pending)} onChange={(event) => setEmail(event.target.value)} />
        </label>
        <div className="accountActions">
          <button type="submit" disabled={Boolean(pending) || !nextEmail || nextEmail.toLowerCase() === currentEmail.toLowerCase()}>
            {pending === 'email' ? 'Sending…' : 'Send email change link'}
          </button>
        </div>
      </form>
      <div className="accountSecurityRow">
        <h3>Password</h3>
        <button type="button" disabled={Boolean(pending) || !currentEmail} onClick={() => perform(
          'password', () => account.requestPasswordReset(currentEmail),
          'Check your current email for a reset link and open it in this browser.',
          'Could not request a password reset. Try again.',
        )}>
          {pending === 'password' ? 'Sending…' : 'Send password reset link'}
        </button>
      </div>
      {notice && <p role="status">{notice}</p>}
      {error && <p className="accountError" role="alert">{error}</p>}
    </section>
  );
}

function SubscriptionConfirmation({ receipt, live = false }) {
  const paidDate = new Date(receipt.paid_at).toISOString();
  const periodEnd = new Date(receipt.first_period_end).toISOString();
  const amount = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(receipt.amount_paid_cents / 100);
  const configuredSupport = import.meta.env?.VITE_PLANPATCH_SUPPORT_EMAIL?.trim();
  const support = configuredSupport && !configuredSupport.endsWith('.example') ? configuredSupport : 'https://www.editfloorplans.com/support';
  const text = [
    live ? 'Blueprint | Subscription confirmation' : 'Blueprint | Test subscription confirmation',
    ...(live ? [] : ['Test mode. No real money was charged.']), '',
    (live ? 'Initial payment: ' : 'Initial test payment: ') + amount + ' USD on ' + paidDate,
    'First paid period ends: ' + periodEnd, (live ? 'Stripe invoice: ' : 'Stripe test invoice: ') + receipt.invoice_id, '',
    'Accepted on ' + new Date(receipt.accepted_at).toISOString() + ' | Offer ' + receipt.offer_version,
    receipt.offer_text, '', 'Manage or cancel your subscription: ' + MONTHLY_CANCELLATION_URL,
    'Refunds and cancellation: https://www.editfloorplans.com/refunds-and-cancellation',
    'Billing support: ' + support,
  ].join('\n');
  return (
    <section className="accountCard" aria-labelledby="subscription-confirmation-title">
      <h2 id="subscription-confirmation-title">{live ? 'Subscription confirmation' : 'Test subscription confirmation'}</h2>
      <p>Stripe confirmed your first {live ? 'payment' : 'test payment'} of {amount} USD on {new Date(paidDate).toLocaleDateString()}.</p>
      <p>{receipt.offer_text}</p>
      <a className="accountTextLink" href={'data:text/plain;charset=utf-8,' + encodeURIComponent(text)}
        download={live ? 'Blueprint-subscription-confirmation.txt' : 'Blueprint-test-subscription-confirmation.txt'}>Save subscription confirmation</a>
    </section>
  );
}

function BillingSettings({ portalUrl, access }) {
  const [pending, setPending] = useState('');
  const [error, setError] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [recurringAccepted, setRecurringAccepted] = useState(false);
  const attempts = useRef({});
  const { data, refresh } = access ?? {};
  const isLive = data?.billingMode === 'live';
  const testMode = data?.billingMode === 'test' || (!data?.billingMode && data?.monthlyOfferVersion === MONTHLY_VERSION);
  const offerVersion = isLive ? LIVE_MONTHLY_VERSION : MONTHLY_VERSION;
  const disclosure = isLive ? LIVE_MONTHLY_DISCLOSURE : MONTHLY_DISCLOSURE;
  const currentOffer = data?.monthlyOfferVersion === offerVersion;
  const backupPortal = !access && STRIPE_TEST_PORTAL.test(portalUrl);
  const query = new URLSearchParams(window.location.search);
  const returned = query.get('checkout') === 'returned' || query.get('sandbox_checkout') === 'returned';

  useEffect(() => {
    if (!refresh) return;
    const restore = (event) => {
      if (event.persisted) {
        setPending('');
        void refresh();
      }
    };
    window.addEventListener('pageshow', restore);
    // The webhook can arrive after the customer returns from Stripe Checkout.
    const timers = returned ? [2500, 6500, 15000].map(delay => window.setTimeout(refresh, delay)) : [];
    return () => {
      window.removeEventListener('pageshow', restore);
      timers.forEach(id => window.clearTimeout(id));
    };
  }, [returned, refresh]);

  async function visitStripe(action) {
    const openPortal = action === 'portal' || action === 'cancel';
    if (pending || (!openPortal && !accepted) || (action === 'monthly' && (!recurringAccepted || !currentOffer))) return;
    setPending(action);
    setError('');
    try {
      if (openPortal) {
        await access.portal(action === 'cancel');
      } else {
        attempts.current[action] ??= crypto.randomUUID();
        const consent = action === 'monthly' ? { accepted: true, version: offerVersion } : undefined;
        await access.checkout(action, attempts.current[action], consent);
      }
    } catch (problem) {
      setError(problem.message);
      setPending('');
    }
  }

  return (
    <div className="accountStack">
      <section className="accountCard" aria-labelledby="plans-billing-title">
        <div className="accountCardHeading">
          <h2 id="plans-billing-title">Plans and access</h2>
          {testMode && <span className="billingMode">Test mode</span>}
        </div>
        {data?.monthly ? <p>Your monthly {isLive ? 'subscription' : 'test subscription'} is active.</p> : (data?.projectCredits > 0 || data?.projectIds?.length > 0) ? (
          <p>{data.projectCredits ?? 0} unused project {data.projectCredits === 1 ? 'credit' : 'credits'} · {data.projectIds?.length ?? 0} unlocked</p>
        ) : testMode && (
          <p>A test purchase unlocks editing.</p>
        )}
        {returned && !data?.monthly && !data?.projectCredits && !data?.projectIds?.length && (
          <p role="status">Waiting for Stripe to confirm {testMode ? 'the test payment' : 'your payment'}. This page updates automatically.</p>
        )}
        {access?.error && <p role="alert" className="accountError">{access.error}</p>}
        {data?.checkoutReady && (
          <label className="policyAgreement">
            <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} />
            <span><PolicyAgreement /></span>
          </label>
        )}
        <div className="billingChoices">
          <div className="billingChoice" data-selected={query.get('plan') === 'project'}>
            <h3>Single project</h3>
            <p className="billingChoicePrice"><strong>${PRICING.project}</strong> USD once</p>
            <p>Edit and download one original floor plan.</p>
            <button className="primary" disabled={!data?.checkoutReady || !accepted || Boolean(pending)}
              onClick={() => visitStripe('project')}>
              {pending === 'project' ? 'Opening Stripe…' : 'Buy a project credit'}
            </button>
          </div>
          <div className="billingChoice" data-selected={query.get('plan') === 'monthly'}>
            <h3>Monthly access</h3>
            <p className="billingChoicePrice"><strong>${PRICING.monthly}</strong> USD / month</p>
            <p>Edit multiple projects. Renews until canceled.</p>
            {data?.checkoutReady && !data.monthly && currentOffer && (
              <label className="policyAgreement">
                <input type="checkbox" checked={recurringAccepted} onChange={(event) => setRecurringAccepted(event.target.checked)} />
                <span>{disclosure}</span>
              </label>
            )}
            {data?.checkoutReady && !data.monthly && !currentOffer && <p>Monthly checkout is being updated.</p>}
            <button className="primary" disabled={!data?.checkoutReady || !accepted || !currentOffer || !recurringAccepted || Boolean(pending) || data.monthly}
              onClick={() => visitStripe('monthly')}>
              {data?.monthly ? 'Active subscription' : pending === 'monthly' ? 'Opening Stripe…' : testMode ? 'Start test subscription' : 'Start subscription'}
            </button>
          </div>
        </div>
        {data && !isLive && !data.checkoutReady && <p className="billingNotice">Sandbox checkout is being set up.</p>}
        {canOpenEditor(data) && (
          <div className="accountActions billingNotice">
            <a className="button" href="#/editor">Open editor</a>
          </div>
        )}
      </section>
      {data?.monthlyConfirmation && <SubscriptionConfirmation receipt={data.monthlyConfirmation} live={isLive} />}
      <section className="accountCard" aria-labelledby="manage-billing-title">
        <h2 id="manage-billing-title">Payment methods and invoices</h2>
        {data?.billingAvailable ? (
          <>
            <p>Stripe manages saved payment methods, {isLive ? 'invoices' : 'test invoices'}, and subscriptions.</p>
            {data.monthly && (
              <button disabled={Boolean(pending)} onClick={() => visitStripe('cancel')}>
                {pending === 'cancel' ? 'Opening cancellation…' : isLive ? 'Cancel subscription' : 'Cancel test subscription'}
              </button>
            )}
            <button disabled={Boolean(pending)} onClick={() => visitStripe('portal')}>
              {pending === 'portal' ? 'Opening Stripe…' : isLive ? 'Manage billing' : 'Manage test billing'}
            </button>
          </>
        ) : backupPortal ? (
          <>
            <p>Use a verified Stripe email that matches a customer in this sandbox.</p>
            <a className="button" href={portalUrl} target="_blank" rel="noopener noreferrer">Open test billing portal</a>
          </>
        ) : <p>Billing is currently unavailable.</p>}
        {error && <p role="alert" className="accountError">{error}</p>}
      </section>
    </div>
  );
}

function DeleteAccount({ access, onDeleted }) {
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const deleting = access.data?.deleting;
  function close() {
    if (!pending) setOpen(false);
  }

  async function submit(event) {
    event.preventDefault();
    if (pending || confirmation !== 'DELETE') return;
    setPending(true);
    setError('');
    try {
      await access.deleteAccount(confirmation);
      await onDeleted();
    } catch (problem) {
      setError(problem.message);
      void access.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="accountCard deletionCard" aria-labelledby="delete-account-title">
      <h2 id="delete-account-title">Delete account</h2>
      <p>{deleting
        ? 'Account deletion is in progress. Finish the request to remove your account.'
        : `Permanently removes your ${PRODUCT_NAME} account and its saved plans, and cancels any Stripe test subscription.`}</p>
      <button type="button" className="danger" onClick={() => {
        setConfirmation('');
        setError('');
        setOpen(true);
      }}>{deleting ? 'Finish account deletion' : 'Delete account'}</button>
      {open && (
        <Modal title={`Delete your ${PRODUCT_NAME} account?`} onClose={close}>
          <p>Export any account plans you want to keep and save your subscription confirmation from Billing. This action is permanent.</p>
          <form className="profileSettings" method="post" onSubmit={submit}>
            <label>Type DELETE to confirm
              <input autoComplete="off" data-dialog-focus value={confirmation} disabled={pending}
                onChange={(event) => setConfirmation(event.target.value)} />
            </label>
            {error && <p role="alert" className="accountError">{error}</p>}
            <div className="accountActions">
              <button type="button" onClick={close} disabled={pending}>Cancel</button>
              <button type="submit" className="danger" disabled={pending || confirmation !== 'DELETE'}>
                {pending ? 'Deleting…' : 'Permanently delete account'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}

export default function AccountPage({
  billing, security, account, access, onSignIn, onSignOut, onDeleted, portalUrl = BILLING_PORTAL_URL,
}) {
  const title = useRef(null);
  useEffect(() => { title.current?.focus(); }, [billing, security]);

  return (
    <main className="accountPage">
      <h1 ref={title} tabIndex={-1}>{billing ? 'Billing' : security ? 'Security' : 'Account'}</h1>
      {account.loading ? (
        <p role="status">Opening your account…</p>
      ) : account.user ? (
        <div className="accountLayout">
          <nav className="accountSections" aria-label="Account">
            <a href="#/account" aria-label="Profile settings" aria-current={billing || security ? undefined : 'page'}>
              <Icon name="user" />
              <span className="accountSectionLabel">Profile settings</span>
              <span className="accountSectionShort">Profile</span>
            </a>
            <a href="#/account/security" aria-label="Sign-in & security" aria-current={security ? 'page' : undefined}>
              <Icon name="lock" />
              <span className="accountSectionLabel">Sign-in &amp; security</span>
              <span className="accountSectionShort">Security</span>
            </a>
            <a href="#/account/billing" aria-current={billing ? 'page' : undefined}>
              <Icon name="card" /> Billing
            </a>
          </nav>
          {billing
            ? <BillingSettings key={account.user.id} portalUrl={portalUrl} access={access} />
            : security
              ? <div className="accountStack">
                <SecuritySettings key={account.user.id} account={account} />
                {access && <DeleteAccount access={access} onDeleted={onDeleted} />}
              </div>
              : <ProfileSettings key={account.user.id} account={account} onSignOut={onSignOut} />}
        </div>
      ) : (
        <section className="accountCard accountSignIn" aria-labelledby="account-sign-in-title">
          <h2 id="account-sign-in-title">Sign in to continue</h2>
          <p>{account.client ? 'Sign in with email or Google to manage your account.' : 'Account sign-in is currently unavailable.'}</p>
          <div className="accountActions">
            {account.client && (
              <button className="primary" onClick={onSignIn} disabled={account.busy}>Open sign in</button>
            )}
            <a className="button" href="#/editor">Open editor</a>
          </div>
        </section>
      )}
    </main>
  );
}
