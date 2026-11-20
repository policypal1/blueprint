import { MONTHLY_VERSION as TEST_VERSION, MONTHLY_DISCLOSURE as TEST_DISCLOSURE, LIVE_MONTHLY_VERSION, LIVE_MONTHLY_DISCLOSURE, MONTHLY_CANCELLATION_URL } from './monthly-offer.js';

const AMOUNTS = { project: 1000, monthly: 1900 };
const CHECKOUT_EVENTS = new Set([
  'checkout.session.completed', 'checkout.session.async_payment_succeeded', 'checkout.session.async_payment_failed',
]);
const SUBSCRIPTION_EVENTS = new Set(['customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted', 'customer.subscription.paused', 'customer.subscription.resumed']);
const INVOICE_EVENTS = new Set(['invoice.paid', 'invoice.payment_failed']);
const REVERSAL_EVENTS = new Set(['charge.refunded', 'charge.dispute.created', 'charge.dispute.closed']);

const stripeId = (object) => typeof object === 'string' ? object : object?.id;

function checked({ data, error }) {
  if (error) throw error;
  return data;
}

export function validAttempt(attempt) {
  return typeof attempt === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(attempt);
}

export function createBilling({ livemode = false, prices = {}, portalConfiguration } = {}) {
const MARKER = livemode ? 'planpatch-live' : 'planpatch-sandbox';
const MONTHLY_VERSION = livemode ? LIVE_MONTHLY_VERSION : TEST_VERSION;
const MONTHLY_DISCLOSURE = livemode ? LIVE_MONTHLY_DISCLOSURE : TEST_DISCLOSURE;
const customerColumn = livemode ? 'stripe_customer_id' : 'stripe_test_customer_id';
const rpc = (testName) => livemode ? testName.replace('_test_', '_live_').replace('_sandbox_', '_live_') : testName;
const belongsToPlanPatch = (object) => object?.livemode === livemode && object.metadata?.application === MARKER;

async function createCheckout(stripe, { plan, customer, owner, origin, attempt, reservation }) {
  if (!Object.hasOwn(AMOUNTS, plan) || !validAttempt(attempt)) return null;
  const monthly = plan === 'monthly';
  if (monthly && !reservation?.id) return null;
  if (livemode) {
    if (!/^price_[A-Za-z0-9]+$/.test(prices[plan] ?? '')) throw new Error('Live price is unavailable.');
    const price = await stripe.prices.retrieve(prices[plan]);
    if (!price.active || price.livemode !== true || price.currency !== 'usd' || price.unit_amount !== AMOUNTS[plan]
        || (monthly ? price.recurring?.interval !== 'month' || price.recurring.interval_count !== 1 : Boolean(price.recurring))) {
      throw new Error('Live price does not match the selected offer.');
    }
  }
  const metadata = monthly
    ? { application: MARKER, plan, subscription_consent: reservation.id, offer_version: MONTHLY_VERSION }
    : { application: MARKER, plan };
  const session = await stripe.checkout.sessions.create({
    mode: monthly ? 'subscription' : 'payment',
    customer,
    client_reference_id: owner,
    integration_identifier: 'planpatch-editor-aegnqkrs',
    metadata,
    line_items: livemode ? [{ quantity: 1, price: prices[plan] }] : [{
      quantity: 1,
      price_data: {
        currency: 'usd',
        unit_amount: AMOUNTS[plan],
        product_data: { name: monthly ? 'EditFloorPlans.com monthly access' : 'EditFloorPlans.com single project' },
        ...(monthly ? { recurring: { interval: 'month' } } : {}),
      },
    }],
    ...(monthly ? {
      subscription_data: { metadata },
      expires_at: reservation.expires_at,
      custom_text: { submit: {
        message: (livemode ? '' : 'Test mode. ') + MONTHLY_DISCLOSURE
          + ' [Manage or cancel](' + MONTHLY_CANCELLATION_URL + ') · [Support](https://www.editfloorplans.com/support)',
      } },
    } : {}),
    success_url: origin + (livemode ? '/?checkout=returned#/account/billing' : '/?sandbox_checkout=returned#/account/billing'),
    cancel_url: origin + '/#/account/billing',
  }, { idempotencyKey: (livemode ? 'planpatch-live-checkout:' : 'planpatch-checkout:') + customer + ':' + plan + ':' + (monthly ? reservation.id : attempt) });
  if (session.livemode !== livemode || !session.url) throw new Error('Unexpected checkout mode.');
  return session;
}

async function currentSubscription(stripe, customer) {
  for await (const sub of stripe.subscriptions.list({ customer, status: 'all', limit: 100 })) {
    if (stripeId(sub.customer) === customer && belongsToPlanPatch(sub) && sub.metadata.plan === 'monthly'
        && !['canceled', 'incomplete_expired'].includes(sub.status)) return sub;
  }
  return null;
}

async function openBillingPortal(stripe, customer, returnUrl, cancelMonthly) {
  const options = { customer, return_url: returnUrl, ...(livemode ? { configuration: portalConfiguration } : {}) };
  if (livemode && !portalConfiguration) throw new Error('Live billing portal is unavailable.');
  if (cancelMonthly) {
    const sub = await currentSubscription(stripe, customer);
    if (sub && !sub.cancel_at_period_end && !sub.cancel_at) {
      options.flow_data = { type: 'subscription_cancel', subscription_cancel: { subscription: sub.id } };
    }
  }
  return stripe.billingPortal.sessions.create(options);
}

async function monthlyCheckout(stripe, admin, options) {
  const { owner, customer } = options;
  // Entitlements can lag webhooks. Check Stripe before opening a second subscription.
  if (await currentSubscription(stripe, customer)) return null;
  const reservation = checked(await admin.rpc(rpc('planpatch_reserve_test_subscription'), {
    owner_id: owner, customer, accepted_version: MONTHLY_VERSION, disclosure: MONTHLY_DISCLOSURE,
  }).single());
  if (!reservation) throw new Error('Missing subscription consent.');
  if (reservation.checkout_id) {
    const session = await stripe.checkout.sessions.retrieve(reservation.checkout_id);
    return belongsToPlanPatch(session) && session.metadata.subscription_consent === reservation.id
      && session.mode === 'subscription' && session.status === 'open'
      && stripeId(session.customer) === customer && session.client_reference_id === owner ? session.url : null;
  }
  const session = await createCheckout(stripe, { ...options, reservation });
  if (!session || !checked(await admin.rpc(rpc('planpatch_bind_test_checkout'), {
    owner_id: owner, consent_id: reservation.id, checkout: session.id,
  }))) throw new Error('Unable to bind the checkout to the account.');
  return session.url;
}

async function settledIntent(stripe, intent, customer, minimum, includeReversed = false) {
  const id = stripeId(intent);
  if (!id) return false;
  const payment = await stripe.paymentIntents.retrieve(id, { expand: ['latest_charge'] });
  const charge = payment.latest_charge;
  return payment.livemode === livemode && payment.status === 'succeeded' && payment.currency === 'usd'
    && stripeId(payment.customer) === customer && payment.amount_received >= minimum
    && charge?.livemode === livemode && charge.captured && charge.paid
    && (includeReversed || (charge.amount_refunded === 0 && !charge.disputed));
}

async function recordGrant(admin, { customer, reference, kind, intent, paid, until, snapshotAt }) {
  if (!customer) return;
  checked(await admin.rpc(rpc('planpatch_record_sandbox_grant'), {
    customer, grant_reference: reference, grant_kind: kind, intent: intent ?? null,
    is_paid: paid, access_until: until ?? null, snapshot_at: snapshotAt,
  }));
}

async function syncProject(stripe, admin, checkoutId) {
  const snapshotAt = new Date().toISOString();
  const checkout = await stripe.checkout.sessions.retrieve(checkoutId);
  if (!belongsToPlanPatch(checkout) || checkout.metadata.plan !== 'project' || checkout.mode !== 'payment') return;
  if (livemode) {
    const lines = await stripe.checkout.sessions.listLineItems(checkout.id, { limit: 2 });
    if (lines.data.length !== 1 || stripeId(lines.data[0].price) !== prices.project || lines.data[0].quantity !== 1) return;
  }
  const intent = stripeId(checkout.payment_intent);
  const customer = stripeId(checkout.customer);
  const paid = checkout.status === 'complete' && checkout.payment_status === 'paid'
    && await settledIntent(stripe, intent, customer, AMOUNTS.project);
  await recordGrant(admin, { customer, reference: checkout.id, kind: 'project', intent, paid, snapshotAt });
}

async function paidInvoiceIntent(stripe, invoice, customer, includeReversed = false) {
  const payments = await stripe.invoicePayments.list({ invoice: invoice.id, status: 'paid', limit: 100 });
  for (const entry of payments.data) {
    if (entry.payment.type === 'payment_intent'
        && await settledIntent(stripe, entry.payment.payment_intent, customer, AMOUNTS.monthly, includeReversed)) {
      return stripeId(entry.payment.payment_intent);
    }
  }
  return null;
}

async function confirmInitialInvoice(stripe, admin, sub, item, invoiceId) {
  const consent = sub.metadata.subscription_consent;
  if (!consent || !item || !invoiceId) return;
  // A delayed event may arrive after cancellation or after the next invoice already exists.
  const invoice = sub.latest_invoice?.id === invoiceId ? sub.latest_invoice : await stripe.invoices.retrieve(invoiceId);
  const customer = stripeId(sub.customer);
  if (invoice.billing_reason !== 'subscription_create' || invoice.livemode !== livemode
      || invoice.status !== 'paid' || invoice.currency !== 'usd' || invoice.amount_paid < AMOUNTS.monthly
      || stripeId(invoice.customer) !== customer || stripeId(invoice.parent?.subscription_details?.subscription) !== sub.id) return;
  const line = invoice.lines?.data.find(line => stripeId(line.parent?.subscription_item_details?.subscription_item) === item.id);
  const paidAt = invoice.status_transitions?.paid_at;
  if (!await paidInvoiceIntent(stripe, invoice, customer, true)) return;
  if (!paidAt || !line?.period?.end) throw new Error('Initial invoice details unavailable.');
  const confirmed = checked(await admin.rpc(rpc('planpatch_confirm_test_subscription'), {
    consent_id: consent, customer, subscription: sub.id, invoice: invoice.id, amount_cents: invoice.amount_paid,
    paid_on: new Date(paidAt * 1000).toISOString(), period_end: new Date(line.period.end * 1000).toISOString(),
  }));
  if (!confirmed) {
    const account = checked(await admin.from('planpatch_accounts').select('user_id')
      .eq(customerColumn, customer).is('deletion_started_at', null).maybeSingle());
    if (account) throw new Error('The paid invoice could not be matched to its consent record.');
  }
}

async function syncMonthly(stripe, admin, subscriptionId, paidInvoiceId) {
  if (!subscriptionId) return;
  const snapshotAt = new Date().toISOString();
  const sub = await stripe.subscriptions.retrieve(subscriptionId, { expand: ['latest_invoice'] });
  if (!belongsToPlanPatch(sub) || sub.metadata.plan !== 'monthly') return;
  const customer = stripeId(sub.customer);
  const invoice = sub.latest_invoice;
  const item = sub.items.data.find(({ price }) => (!livemode || price.id === prices.monthly) && price.currency === 'usd' && price.unit_amount === AMOUNTS.monthly
    && price.recurring?.interval === 'month' && price.recurring.interval_count === 1);
  await confirmInitialInvoice(stripe, admin, sub, item, paidInvoiceId);
  let intent;
  if (sub.status === 'active' && item?.current_period_end && invoice?.status === 'paid'
      && (!livemode || invoice.livemode === true)
      && stripeId(invoice.customer) === customer && invoice.amount_paid >= AMOUNTS.monthly) {
    intent = await paidInvoiceIntent(stripe, invoice, customer);
  }
  const until = item?.current_period_end ? new Date(item.current_period_end * 1000).toISOString() : null;
  await recordGrant(admin, { customer, reference: sub.id, kind: 'monthly', intent, paid: Boolean(intent), until, snapshotAt });
}

async function syncReversal(stripe, admin, item) {
  let intent = stripeId(item.payment_intent);
  if (!intent && item.charge) intent = stripeId((await stripe.charges.retrieve(stripeId(item.charge))).payment_intent);
  if (!intent) return;
  const grants = checked(await admin.rpc(rpc('planpatch_sandbox_grants_for_intent'), { intent })) ?? [];
  for (const grant of grants) {
    if (grant.kind === 'monthly') await syncMonthly(stripe, admin, grant.reference);
    else await syncProject(stripe, admin, grant.reference);
  }
}

async function fulfillVerifiedEvent(event, stripe, admin) {
  if (event.livemode !== livemode) return;
  const object = event.data.object;
  if (CHECKOUT_EVENTS.has(event.type)) {
    if (!belongsToPlanPatch(object)) return;
    if (object.mode === 'subscription') {
      await syncMonthly(stripe, admin, stripeId(object.subscription), stripeId(object.invoice));
    } else {
      await syncProject(stripe, admin, object.id);
    }
  } else if (SUBSCRIPTION_EVENTS.has(event.type)) {
    await syncMonthly(stripe, admin, object.id);
  } else if (INVOICE_EVENTS.has(event.type)) {
    const sub = object.parent?.subscription_details?.subscription;
    await syncMonthly(stripe, admin, stripeId(sub), event.type === 'invoice.paid' ? object.id : null);
  } else if (REVERSAL_EVENTS.has(event.type)) {
    await syncReversal(stripe, admin, object);
  } else if (event.type === 'radar.early_fraud_warning.created') {
    const intent = stripeId(object.payment_intent)
      || stripeId((await stripe.charges.retrieve(stripeId(object.charge))).payment_intent);
    if (intent) checked(await admin.rpc(rpc('planpatch_hold_sandbox_payment'), {
      intent, snapshot_at: new Date().toISOString(),
    }));
  }
}

return { createCheckout, monthlyCheckout, openBillingPortal, fulfillVerifiedEvent };
}

// Existing sandbox callers and fixtures retain their isolated integration.
export const { createCheckout, monthlyCheckout, openBillingPortal, fulfillVerifiedEvent } = createBilling();
