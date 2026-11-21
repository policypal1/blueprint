import React, { useEffect, useRef } from 'react';
import { PRODUCT_NAME } from './ui.jsx';
import { PrivacyChoices } from './PrivacyChoices.jsx';

export const POLICY_LINKS = {
  terms: 'Terms of Service',
  privacy: 'Privacy Policy',
  'refunds-and-cancellation': 'Refunds & cancellation',
  support: 'Support',
};

const configuredEmail = import.meta.env?.VITE_PLANPATCH_SUPPORT_EMAIL?.trim() ?? '';
const supportEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(configuredEmail) && !configuredEmail.endsWith('.example')
  ? configuredEmail : 'support@editfloorplans.com';

export function SupportContact() {
  return <a className="accountTextLink" href={`mailto:${supportEmail}`}>{supportEmail}</a>;
}

const mailingAddress = import.meta.env?.VITE_PLANPATCH_MAILING_ADDRESS?.trim();

function SellerContact() {
  return (
    <p>Samuel Kumpula, an Oregon sole proprietor, operates EditFloorPlans.com.
      {mailingAddress && <> You can write to the operator at {mailingAddress}.</>}
      {' '}Email <SupportContact /> for account, billing or privacy requests.</p>
  );
}

export function PolicyAgreement() {
  return <>I agree to the <a className="accountTextLink" href="/terms" target="_blank" rel="noopener noreferrer">Terms of Service</a> and have read the <a className="accountTextLink" href="/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>.</>;
}

function Terms() {
  return (
    <>
      <SellerContact />
      <h2>Your drawings and revisions</h2>
      <p>Upload, edit and export only material you own or have permission to use. You keep the rights you hold in your drawings and edits. Architects, clients and other rights holders keep their rights in the original plans.</p>
      <p>You grant us a limited, nonexclusive license to copy, store, process and display your content as needed to provide the editor, save your projects and return your exports. Our hosting and storage providers may perform those tasks for us. This license does not grant us the right to sell your drawings or use them in advertising.</p>
      <h2>Accounts and free trials</h2>
      <p>Keep your account credentials secure. Eligible verified accounts can start a three-day (72-hour) trial. No credit card is required. The trial ends automatically without a charge. Editing remains free after the trial. You must make a separate purchase to continue clean downloads. Drafts stay in your browser unless saved to your account. A trial is available once per account. Trial limits also apply to email addresses and signup networks. Creating additional accounts or bypassing trial or payment limits is prohibited.</p>
      <h2>Project credits and monthly access</h2>
      <p>A $9 USD project credit is a one-time purchase. Applying it unlocks one saved project tied to its original PDF or image. You can edit that project and export revisions while the purchase remains valid. A new blueprint needs a separate project. Your first project purchase includes a 7-day money-back guarantee, described in Refunds & cancellation. Deleting a project leaves its credit used.</p>
      <p>Monthly access covers unlimited projects during the paid period and costs $19 USD when you subscribe and renews at $19 USD each month until you cancel. To stop the next charge, open <a className="accountTextLink" href="/#/account/billing">Billing</a>, choose <strong>Cancel subscription</strong> and confirm in Stripe before your next renewal. You keep access through the end of the paid period. Downloads for subscription-only projects become unavailable after that period ends. Export your work before access ends. Independently purchased projects remain available while their credits are valid.</p>
      <p>All charges are in US dollars. Payments for the current monthly period are nonrefundable except where required by law. By selecting the Terms of Service agreement and then choosing Subscribe for $19/month, you authorize the monthly charges described with your order and in these terms. Your recorded agreement identifies the price, renewal frequency and cancellation method shown with your order.</p>
      <p>Deleting your account cancels its subscription and ends access immediately, including access to purchased projects. Before deleting your account, export the plans you want to keep and save any subscription confirmation from <a className="accountTextLink" href="/#/account/billing">Billing</a>.</p>
      <h2>Using your revisions</h2>
      <p>Exports are working markups. Scale, dimensions and edits can contain errors. Verify measurements against the site and have a qualified professional review plans used for construction, permitting or structural changes. The editor does not certify code compliance or provide architectural or engineering approval. Keep backups of important plans. These terms preserve rights and remedies that applicable law does not allow us to limit.</p>
      <p>Building codes, local amendments, permit submission rules and requirements for a licensed architect or engineer vary by state, locality and project. Confirm the applicable rules with the building department where the property is located. Editing a drawing does not replace any required professional review or seal.</p>
      <p>See <a className="accountTextLink" href="/refunds-and-cancellation">Refunds &amp; cancellation</a> for billing terms. Contact <a className="accountTextLink" href="/support">Support</a> for account and service questions.</p>
    </>
  );
}

function Privacy() {
  return (
    <>
      <SellerContact />
      <p>Effective <time dateTime="2026-11-20">November 20, 2026</time>. This update explains how your browser keeps a preview during sign-in and checkout. We post a summary and a new effective date here when our privacy practices change materially.</p>
      <h2>Accounts and Google sign-in</h2>
      <p>Supabase handles authentication. We use your email address, account identifier and any profile name to operate your account.</p>
      <p>If you select Continue with Google, we send you to Google to authenticate. Google learns you are signing in to this service and shares an account identifier, email and available profile details with Supabase so we can sign you in. We use Google Search Console to see how our public pages appear in Google Search. We do not send your drawings or support messages to Google for search reporting.</p>
      <h2>Account and support email</h2>
      <p>Supabase sends account confirmations, password resets and email-change messages through Resend. Resend processes your email address, message content and delivery events. When you email <SupportContact />, Zoho Mail stores your address, correspondence and attachments so we can respond to account, privacy and billing requests. Contact us there to request access or deletion of support correspondence.</p>
      <h2>Floor plans and browser storage</h2>
      <p>New drafts normally stay in this browser, separated by signed-in account. Older drafts saved before account separation remain on the original browser. When you import a PDF, the editor renders the page you select in your browser. When you apply a credit to a project or update a previously saved cloud project, Supabase stores its background image in private storage and its name and edits in a database.</p>
      <p>If you open a plan in preview and continue to sign-in or checkout, the editor can save a temporary copy of the preview in this browser so you can return to it. This tab can reopen that copy for up to 24 hours. The editor clears expired copies the next time it accesses preview storage. Clearing site data also removes them.</p>
      <p>We use local browser storage for draft plans, the selected project, your sign-in session, recovery steps and your analytics choice. Clearing site data can sign you out and erase local drafts. Google and Stripe manage cookies and storage on their own pages when you use their services.</p>
      <h2>Trial eligibility</h2>
      <p>At signup, Supabase supplies your network address. We derive a protected identifier from the IPv4 address or IPv6 network prefix. Unused signup identifiers expire after seven days. Starting a trial records the dates and the version of the trial terms you accepted. Protected identifiers for the verified email and signup network block repeat claims for 90 days. Expired identifiers are removed during later signup and trial checks. People on the same network can share a trial limit.</p>
      <h2>Hosting and optional analytics</h2>
      <p>Vercel hosts the site and receives network and request information needed to deliver it. If you accept optional analytics, Vercel Web Analytics counts visits to pages and editor screens and can process the referring site, approximate location and browser or device information. It uses no analytics cookies. We send fixed page names and remove query strings and fragments from pageview URLs. Account details and drawing contents are excluded from those URLs.</p>
      <p>Analytics is off until you accept. You can change your choice below. When your browser sends a Global Privacy Control signal, optional analytics stays off. The editor has no advertising pixels. If you choose Google sign-in or Stripe checkout, those providers may recognize you across services under their own privacy policies. <a className="accountTextLink" href="https://policies.google.com/privacy">Google Privacy Policy</a> · <a className="accountTextLink" href="https://stripe.com/privacy">Stripe Privacy Policy</a>.</p>
      <PrivacyChoices />
      <h2>Billing</h2>
      <p>Stripe processes payments and manages payment methods, invoices and subscriptions on its own pages. Stripe receives your email, an account reference, the selected plan and the payment information you enter. Our app stores billing references and payment or subscription status to manage access. Our app does not receive or store your full card number. Test checkouts, when offered, are labeled as test mode.</p>
      <p>When you agree to a monthly subscription and start checkout, we store the checkbox wording, its version and the time you accepted it with your account and Stripe customer and checkout references. After Stripe confirms the first payment, we also store the subscription and invoice references, the amount paid, the payment date and the end of the first paid period. You can download your latest confirmed subscription acknowledgment from <a className="accountTextLink" href="/#/account/billing">Billing</a>. Live billing consent and confirmation records are retained for three years after the most recent billing activity or paid period, including after account deletion, for billing evidence. Account deletion removes their link to your app account. Expired records are removed during later checkout checks. Test billing records are removed when account deletion completes.</p>
      <h2>Deletion and privacy requests</h2>
      <p>Download important files before deleting a project or your account. Open <a className="accountTextLink" href="/#/account/security">Sign-in &amp; security</a> to request account deletion. Completed deletion removes your account and cloud plans and clears that account’s drafts in the current browser when storage is available. Downloads, older unassigned drafts and copies on other devices may remain. You can remove those copies from the device where they are stored.</p>
      <p>Deleting your account does not automatically delete email correspondence in Zoho. Limited trial identifiers can remain until their eligibility period expires. Service providers may retain delivery, security, billing or backup records under their retention practices or legal obligations. Contact <a className="accountTextLink" href="/support">Support</a> to ask about your information, including access, correction or deletion requests. We may need to verify your identity before acting on a request.</p>
    </>
  );
}

function RefundsAndCancellation() {
  return (
    <>
      <h2>$9 project credit</h2>
      <p>The $9 USD charge is a one-time purchase. Your first project purchase has a 7-day money-back guarantee: email support within 7 days of payment for a full refund, even if you applied the credit or downloaded your plan. Refunding removes the purchased project’s download access. Other project credits are refundable while unused. A credit is used when you apply it to a project. Deleting that project does not restore the credit. Contact <a className="accountTextLink" href="/support">Support</a> to request a refund.</p>
      <h2>$19 monthly subscription</h2>
      <p>Your subscription costs $19 USD when you subscribe and renews at $19 USD each month until you cancel. You can cancel at any time to stop the next renewal. When you cancel renewal in the Stripe billing portal, you keep access through the end of the period you paid for. We do not refund the current billing period or prorate unused days, except where required by law. If you believe a charge was made in error, contact <a className="accountTextLink" href="/support">Support</a> so we can correct it.</p>
      <p>To cancel, open <a className="accountTextLink" href="/#/account/billing">Billing</a>, choose <strong>Cancel subscription</strong> and confirm in Stripe before your next renewal. If you cannot access Billing, email <SupportContact /> for help canceling. Download any subscription projects you need before the paid period ends.</p>
      <p>If you delete your account, its subscription is canceled and access ends immediately. Export the plans you want to keep and save any subscription confirmation from <a className="accountTextLink" href="/#/account/billing">Billing</a> before deleting your account.</p>
      <h2>Free trial</h2>
      <p>The three-day free trial ends automatically without a charge. Paid access begins only if you choose to purchase it.</p>
      <p>These terms preserve any rights and remedies you have under applicable law. If you need help retrieving your files after access ends, contact <a className="accountTextLink" href="/support">Support</a>.</p>
    </>
  );
}

export function CustomerPolicyPage({ page }) {
  const heading = useRef(null);
  useEffect(() => {
    const settings = page === 'privacy' && window.location.hash === '#cookie-settings'
      ? document.getElementById('cookie-settings') : null;
    (settings || heading.current)?.focus();
  }, [page]);
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
