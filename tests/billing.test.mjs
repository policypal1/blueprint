import test from 'node:test';
import assert from 'node:assert/strict';
import { accountHandler } from '../supabase/functions/planpatch-account/handler.js';
import { MONTHLY_VERSION, MONTHLY_DISCLOSURE } from '../supabase/functions/planpatch-account/monthly-offer.js';
import { createCheckout, monthlyCheckout, openBillingPortal, fulfillVerifiedEvent } from '../supabase/functions/planpatch-account/billing.js';

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
  const reservation = { id: 'consent-reservation', expires_at: 2000000000 };
  await createCheckout(stripe, { ...request, plan: 'project' });
  assert.equal(await createCheckout(stripe, { ...request, plan: 'monthly' }), null);
  await createCheckout(stripe, { ...request, plan: 'monthly', reservation });
  assert.equal(await createCheckout(stripe, { ...request, plan: 'unknown' }), null);
  assert.equal(await createCheckout(stripe, { ...request, plan: 'monthly', attempt: '' }), null);
  assert.deepEqual(requests.map(([data]) => [data.mode, data.line_items[0].price_data.unit_amount]),
    [['payment', 1000], ['subscription', 1900]]);
  assert.ok(requests.every(([data]) => data.customer === customer && data.client_reference_id === request.owner));
  assert.ok(requests[0][1].idempotencyKey.endsWith(attempt));
  assert.ok(requests[1][1].idempotencyKey.endsWith(reservation.id));
  assert.equal(requests[1][0].subscription_data.metadata.subscription_consent, reservation.id);
  assert.equal(requests[1][0].metadata.offer_version, MONTHLY_VERSION);
  assert.ok(requests[1][0].custom_text.submit.message.startsWith('Test mode. ' + MONTHLY_DISCLOSURE));
  assert.match(requests[1][0].custom_text.submit.message, /Manage or cancel/);
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
    admin: { rpc: (_name, args) => {
      assert.equal(args.owner_id, 'fixture-owner');
      return { maybeSingle: async () => ({ data: null }) };
    } },
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

test('only the authenticated owner can accept the current monthly offer before checkout', async () => {
  const request = (body) => new Request(origin, { method: 'POST',
    headers: { Authorization: 'Bearer test-owner' }, body: JSON.stringify({ action: 'checkout', plan: 'monthly', attempt, ...body }) });
  let reads = 0;
  const handler = accountHandler({
    siteOrigin: origin, webhookSecret: 'whsec_fixture', test: {},
    clientFor: () => ({ rpc: () => ({ maybeSingle: async () => ({ data: { user_id: 'owner' } }) }) }),
    admin: { from: () => { reads++; throw new Error('unexpected customer operation'); } },
  });
  for (const consent of [null, true, { accepted: 'true', version: MONTHLY_VERSION }, { accepted: false, version: MONTHLY_VERSION },
    { accepted: true, version: 'old' }, { accepted: true }]) {
    assert.equal((await handler(request({ consent, owner: 'different-owner' }))).status, 400);
  }
  assert.equal(reads, 0);
});

test('the monthly checkout is recorded before release, reuses a reservation and rejects a mismatched Stripe owner', async () => {
  const options = { plan: 'monthly', customer, owner: 'owner', origin, attempt };
  const reservation = { id: 'reservation-1', checkout_id: null, expires_at: 2000000000 };
  const session = { id: 'cs_fixture', status: 'open', livemode: false, mode: 'subscription', customer, client_reference_id: 'owner',
    metadata: { ...metadata('monthly'), subscription_consent: reservation.id }, url: 'https://checkout.stripe.com/c/pay/test' };
  let newSessions = 0;
  let bind = true;
  let existing = [];
  const stripe = {
    subscriptions: { list: () => existing },
    checkout: { sessions: { create: async () => { newSessions++; return session; }, retrieve: async id => { assert.equal(id, session.id); return session; } } },
  };
  const admin = { rpc: (name, args) => {
    if (name === 'planpatch_reserve_test_subscription') {
      assert.deepEqual(args, { owner_id: options.owner, customer, accepted_version: MONTHLY_VERSION, disclosure: MONTHLY_DISCLOSURE });
      return { single: async () => ({ data: reservation }) };
    }
    assert.equal(name, 'planpatch_bind_test_checkout');
    assert.deepEqual(args, { owner_id: options.owner, consent_id: reservation.id, checkout: session.id });
    if (bind) reservation.checkout_id = session.id;
    return Promise.resolve({ data: bind });
  } };
  bind = false;
  await assert.rejects(() => monthlyCheckout(stripe, admin, options), /bind/);
  bind = true;
  assert.equal(await monthlyCheckout(stripe, admin, options), session.url);
  assert.equal(await monthlyCheckout(stripe, admin, { ...options, attempt: crypto.randomUUID() }), session.url);
  assert.equal(newSessions, 2);
  session.client_reference_id = 'other-owner';
  assert.equal(await monthlyCheckout(stripe, admin, options), null);
  session.client_reference_id = 'owner';
  session.status = 'complete';
  assert.equal(await monthlyCheckout(stripe, admin, options), null);
  existing = [{ livemode: false, customer, metadata: metadata('monthly'), status: 'past_due' }];
  assert.equal(await monthlyCheckout(stripe, { rpc() { throw new Error('Must not reserve'); } }, options), null);
});

test('acceptance is acknowledged only from the initial paid invoice even after a newer invoice or cancellation', async () => {
  const subId = 'sub_test';
  const item = { id: 'si_test', current_period_end: 2001000000,
    price: { currency: 'usd', unit_amount: 1900, recurring: { interval: 'month', interval_count: 1 } } };
  const initial = { id: 'in_first', customer, livemode: false, currency: 'usd', billing_reason: 'subscription_create',
    status: 'paid', amount_paid: 1900, parent: { subscription_details: { subscription: subId } },
    status_transitions: { paid_at: 2000000000 }, lines: { data: [{
      parent: { subscription_item_details: { subscription_item: item.id } }, period: { end: 2001000000 },
    }] } };
  const latest = { ...initial, id: 'in_second', billing_reason: 'subscription_cycle' };
  const sub = { id: subId, livemode: false, customer, status: 'active', cancel_at_period_end: true,
    metadata: { ...metadata('monthly'), subscription_consent: 'consent-test', offer_version: MONTHLY_VERSION },
    latest_invoice: latest, items: { data: [item] } };
  const stripe = {
    subscriptions: { retrieve: async () => sub }, invoices: { retrieve: async id => { assert.equal(id, initial.id); return initial; } },
    invoicePayments: { list: async () => ({ data: [{ payment: { type: 'payment_intent', payment_intent: 'pi_month' } }] }) },
    paymentIntents: { retrieve: async () => ({ customer, currency: 'usd', amount_received: 1900,
      livemode: false, status: 'succeeded', latest_charge: charge }) },
  };
  const writes = [];
  const admin = { rpc: async (name, args) => { writes.push({ name, args }); return { data: true }; } };
  await fulfillVerifiedEvent(event('invoice.paid', latest), stripe, admin);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].args.is_paid, true, 'scheduled cancellation keeps paid access');
  sub.status = 'canceled';
  await fulfillVerifiedEvent(event('invoice.paid', initial), stripe, admin);
  assert.deepEqual(writes[1], { name: 'planpatch_confirm_test_subscription', args: {
    consent_id: 'consent-test', customer, invoice: initial.id, subscription: subId, amount_cents: 1900,
    paid_on: new Date(2000000000 * 1000).toISOString(), period_end: new Date(2001000000 * 1000).toISOString(),
  } });
  assert.equal(writes[2].args.is_paid, false);
  initial.customer = 'different-test-customer';
  await fulfillVerifiedEvent(event('invoice.paid', initial), stripe, admin);
  assert.equal(writes.filter(w => w.name === 'planpatch_confirm_test_subscription').length, 1);
});

test('a missing migration preserves ordinary access but makes monthly checkout unavailable', async () => {
  const handler = accountHandler({ siteOrigin: origin, webhookSecret: 'whsec_test', test: {},
    admin: { rpc: () => ({ maybeSingle: async () => ({ error: { code: 'PGRST202' } }) }) },
    clientFor: () => ({ rpc: name => ({ maybeSingle: async () => ({ data: name === 'planpatch_session'
      ? { user_id: 'owner' } : { project_credits: 2 } }) }) }),
  });
  const response = await handler(new Request(origin, { method: 'POST', headers: { Authorization: 'Bearer owner' },
    body: JSON.stringify({ action: 'status', owner_id: 'different-owner' }) }));
  const status = await response.json();
  assert.equal(response.status, 200);
  assert.equal(status.projectCredits, 2);
  assert.equal(status.monthlyOfferVersion, null);
  assert.equal(status.monthlyConfirmation, null);
});

test('the portal cancellation flow is scoped to the authenticated customer and Stripe confirms the change', async () => {
  const sub = { id: 'sub_owned', customer, status: 'active', livemode: false, metadata: metadata('monthly') };
  const options = [];
  const stripe = {
    subscriptions: { list: ({ customer: requested }) => {
      assert.equal(requested, customer);
      return [{ ...sub, id: 'sub_other', customer: 'cus_other' }, { ...sub, id: 'sub_live', livemode: true }, sub];
    } },
    billingPortal: { sessions: { create: (params) => { options.push(params); return { url: 'https://billing.stripe.com/p/session/test' }; } } },
  };
  const returnUrl = origin + '/#/account/billing';
  await openBillingPortal(stripe, customer, returnUrl, true);
  assert.deepEqual(options[0], { customer, return_url: returnUrl, flow_data: {
    type: 'subscription_cancel', subscription_cancel: { subscription: 'sub_owned' },
  } });
  sub.cancel_at_period_end = true;
  await openBillingPortal(stripe, customer, returnUrl, true);
  assert.deepEqual(options[1], { customer, return_url: returnUrl });
  await openBillingPortal(stripe, customer, returnUrl, false);
  assert.deepEqual(options[2], options[1]);
});

test('the authenticated checkout endpoint ignores client pricing, owner, customer and return addresses', async () => {
  const owner = 'owner-from-session';
  const reservation = { id: 'consent-for-owner', checkout_id: null, expires_at: 2000000000 };
  let checkout;
  const handler = accountHandler({
    siteOrigin: origin, webhookSecret: 'whsec_test',
    test: { subscriptions: { list: () => [] }, checkout: { sessions: {
      create: async params => {
        checkout = params;
        return { id: 'cs_bound', url: 'https://checkout.stripe.com/example', livemode: false };
      },
    } } },
    admin: {
      from: () => ({
        upsert: async ({ user_id }) => { assert.equal(user_id, owner); return {}; },
        select: () => ({ eq: (column, id) => {
          assert.equal(column, 'user_id');
          assert.equal(id, owner);
          return { maybeSingle: async () => ({ data: { stripe_test_customer_id: customer } }) };
        } }),
      }),
      rpc: (name, args) => {
        assert.equal(args.owner_id, owner);
        if (name === 'planpatch_reserve_test_subscription') {
          assert.equal(args.customer, customer);
          assert.equal(args.disclosure, MONTHLY_DISCLOSURE);
          return { single: async () => ({ data: reservation }) };
        }
        assert.equal(name, 'planpatch_bind_test_checkout');
        assert.equal(args.checkout, 'cs_bound');
        return Promise.resolve({ data: true });
      },
    },
    clientFor: () => ({ rpc: name => ({ maybeSingle: async () => ({ data: name === 'planpatch_session' ? { user_id: owner } : { monthly: false } }) }) }),
  });
  const response = await handler(new Request(origin, { method: 'POST', headers: { Authorization: 'Bearer owner' },
    body: JSON.stringify({ action: 'checkout', plan: 'monthly', attempt, amount: 1, owner_id: 'unrelated', customer: 'other',
      origin: 'https://other.invalid', consent: { accepted: true, version: MONTHLY_VERSION, disclosure: 'Different offer' } }),
  }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).url, 'https://checkout.stripe.com/example');
  assert.equal(checkout.customer, customer);
  assert.equal(checkout.client_reference_id, owner);
  assert.equal(checkout.line_items[0].price_data.unit_amount, 1900);
  assert.equal(checkout.success_url, origin + '/?sandbox_checkout=returned#/account/billing');
});
