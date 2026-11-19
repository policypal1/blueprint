import React, { useEffect, useRef } from 'react';
import { PRODUCT_NAME } from './ui.jsx';

export const POLICY_LINKS = {
  terms: 'Terms of Service',
  privacy: 'Privacy Policy',
  'refunds-and-cancellation': 'Refunds & cancellation',
  support: 'Support',
};

const configuredEmail = import.meta.env?.VITE_PLANPATCH_SUPPORT_EMAIL?.trim() ?? '';
const supportEmail = /^[^\s@?&#]+@[^\s@?&#]+\.[^\s@?&#]+$/.test(configuredEmail)
  && !/\.(?:example|invalid|test)$/i.test(configuredEmail) ? configuredEmail : '';

export function PolicyAgreement() {
  return <>I agree to the <a className="accountTextLink" href="/terms" target="_blank" rel="noopener noreferrer">Terms of Service</a> and have read the <a className="accountTextLink" href="/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>.</>;
}

function Terms() {
  return (
    <>
      <p>{PRODUCT_NAME} provides tools for marking up existing floor plans. Keep your account credentials secure.</p>
      <h2>Your drawings and revisions</h2>
      <p>Upload, edit and export only material you own or have permission to use with this service. You retain the rights you hold in your drawings and edits. Architects, clients and other rights holders keep their rights in the underlying plans.</p>
      <p>You grant us a limited, nonexclusive license to copy, store, process and display your content as needed to provide the editor, save your account projects and return your exports. Our hosting and storage providers may perform those tasks for us. Uploading a drawing gives us no right to sell it or use it in advertising.</p>
      <h2>Accounts and free trials</h2>
      <p>Eligible verified accounts can start one 72-hour trial. The timer starts when you accept the terms and choose Start free trial. No card is required. The trial ends automatically without a charge. The same verified email address or signup network cannot claim another trial for 90 days. A shared network can affect eligibility. See the <a className="accountTextLink" href="/privacy">Privacy Policy</a> for details. Bypassing trial or payment limits is prohibited.</p>
      <h2>Project credits and monthly access</h2>
      <p>Billing is currently in test mode. The prices shown are $10 USD once for one original blueprint and $19 USD per month for multiple projects. Test checkout does not charge real money or start a paid subscription.</p>
      <p>A project credit stays with the original PDF or image. Deleting the project does not restore the credit. Monthly access covers editing and exporting during the subscription period. Save copies of subscription-only projects before access ends. See <a className="accountTextLink" href="/refunds-and-cancellation">Refunds &amp; cancellation</a> for details.</p>
      <h2>Using your revisions</h2>
      <p>Exports are working markups. Scale, dimensions and edits can contain errors. Verify measurements against the site and have a qualified professional review plans used for construction, permitting or structural changes. The editor does not certify code compliance or provide architectural or engineering approval. Keep backups of important plans. These terms preserve rights and remedies that applicable law does not allow us to limit.</p>
    </>
  );
}

function Privacy() {
  return (
    <>
      <p>{PRODUCT_NAME} uses your email, account identifier and profile name to operate your account. Supabase manages email sign-in and stores your account records. If you choose Google sign-in, Google shares basic profile and sign-in information with the service.</p>
      <h2>Account email</h2>
      <p>Supabase sends signup confirmations, password resets and email-change confirmations through Resend. Resend processes the recipient address, message contents, sending time and delivery events. Account mail comes from accounts@auth.editfloorplans.com. Keep confirmation and reset links private. Resend describes a 30-day retention period for email and log data on its Free plan in its <a className="accountTextLink" href="https://resend.com/security/gdpr">data retention information</a>.</p>
      <h2>Your floor plans</h2>
      <p>New drafts normally stay in this browser, separated by signed-in account. Older drafts saved before account separation remain on the original browser. When you import a PDF, the editor renders the page you select in your browser. When a project uses a project credit or you update an existing account plan, Supabase stores the background image in private file storage and saves the project name, drawing edits and related project records in its database.</p>
      <h2>Trial eligibility</h2>
      <p>At signup, Supabase supplies the network address. For trial checks we derive a protected identifier from the IPv4 address or IPv6 network prefix. An unused signup identifier expires after seven days. When you start a trial, we record its dates and the terms version you accepted. Protected identifiers for the verified email and signup network block additional claims for 90 days. Expired identifiers are removed during subsequent signup and trial checks. People who share an internet connection may share a trial limit.</p>
      <h2>Hosting, analytics and browser storage</h2>
      <p>Vercel hosts the website. Vercel Web Analytics counts visits to pages and editor screens and records referring sites without analytics cookies. The app sends page names and omits query strings, drawing contents and account details from its pageview URLs.</p>
      <p>The editor uses browser storage for drafts, the selected project, sign-in sessions and recovery steps. Clearing site data can erase local drafts and sign you out. Google and Stripe may use cookies on their own pages when you use their services.</p>
      <h2>Billing information</h2>
      <p>Billing currently uses Stripe test mode. When a test billing session is available, Stripe receives the account email, an account reference and the selected plan, and manages test payment details and invoices. The app stores billing references and access status. Use only test payment details in test checkout.</p>
      <h2>Deleting data and making requests</h2>
      <p>Delete an account plan from its project menu. To delete the account and its cloud plans, open <a className="accountTextLink" href="/#/account/security">Sign-in &amp; security</a> and confirm deletion. This also clears account drafts in the current browser when storage is available. Downloaded files, older unassigned drafts and copies on other devices may remain. You can remove those copies on the device where they are stored.</p>
      <p>Limited trial identifiers may remain until their eligibility window expires. Service providers may retain delivery, security, billing or backup records under their own retention practices or legal obligations. Visit <a className="accountTextLink" href="/support">Support</a> for available account controls and contact information for privacy requests.</p>
    </>
  );
}

function RefundsAndCancellation() {
  return (
    <>
      <h2>Billing status and refunds</h2>
      <p>Billing is currently in Stripe test mode. A test checkout does not collect real money, so there is no payment to refund. If you see a real charge you believe relates to this service, check the merchant on the receipt and the contact details on <a className="accountTextLink" href="/support">Support</a>. You retain any refund or billing rights provided by applicable law.</p>
      <h2>Monthly access and cancellation</h2>
      <p>The monthly plan shown in the app is $19 USD per month and renews until canceled. For a test subscription, open <a className="accountTextLink" href="/#/account/billing">Billing</a> and choose Manage test billing when available. Review the cancellation date shown in Stripe and save its confirmation. Export subscription-only projects before access ends.</p>
      <h2>One-time projects and free trials</h2>
      <p>The single-project price is $10 USD once. A credit stays with the original blueprint, including after you delete it. A free trial ends automatically after 72 hours. Starting a trial does not enroll you in a subscription.</p>
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
          {supportEmail ? (
            <>
              <p>For help with accounts, billing or privacy requests, email <a className="accountTextLink" href={`mailto:${supportEmail}`}>{supportEmail}</a>.</p>
              <p>For a billing question, include the email on your account and the receipt number if you have one. Keep passwords, account email links and card details private.</p>
            </>
          ) : <p>A support email address is currently unavailable.</p>}
          <p><a className="accountTextLink" href="/#/account/security">Open Sign-in &amp; security</a> to update your email, request a password reset or delete your account.</p>
          <a className="button" href="/#/account/billing">Open billing</a>
        </>
      )}
    </main>
  );
}
