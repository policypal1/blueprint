const AMOUNTS = { project: 1000, monthly: 1900 };
const MARKER = 'planpatch-sandbox';
const CHECKOUT_EVENTS = new Set([
  'checkout.session.completed', 'checkout.session.async_payment_succeeded', 'checkout.session.async_payment_failed',
]);
const SUBSCRIPTION_EVENTS = new Set(['customer.subscription.updated', 'customer.subscription.deleted']);
const INVOICE_EVENTS = new Set(['invoice.paid', 'invoice.payment_failed']);
const REVERSAL_EVENTS = new Set(['charge.refunded', 'charge.dispute.created', 'charge.dispute.closed']);

const stripeId = (object) => typeof object === 'string' ? object : object?.id;
const belongsToPlanPatch = (object) => object.livemode === false && object.metadata?.application === MARKER;

function checked({ data, error }) {
  if (error) throw error;
  return data;
}

export async function createCheckout(stripe, { plan, customer, owner, origin, attempt }) {
  if (!Object.hasOwn(AMOUNTS, plan) || !/^[0-9a-f-]{36}$/i.test(attempt ?? '')) return null;
  const monthly = plan === 'monthly';
  const metadata = { application: MARKER, plan };
  const session = await stripe.checkout.sessions.create({
    mode: monthly ? 'subscription' : 'payment',
    customer,
    client_reference_id: owner,
    integration_identifier: 'planpatch-editor-aegnqkrs',
    metadata,
    line_items: [{
      quantity: 1,
      price_data: {
        currency: 'usd',
        unit_amount: AMOUNTS[plan],
        product_data: { name: monthly ? 'PlanPatch monthly access' : 'PlanPatch single project' },
        ...(monthly ? { recurring: { interval: 'month' } } : {}),
      },
    }],
    ...(monthly ? { subscription_data: { metadata } } : {}),
    success_url: origin + '/?sandbox_checkout=returned#/account/billing',
    cancel_url: origin + '/#/account/billing',
  }, { idempotencyKey: 'planpatch-checkout:' + customer + ':' + plan + ':' + attempt });
  if (session.livemode || !session.url) throw new Error('Expected a sandbox checkout URL.');
  return session.url;
}

async function settledIntent(stripe, intent, customer, minimum) {
  const id = stripeId(intent);
  if (!id) return false;
  const payment = await stripe.paymentIntents.retrieve(id, { expand: ['latest_charge'] });
  const charge = payment.latest_charge;
  return payment.livemode === false && payment.status === 'succeeded' && payment.currency === 'usd'
    && stripeId(payment.customer) === customer && payment.amount_received >= minimum
    && charge?.livemode === false && charge.captured && charge.paid
    && charge.amount_refunded === 0 && !charge.disputed;
}

async function recordGrant(admin, { customer, reference, kind, intent, paid, until, snapshotAt }) {
  if (!customer) return;
  checked(await admin.rpc('planpatch_record_sandbox_grant', {
    customer, grant_reference: reference, grant_kind: kind, intent: intent ?? null,
    is_paid: paid, access_until: until ?? null, snapshot_at: snapshotAt,
  }));
}

async function syncProject(stripe, admin, checkoutId) {
  const snapshotAt = new Date().toISOString();
  const checkout = await stripe.checkout.sessions.retrieve(checkoutId);
  if (!belongsToPlanPatch(checkout) || checkout.metadata.plan !== 'project' || checkout.mode !== 'payment') return;
  const intent = stripeId(checkout.payment_intent);
  const customer = stripeId(checkout.customer);
  const paid = checkout.status === 'complete' && checkout.payment_status === 'paid'
    && await settledIntent(stripe, intent, customer, AMOUNTS.project);
  await recordGrant(admin, { customer, reference: checkout.id, kind: 'project', intent, paid, snapshotAt });
}

async function syncMonthly(stripe, admin, subscriptionId) {
  if (!subscriptionId) return;
  const snapshotAt = new Date().toISOString();
  const sub = await stripe.subscriptions.retrieve(subscriptionId, { expand: ['latest_invoice'] });
  if (!belongsToPlanPatch(sub) || sub.metadata.plan !== 'monthly') return;
  const customer = stripeId(sub.customer);
  const invoice = sub.latest_invoice;
  const item = sub.items.data.find(({ price }) => price.currency === 'usd' && price.unit_amount === AMOUNTS.monthly
    && price.recurring?.interval === 'month' && price.recurring.interval_count === 1);
  let intent;
  if (sub.status === 'active' && item?.current_period_end && invoice?.status === 'paid'
      && stripeId(invoice.customer) === customer && invoice.amount_paid >= AMOUNTS.monthly) {
    const payments = await stripe.invoicePayments.list({ invoice: invoice.id, status: 'paid', limit: 100 });
    for (const entry of payments.data) {
      if (entry.payment.type === 'payment_intent'
          && await settledIntent(stripe, entry.payment.payment_intent, customer, AMOUNTS.monthly)) {
        intent = stripeId(entry.payment.payment_intent);
        break;
      }
    }
  }
  const until = item?.current_period_end ? new Date(item.current_period_end * 1000).toISOString() : null;
  await recordGrant(admin, { customer, reference: sub.id, kind: 'monthly', intent, paid: Boolean(intent), until, snapshotAt });
}

async function syncReversal(stripe, admin, item) {
  let intent = stripeId(item.payment_intent);
  if (!intent && item.charge) intent = stripeId((await stripe.charges.retrieve(stripeId(item.charge))).payment_intent);
  if (!intent) return;
  const grants = checked(await admin.rpc('planpatch_sandbox_grants_for_intent', { intent })) ?? [];
  for (const grant of grants) {
    if (grant.kind === 'monthly') await syncMonthly(stripe, admin, grant.reference);
    else await syncProject(stripe, admin, grant.reference);
  }
}

export async function fulfillVerifiedEvent(event, stripe, admin) {
  if (event.livemode !== false) return;
  const object = event.data.object;
  if (CHECKOUT_EVENTS.has(event.type)) {
    if (!belongsToPlanPatch(object)) return;
    if (object.mode === 'subscription') await syncMonthly(stripe, admin, stripeId(object.subscription));
    else await syncProject(stripe, admin, object.id);
  } else if (SUBSCRIPTION_EVENTS.has(event.type)) {
    await syncMonthly(stripe, admin, object.id);
  } else if (INVOICE_EVENTS.has(event.type)) {
    const sub = object.parent?.subscription_details?.subscription;
    await syncMonthly(stripe, admin, stripeId(sub));
  } else if (REVERSAL_EVENTS.has(event.type)) {
    await syncReversal(stripe, admin, object);
  } else if (event.type === 'radar.early_fraud_warning.created') {
    const intent = stripeId(object.payment_intent)
      || stripeId((await stripe.charges.retrieve(stripeId(object.charge))).payment_intent);
    if (intent) checked(await admin.rpc('planpatch_hold_sandbox_payment', {
      intent, snapshot_at: new Date().toISOString(),
    }));
  }
}
