import React, { useEffect, useRef } from 'react';
import { PRODUCT_NAME } from './ui.jsx';

export const POLICY_LINKS = {
  terms: 'Terms of Service',
  privacy: 'Privacy Policy',
  'refunds-and-cancellation': 'Refunds & cancellation',
  support: 'Support',
};

const configuredEmail = import.meta.env?.VITE_PLANPATCH_SUPPORT_EMAIL?.trim() ?? '';
const supportEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(configuredEmail) && !configuredEmail.endsWith('.example')
  ? configuredEmail : '';

export function SupportContact() {
  return supportEmail ? <a className="accountTextLink" href={`mailto:${supportEmail}`}>{supportEmail}</a>
    : <span>support@editfloorplans.example <small>(placeholder)</small></span>;
}

export function PolicyAgreement() {
  return <>I agree to the <a className="accountTextLink" href="#/terms" target="_blank" rel="noopener noreferrer">Terms of Service</a> and have read the <a className="accountTextLink" href="#/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>.</>;
}

function Terms() {
  return (
    <>
      <p>{PRODUCT_NAME} provides tools for marking up existing blueprints. You may use the service with drawings you own or have permission to edit. You retain ownership of your drawings and give {PRODUCT_NAME} permission to store and process them to provide the service.</p>
      <h2>Accounts and free trials</h2>
      <p>Keep your account credentials secure. Eligible verified accounts can start a 72-hour trial. No credit card is required and the trial ends automatically. A trial is available once per account. Trial limits also apply to email addresses and signup networks. Creating additional accounts or bypassing trial or payment limits is prohibited.</p>
      <h2>Project credits and monthly access</h2>
      <p>A single-project purchase unlocks one saved project tied to its original PDF or image. You can edit that project and export revisions while the purchase remains valid. A new blueprint needs a separate project. Deleting a project leaves its credit used.</p>
      <p>Monthly subscriptions renew until canceled. Access continues through the end of the paid billing period after cancellation. Downloads for subscription-only projects become unavailable after that period ends. Export your work before access ends. Independently purchased projects remain available while their credits are valid.</p>
      <h2>Using your revisions</h2>
      <p>Use {PRODUCT_NAME} exports as working markups. Verify dimensions and have a qualified professional review any plans used for construction, permitting or structural changes. Keep backups of important plans.</p>
      <p>See <a className="accountTextLink" href="#/refunds-and-cancellation">Refunds &amp; cancellation</a> for billing terms. Contact <a className="accountTextLink" href="#/support">Support</a> for account and service questions.</p>
    </>
  );
}

function Privacy() {
  return (
    <>
      <p>{PRODUCT_NAME} uses your email, account identifier and any profile name to operate your account. If you sign in with Google, the service receives basic account information for sign-in. Supabase provides authentication and storage for account plans.</p>
      <h2>Blueprints and drafts</h2>
      <p>New drafts normally stay in the current browser and are separated by signed-in account. Project-credit plans and plans already saved to your account use private cloud storage. Older drafts created before account separation stay in the original browser storage.</p>
      <h2>Trial eligibility</h2>
      <p>For trials, the authentication service provides the network address at signup. {PRODUCT_NAME} turns it into a protected identifier, and also uses a protected identifier derived from the verified email. These identifiers help limit repeat trials, including when accounts are recreated. Trial limits apply to the signup network for 90 days. Unused signup identifiers expire after seven days. Expired trial identifiers are cleared during signup and trial checks.</p>
      <h2>Payments and service providers</h2>
      <p>Stripe handles payment card details and invoices. {PRODUCT_NAME} keeps the Stripe customer reference and purchase status needed to activate and manage access. Vercel hosts the website. These services process information to provide hosting, authentication, file storage and payments.</p>
      <h2>Deletion and requests</h2>
      <p>You can delete your account in Sign-in &amp; security. Account deletion removes the account and its cloud plans. It also clears its drafts in the current browser when browser storage is available. To remove local copies elsewhere, clear the site's data on those devices. Limited identifiers may remain while they are needed for trial abuse prevention, payment records or legal obligations.</p>
      <p>Use <a className="accountTextLink" href="#/support">Support</a> for questions or requests about your information, including any rights that apply where you live.</p>
    </>
  );
}

function RefundsAndCancellation() {
  return (
    <>
      <h2>Refunds</h2>
      <p>All purchases are final, except where applicable law requires a refund. Contact <a className="accountTextLink" href="#/support">Support</a> for a duplicate or incorrect charge or a request under applicable law.</p>
      <h2>Cancel your monthly subscription</h2>
      <p>Open <a className="accountTextLink" href="#/account/billing">Billing</a> and choose Manage billing before your next renewal. Cancellation stops future renewals. You can keep editing and downloading your subscription projects until the paid period ends. Download copies you need before that date.</p>
      <h2>One-time purchases and trials</h2>
      <p>A project credit has a single charge and stays with the project it unlocks. Deleting that project leaves the credit used. The three-day free trial ends automatically without a charge. Paid access begins only if you choose to purchase it.</p>
      <p>Contact Support if applicable law gives you a right to retrieve your files after access ends.</p>
    </>
  );
}

export function CustomerPolicyPage({ page }) {
  const heading = useRef(null);
  useEffect(() => { heading.current?.focus(); }, [page]);
  return (
    <main className="policyPage">
      <h1 ref={heading} tabIndex={-1}>{POLICY_LINKS[page]}</h1>
      {page === 'terms' && <Terms />}
      {page === 'privacy' && <Privacy />}
      {page === 'refunds-and-cancellation' && <RefundsAndCancellation />}
      {page === 'support' && (
        <>
          <p>For help with {PRODUCT_NAME} accounts, billing, or privacy requests, email <SupportContact />.</p>
          <p>For a billing question, include the email on your account and your receipt number. Keep your password and card details private.</p>
          <a className="button" href="#/account/billing">Open billing</a>
        </>
      )}
    </main>
  );
}
