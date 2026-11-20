import test from 'node:test';
import assert from 'node:assert/strict';
import { createBilling } from '../supabase/functions/planpatch-account/billing.js';
import { accountHandler } from '../supabase/functions/planpatch-account/handler.js';
import { LIVE_MONTHLY_VERSION, LIVE_MONTHLY_DISCLOSURE, MONTHLY_VERSION } from '../supabase/functions/planpatch-account/monthly-offer.js';

const prices = { project: 'price_liveProject', monthly: 'price_liveMonthly' };
const configuration = { billing_live: true, checkout_enabled: true, project_price: prices.project,
  monthly_price: prices.monthly, portal_configuration: 'bpc_liveFixture' };
const billing = createBilling({ livemode: true, prices, portalConfiguration: configuration.portal_configuration });
const owner = 'owner-from-session';
const customer = 'cus_liveFixture';
const origin = 'https://www.editfloorplans.com';
const attempt = '26c51846-2da0-4148-bfb0-9c0f9e29e03a';
const metadata = plan => ({ application: 'planpatch-live', plan });
const event = (type, object, livemode = true) => ({ type, livemode, data: { object } });
const charge = { livemode: true, captured: true, paid: true, amount_refunded: 0, disputed: false };

test('live checkout validates fixed server prices and keeps live renewal consent separate', async () => {
  const requests = [];
  let livePrice = true;
  const stripe = { prices: { retrieve: async id => ({ id, active: true, livemode: livePrice, currency: 'usd',
    unit_amount: id === prices.project ? 1000 : 1900,
    ...(id === prices.monthly ? { recurring: { interval: 'month', interval_count: 1 } } : {}) }) },
  checkout: { sessions: { create: async params => {
    requests.push(params); return { livemode: true, url: 'https://checkout.stripe.com/live' };
  } } } };
  const options = { customer, origin, owner, attempt };
  await billing.createCheckout(stripe, { ...options, plan: 'project', price: 'price_attacker', amount: 1 });
  await billing.createCheckout(stripe, { ...options, plan: 'monthly', reservation: { id: 'live-consent', expires_at: 2000000000 } });
  assert.deepEqual(requests.map(r => r.line_items), [
    [{ quantity: 1, price: prices.project }], [{ quantity: 1, price: prices.monthly }],
  ]);
  assert.ok(requests.every(r => r.metadata.application === 'planpatch-live' && !('payment_method_types' in r)));
  assert.equal(requests[1].metadata.offer_version, LIVE_MONTHLY_VERSION);
  assert.ok(requests[1].custom_text.submit.message.startsWith(LIVE_MONTHLY_DISCLOSURE));
  assert.equal(requests[1].success_url, origin + '/?checkout=returned#/account/billing');
  livePrice = false;
  await assert.rejects(() => billing.createCheckout(stripe, { ...options, plan: 'project' }), /price/);
  assert.equal(requests.length, 2);
});

test('live project access requires the correct price, settled customer payment and no refund or dispute', async () => {
  const writes = [];
  const checkout = { id: 'cs_liveFixture', metadata: metadata('project'), livemode: true, mode: 'payment',
    customer, status: 'complete', payment_status: 'paid', payment_intent: 'pi_liveFixture' };
  const payment = { customer, livemode: true, status: 'succeeded', currency: 'usd', amount_received: 1000,
    latest_charge: { ...charge } };
  let price = prices.project;
  const stripe = { checkout: { sessions: { retrieve: async () => checkout,
    listLineItems: async () => ({ data: [{ price: { id: price }, quantity: 1 }] }) } },
    paymentIntents: { retrieve: async () => payment } };
  const admin = { rpc: async (name, args) => {
    if (name === 'planpatch_live_grants_for_intent') return { data: [{ reference: checkout.id, kind: 'project' }] };
    writes.push({ name, args }); return { data: null };
  } };
  await billing.fulfillVerifiedEvent(event('checkout.session.completed', checkout, false), stripe, admin);
  price = 'price_wrong';
  await billing.fulfillVerifiedEvent(event('checkout.session.completed', checkout), stripe, admin);
  assert.equal(writes.length, 0);
  price = prices.project;
  payment.customer = 'cus_wrong';
  await billing.fulfillVerifiedEvent(event('checkout.session.completed', checkout), stripe, admin);
  assert.equal(writes.at(-1).args.is_paid, false);
  payment.customer = customer;
  await billing.fulfillVerifiedEvent(event('checkout.session.async_payment_succeeded', checkout), stripe, admin);
  await billing.fulfillVerifiedEvent(event('checkout.session.completed', checkout), stripe, admin);
  assert.ok(writes.slice(-2).every(w => w.args.is_paid && w.args.grant_reference === checkout.id));
  assert.ok(writes.every(w => w.name === 'planpatch_record_live_grant'));
  payment.latest_charge.amount_refunded = 1000;
  await billing.fulfillVerifiedEvent(event('charge.refunded', { payment_intent: checkout.payment_intent }), stripe, admin);
  assert.equal(writes.at(-1).args.is_paid, false);
  payment.latest_charge.amount_refunded = 0;
  payment.latest_charge.disputed = true;
  await billing.fulfillVerifiedEvent(event('charge.dispute.created', { payment_intent: checkout.payment_intent }), stripe, admin);
  assert.equal(writes.at(-1).args.is_paid, false);
});

test('live monthly renewal reconciles actual invoices and fraud signals revoke the affected payment', async () => {
  const writes = [];
  const sub = { id: 'sub_liveFixture', livemode: true, metadata: metadata('monthly'), customer, status: 'active',
    items: { data: [{ current_period_end: 2001000000, price: { id: prices.monthly, currency: 'usd', unit_amount: 1900,
      recurring: { interval: 'month', interval_count: 1 } } }] },
    latest_invoice: { id: 'in_liveFixture', livemode: true, customer, status: 'paid', amount_paid: 1900 } };
  const stripe = { subscriptions: { retrieve: async () => sub },
    invoicePayments: { list: async () => ({ data: [{ payment: { type: 'payment_intent', payment_intent: 'pi_liveMonth' } }] }) },
    paymentIntents: { retrieve: async () => ({ livemode: true, customer, status: 'succeeded', currency: 'usd',
      amount_received: 1900, latest_charge: charge }) } };
  const admin = { rpc: async (name, args) => { writes.push({ name, args }); return { data: null }; } };
  await billing.fulfillVerifiedEvent(event('customer.subscription.updated', sub), stripe, admin);
  assert.equal(writes.at(-1).args.is_paid, true);
  sub.status = 'past_due';
  await billing.fulfillVerifiedEvent(event('invoice.payment_failed', { parent: { subscription_details: { subscription: sub.id } } }), stripe, admin);
  assert.equal(writes.at(-1).args.is_paid, false);
  await billing.fulfillVerifiedEvent(event('radar.early_fraud_warning.created', { payment_intent: 'pi_liveMonth' }), stripe, admin);
  assert.equal(writes.at(-1).name, 'planpatch_hold_live_payment');
});

test('live account checkout ignores client mode, customer, owner and price, and rejects test consent', async () => {
  let created;
  const reservation = { id: 'reserved-live-consent', expires_at: 2000000000 };
  const handler = accountHandler({ siteOrigin: origin, liveWebhookSecret: 'whsec_fixture',
    getBillingConfig: async () => configuration,
    live: { subscriptions: { list: () => [] }, prices: { retrieve: async () => ({ active: true, livemode: true,
      currency: 'usd', unit_amount: 1900, recurring: { interval: 'month', interval_count: 1 } }) },
      checkout: { sessions: { create: async params => {
        created = params; return { id: 'cs_liveReserved', livemode: true, url: 'https://checkout.stripe.com/live' };
      } } } },
    clientFor: () => ({ rpc: name => ({ maybeSingle: async () => ({ data: name === 'planpatch_session' ? { user_id: owner } : { monthly: false } }) }) }),
    admin: { from: () => ({ upsert: async () => ({}), select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { stripe_customer_id: customer } }) }) }) }),
      rpc: (name, args) => {
        if (name === 'planpatch_reserve_live_subscription') {
          assert.equal(args.owner_id, owner); assert.equal(args.customer, customer);
          assert.equal(args.disclosure, LIVE_MONTHLY_DISCLOSURE);
          return { single: async () => ({ data: reservation }) };
        }
        assert.equal(name, 'planpatch_bind_live_checkout'); return Promise.resolve({ data: true });
      } },
  });
  const request = version => new Request(origin, { method: 'POST', headers: { Authorization: 'Bearer owner' },
    body: JSON.stringify({ action: 'checkout', plan: 'monthly', attempt, mode: 'test', price: 'price_wrong', owner: 'wrong',
      customer: 'cus_wrong', consent: { accepted: true, version } }) });
  assert.equal((await handler(request(MONTHLY_VERSION))).status, 400);
  assert.equal((await handler(request(LIVE_MONTHLY_VERSION))).status, 200);
  assert.equal(created.customer, customer); assert.equal(created.client_reference_id, owner);
  assert.deepEqual(created.line_items, [{ quantity: 1, price: prices.monthly }]);
});

test('pending Stripe activation blocks checkout without falling back to sandbox', async () => {
  const handler = accountHandler({ siteOrigin: origin, live: {}, test: {}, liveWebhookSecret: 'whsec_fixture',
    getBillingConfig: async () => ({ ...configuration, checkout_enabled: false }),
    clientFor: () => ({ rpc: () => ({ maybeSingle: async () => ({ data: { user_id: owner } }) }) }),
    admin: { from() { throw new Error('Must not create a customer while payments are paused.'); } } });
  const response = await handler(new Request(origin, { method: 'POST', headers: { Authorization: 'Bearer owner' },
    body: JSON.stringify({ action: 'checkout', plan: 'project', attempt, livemode: false }) }));
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /Stripe activation/);
  const status = await (await handler(new Request(origin))).json();
  assert.equal(status.billingMode, 'live'); assert.equal(status.checkoutReady, false);
});

test('webhook signatures bind each event to its own mode and unverified requests cannot fulfill', async () => {
  const sdk = mode => ({ webhooks: { constructEventAsync: async (payload, signature, secret) => {
    if (signature !== mode || secret !== 'whsec_' + mode) throw new Error('Invalid signature');
    return JSON.parse(payload);
  } } });
  const handler = accountHandler({ siteOrigin: origin, live: sdk('live'), test: sdk('test'),
    liveWebhookSecret: 'whsec_live', webhookSecret: 'whsec_test', getBillingConfig: async () => configuration,
    clientFor() { throw new Error('Webhooks do not impersonate an account.'); } });
  const request = (signature, mode) => new Request(origin, { method: 'POST', headers: { 'stripe-signature': signature },
    body: JSON.stringify(event('unhandled.event', {}, mode)) });
  assert.equal((await handler(request('forged', true))).status, 400);
  assert.equal((await handler(request('live', false))).status, 400);
  assert.equal((await handler(request('test', true))).status, 400);
  assert.equal((await handler(request('live', true))).status, 200);
  assert.equal((await handler(request('test', false))).status, 200);
});
