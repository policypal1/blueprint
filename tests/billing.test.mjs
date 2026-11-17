import test from 'node:test';
import assert from 'node:assert/strict';
import { accountHandler } from '../supabase/functions/planpatch-account/handler.js';
import { createCheckout, fulfillVerifiedEvent } from '../supabase/functions/planpatch-account/billing.js';

const customer = 'cus_test_customer';
const attempt = '26c51846-2da0-4148-bfb0-9c0f9e29e03a';
const origin = 'https://planpatch.test';
const charge = { livemode: false, captured: true, paid: true, amount_refunded: 0, disputed: false };
const metadata = (plan) => ({ application: 'planpatch-sandbox', plan });
const event = (type, object, livemode = false) => ({ type, livemode, data: { object } });

test('checkout uses only the two server-side sandbox prices', async () => {
  const requests = [];
  const stripe = { checkout: { sessions: { create: async (data, options) => {
    requests.push([data, options]);
    return { url: 'https://checkout.stripe.com/c/pay/cs_test_fixture', livemode: false };
  } } } };
  const request = { customer, origin, attempt, owner: 'signed-in-owner' };
  await createCheckout(stripe, { ...request, plan: 'project' });
  await createCheckout(stripe, { ...request, plan: 'monthly' });
  assert.equal(await createCheckout(stripe, { ...request, plan: 'unknown' }), null);
  assert.equal(await createCheckout(stripe, { ...request, plan: 'monthly', attempt: '' }), null);
  assert.deepEqual(requests.map(([data]) => [data.mode, data.line_items[0].price_data.unit_amount]),
    [['payment', 1000], ['subscription', 1900]]);
  assert.ok(requests.every(([data, options]) => data.customer === customer &&
    data.client_reference_id === 'signed-in-owner' && options.idempotencyKey.includes(attempt)));
  assert.equal(requests[1][0].line_items[0].price_data.recurring.interval, 'month');
});

test('one paid sandbox checkout grants one credit and a refund revokes it', async () => {
  const writes = [];
  const checkout = { id: 'cs_test_credit', metadata: metadata('project'), livemode: false,
    mode: 'payment', customer, status: 'complete', payment_status: 'paid', payment_intent: 'pi_fixture' };
  const testCharge = { ...charge };
  const stripe = {
    checkout: { sessions: { retrieve: async () => checkout } },
    paymentIntents: { retrieve: async () => ({ customer, currency: 'usd', amount_received: 1000,
      livemode: false, status: 'succeeded', latest_charge: testCharge }) },
  };
  const admin = { rpc: async (name, args) => {
    if (name === 'planpatch_sandbox_grants_for_intent') return { data: [{ kind: 'project', reference: checkout.id }] };
    writes.push(args);
    return { data: null };
  } };
  await fulfillVerifiedEvent(event('checkout.session.completed', checkout, true), stripe, admin);
  assert.equal(writes.length, 0);
  await fulfillVerifiedEvent(event('checkout.session.completed', checkout), stripe, admin);
  assert.equal(writes[0].is_paid, true);
  assert.equal(writes[0].grant_reference, checkout.id);
  testCharge.amount_refunded = 1000;
  await fulfillVerifiedEvent(event('charge.refunded', { payment_intent: 'pi_fixture' }), stripe, admin);
  assert.equal(writes[1].is_paid, false);
});

test('monthly access requires a settled invoice and expires at the subscription item period end', async () => {
  const writes = [];
  const currentPeriodEnd = 1830000000;
  const sub = { id: 'sub_fixture', metadata: metadata('monthly'), livemode: false, status: 'active',
    customer, latest_invoice: { id: 'in_fixture', customer, status: 'paid', amount_paid: 1900 },
    items: { data: [{ current_period_end: currentPeriodEnd,
      price: { currency: 'usd', unit_amount: 1900, recurring: { interval: 'month', interval_count: 1 } } }] },
  };
  const stripe = {
    subscriptions: { retrieve: async () => sub },
    invoicePayments: { list: async () => ({ data: [{ payment: { type: 'payment_intent', payment_intent: 'pi_month' }}] }) },
    paymentIntents: { retrieve: async () => ({ customer, currency: 'usd', amount_received: 1900,
      livemode: false, status: 'succeeded', latest_charge: charge }) },
  };
  const admin = { rpc: async (_name, args) => { writes.push(args); return {}; } };
  const invoice = { parent: { subscription_details: { subscription: sub.id } } };
  await fulfillVerifiedEvent(event('invoice.paid', invoice), stripe, admin);
  assert.equal(writes[0].is_paid, true);
  assert.equal(writes[0].access_until, new Date(currentPeriodEnd * 1000).toISOString());
  sub.status = 'past_due';
  await fulfillVerifiedEvent(event('invoice.payment_failed', invoice), stripe, admin);
  assert.equal(writes[1].is_paid, false);
});

test('the account endpoint rejects unsigned requests and invalid Stripe signatures', async () => {
  const handler = accountHandler({
    siteOrigin: origin, admin: {}, webhookSecret: 'whsec_fixture',
    test: { webhooks: { constructEventAsync: async () => { throw new Error('Bad signature'); } } },
    clientFor: () => { throw new Error('Unauthorized requests must not reach the database'); },
  });
  const anonymous = await handler(new Request(origin, { method: 'POST', body: '{}' }));
  assert.equal(anonymous.status, 401);
  const forged = await handler(new Request(origin, {
    method: 'POST', headers: { 'stripe-signature': 'fake' }, body: '{}',
  }));
  assert.equal(forged.status, 400);
  const crossOrigin = await handler(new Request(origin, { headers: { Origin: 'https://elsewhere.test' } }));
  assert.equal(crossOrigin.status, 403);
});

test('the custom domain and existing Vercel address can check a signed-in account', async () => {
  const sites = ['https://www.editfloorplans.com', 'https://editfloorplans.com', 'https://blueprint-blue-theta.vercel.app'];
  const handler = accountHandler({
    siteOrigin: sites[2],
    clientFor: (authorization) => {
      assert.equal(authorization, 'Bearer signed-in-fixture');
      return {
        rpc: (name) => ({ maybeSingle: async () => ({
          data: name === 'planpatch_session'
            ? { user_id: 'fixture-owner', deleting: false }
            : { payments_required: true, project_ids: ['fixture-project'] },
        }) }),
      };
    },
  });
  for (const site of sites) {
    const preflight = await handler(new Request(origin, { method: 'OPTIONS', headers: { Origin: site } }));
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('access-control-allow-origin'), site);
    const access = await handler(new Request(origin, {
      method: 'POST',
      headers: { Origin: site, Authorization: 'Bearer signed-in-fixture', 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'status' }),
    }));
    assert.equal(access.status, 200);
    assert.equal(access.headers.get('access-control-allow-origin'), site);
    assert.equal((await access.json()).paymentsRequired, true);
  }
});
