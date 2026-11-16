import React, { useEffect, useRef, useState } from 'react';
import { authErrorText } from './useAccount.js';

const SANDBOX_PORTAL_URL = 'https://billing.stripe.com/p/login/test_00w8wIf8fdke23P1oO4ZG00';
const BILLING_PORTAL_URL = import.meta.env?.VITE_STRIPE_PORTAL_URL?.trim() || SANDBOX_PORTAL_URL;
const STRIPE_TEST_PORTAL = /^https:\/\/billing\.stripe\.com\/p\/login\/test_[a-z0-9_-]+\/?$/i;
const MAX_NAME_LENGTH = 80;

function ProfileSettings({ account, onSignOut }) {
  const { user, busy, updateDisplayName } = account;
  const { planpatch_display_name, full_name, name: googleName } = user.user_metadata ?? {};
  const savedName = [planpatch_display_name, full_name, googleName]
    .find((value) => typeof value === 'string' && value.trim()) ?? '';
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
      <h2 id="profile-settings-title">Profile settings</h2>
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

function BillingSettings({ portalUrl }) {
  const connected = STRIPE_TEST_PORTAL.test(portalUrl);
  return (
    <section className="accountCard" aria-labelledby="manage-billing-title">
      <h2 id="manage-billing-title">Manage billing</h2>
      {connected ? (
        <>
          <p className="billingMode">Test mode</p>
          <p>
            Use an email verified in Stripe that matches a customer in this sandbox. You can
            view test invoices, update payment details, or cancel a test subscription.
          </p>
          <a className="button primary" href={portalUrl} target="_blank" rel="noopener noreferrer">
            Open test billing portal
          </a>
        </>
      ) : (
        <p>Billing is currently unavailable.</p>
      )}
    </section>
  );
}

export default function AccountPage({
  billing, security, account, onSignIn, onSignOut, portalUrl = BILLING_PORTAL_URL,
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
            ? <BillingSettings portalUrl={portalUrl} />
            : security
              ? <SecuritySettings key={account.user.id} account={account} />
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
