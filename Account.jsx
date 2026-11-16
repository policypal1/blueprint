import React, { useEffect, useRef, useState } from 'react';
import { AccountAvatar, profileName } from './AccountMenu.jsx';
import { Modal } from './ui.jsx';
import { authErrorText } from './useAccount.js';

const SANDBOX_PORTAL_URL = 'https://billing.stripe.com/p/login/test_00w8wIf8fdke23P1oO4ZG00';
const BILLING_PORTAL_URL = import.meta.env?.VITE_STRIPE_PORTAL_URL?.trim() || SANDBOX_PORTAL_URL;
const STRIPE_TEST_PORTAL = /^https:\/\/billing\.stripe\.com\/p\/login\/test_[a-z0-9_-]+\/?$/i;
const MAX_NAME_LENGTH = 80;

function ProfileSettings({ account, onSignOut }) {
  const { user, busy, updateDisplayName } = account;
  const savedName = profileName(user);
  const [name, setName] = useState(savedName);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const nextName = name.trim();
  const canSave = nextName && nextName.length <= MAX_NAME_LENGTH
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
            maxLength={MAX_NAME_LENGTH}
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

function BillingSettings({ portalUrl, access }) {
  const [pending, setPending] = useState('');
  const [error, setError] = useState('');
  const attempts = useRef({});
  const { data, loading, refresh } = access ?? {};
  const backupPortal = STRIPE_TEST_PORTAL.test(portalUrl);
  const returned = new URLSearchParams(window.location.search).has('sandbox_checkout');

  async function visitStripe(action) {
    if (pending) return;
    setPending(action);
    setError('');
    try {
      if (action === 'portal') {
        await access.portal();
      } else {
        attempts.current[action] ??= crypto.randomUUID();
        await access.checkout(action, attempts.current[action]);
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
          <span className="billingMode">Test mode</span>
        </div>
        {data?.monthly ? <p>Your monthly test subscription is active.</p> : (
          <p>{data?.projectCredits || data?.projectIds?.length
            ? `${data.projectCredits} unused project ${data.projectCredits === 1 ? 'credit' : 'credits'} · ${data.projectIds.length} unlocked`
            : 'A test purchase unlocks editing.'}</p>
        )}
        {returned && !data?.monthly && !data?.projectCredits && !data?.projectIds?.length && (
          <p role="status">Stripe is confirming the test payment. Check again in a moment.</p>
        )}
        {access?.error && <p role="alert" className="accountError">{access.error}</p>}
        <div className="billingChoices">
          <div className="billingChoice">
            <h3>Single project</h3>
            <p><strong>$10</strong> for one saved project</p>
            <button className="primary" disabled={!data?.checkoutReady || Boolean(pending)}
              onClick={() => visitStripe('project')}>
              {pending === 'project' ? 'Opening Stripe…' : 'Buy a project credit'}
            </button>
          </div>
          <div className="billingChoice">
            <h3>Monthly plan</h3>
            <p><strong>$19</strong> per month for the full editor</p>
            <button className="primary" disabled={!data?.checkoutReady || Boolean(pending) || data.monthly}
              onClick={() => visitStripe('monthly')}>
              {data?.monthly ? 'Active subscription' : pending === 'monthly' ? 'Opening Stripe…' : 'Start test subscription'}
            </button>
          </div>
        </div>
        {data && !data.checkoutReady && <p className="billingNotice">Sandbox checkout is being set up.</p>}
        {refresh && (
          <div className="accountActions billingNotice">
            {data && (!data.paymentsRequired || data.monthly || data.projectCredits || data.projectIds.length) ? (
              <a className="button" href="#/editor">Open editor</a>
            ) : null}
            <button type="button" onClick={refresh} disabled={loading}>
              {loading ? 'Checking…' : 'Refresh access'}
            </button>
          </div>
        )}
      </section>
      <section className="accountCard" aria-labelledby="manage-billing-title">
        <h2 id="manage-billing-title">Payment methods and invoices</h2>
        {data?.billingAvailable ? (
          <>
            <p>Stripe manages saved payment methods, test invoices, and subscriptions.</p>
            <button disabled={Boolean(pending)} onClick={() => visitStripe('portal')}>
              {pending === 'portal' ? 'Opening Stripe…' : 'Manage test billing'}
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
        : 'Permanently removes your PlanPatch account and its saved plans, and cancels any Stripe test subscription.'}</p>
      <button type="button" className="danger" onClick={() => {
        setConfirmation('');
        setError('');
        setOpen(true);
      }}>{deleting ? 'Finish account deletion' : 'Delete account'}</button>
      {open && (
        <Modal title="Delete your PlanPatch account?" onClose={close}>
          <p>Export any account plans you want to keep. This action is permanent.</p>
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
            <a href="#/account" aria-current={billing || security ? undefined : 'page'}>Profile settings</a>
            <a href="#/account/security" aria-current={security ? 'page' : undefined}>Sign-in &amp; security</a>
            <a href="#/account/billing" aria-current={billing ? 'page' : undefined}>Billing</a>
            <a href="#/editor">Saved plans</a>
          </nav>
          {billing
            ? <BillingSettings portalUrl={portalUrl} access={access} />
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
