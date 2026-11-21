import { createBilling, validAttempt } from './billing.js';

import { MONTHLY_VERSION, LIVE_MONTHLY_VERSION } from './monthly-offer.js';

const ACCOUNT = 'planpatch_accounts';
const ACCOUNT_FIELDS = 'stripe_customer_id,stripe_test_customer_id,deletion_started_at';
const PAGE = 100;
const DEV_ORIGIN = 'http://localhost:5173';

function checked({ data, error }) {
  if (error) throw error;
  return data;
}

async function readAccount(admin, userId) {
  return checked(await admin.from(ACCOUNT).select(ACCOUNT_FIELDS).eq('user_id', userId).maybeSingle());
}

async function ensureAccount(admin, userId) {
  checked(await admin.from(ACCOUNT).upsert({ user_id: userId }, {
    onConflict: 'user_id',
    ignoreDuplicates: true,
  }));
  return readAccount(admin, userId);
}

async function removeCustomer(stripe, customerId) {
  if (!customerId) return;
  try {
    await stripe.customers.del(customerId);
  } catch (error) {
    if (error.code !== 'resource_missing') throw error;
  }
}

async function removeBlueprints(bucket, folder) {
  const entries = [];
  for (let offset = 0; ; offset += PAGE) {
    const page = checked(await bucket.list(folder, { limit: PAGE, offset, sortBy: { column: 'name', order: 'asc' } }));
    entries.push(...page);
    if (page.length < PAGE) break;
  }
  const files = [];
  for (const { id, name } of entries) {
    const path = `${folder}/${name}`;
    if (id) files.push(path);
    else await removeBlueprints(bucket, path);
  }
  for (let index = 0; index < files.length; index += PAGE) {
    checked(await bucket.remove(files.slice(index, index + PAGE)));
  }
}

async function getStripeCustomer(admin, stripe, column, userId, account, client) {
  if (account[column]) return account[column];
  const { user } = checked(await client.auth.getUser());
  if (user?.id !== userId) throw new Error('Customer session changed');
  const customer = await stripe.customers.create({
    email: user.email,
    metadata: { planpatch_user_id: userId },
  }, { idempotencyKey: `planpatch-customer:${userId}` });
  const attached = checked(await admin.from(ACCOUNT).update({ [column]: customer.id })
    .eq('user_id', userId).is('deletion_started_at', null).is(column, null)
    .select(ACCOUNT_FIELDS).maybeSingle());
  if (attached) return customer.id;
  const latest = await readAccount(admin, userId);
  if (!latest || latest[column] !== customer.id) await removeCustomer(stripe, customer.id);
  return latest?.deletion_started_at ? null : latest?.[column];
}

export function accountHandler({ admin, test, live, clientFor, siteOrigin, webhookSecret, liveWebhookSecret, cryptoProvider, getBillingConfig }) {
  const origin = new URL(siteOrigin).origin;
  const allowed = new Set([
    origin,
    'https://www.editfloorplans.com',
    'https://editfloorplans.com',
    'https://blueprint-blue-theta.vercel.app',
    DEV_ORIGIN,
  ]);
  const configFor = async () => getBillingConfig ? await getBillingConfig() : { billing_live: false };
  const signed = (secret) => Boolean(secret?.startsWith('whsec_'));
  const services = (config, livemode) => createBilling({ livemode,
    prices: { project: config.project_price, monthly: config.monthly_price }, portalConfiguration: config.portal_configuration });

  return async function handle(request) {
    const headers = {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json',
      Vary: 'Origin',
    };
    const reply = (status, payload) => new Response(JSON.stringify(payload), { status, headers });
    const requestOrigin = request.headers.get('Origin');
    if (requestOrigin) {
      if (!allowed.has(requestOrigin)) return reply(403, { error: 'Open account settings from EditFloorPlans.com.' });
      headers['Access-Control-Allow-Origin'] = requestOrigin;
    }
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: {
        ...headers,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'apikey, authorization, content-type, x-client-info, x-region',
      } });
    }
    if (request.method === 'GET') {
      try {
        const config = await configFor();
        const mode = config.billing_live === true;
        return reply(200, { billingMode: mode ? 'live' : 'test',
          billingConfigured: Boolean(mode ? live : test),
          webhookConfigured: signed(mode ? liveWebhookSecret : webhookSecret),
          checkoutReady: Boolean(mode ? live && signed(liveWebhookSecret) && config.checkout_enabled
            && config.project_price && config.monthly_price && config.portal_configuration : test && signed(webhookSecret)) });
      } catch { return reply(503, { error: 'Billing configuration is unavailable.' }); }
    }
    if (request.method !== 'POST') return reply(405, { error: 'Method not allowed.' });

    const signature = request.headers.get('stripe-signature');
    if (signature) {
      const payload = await request.text();
      let verified;
      for (const candidate of [{ stripe: live, secret: liveWebhookSecret, mode: true },
        { stripe: test, secret: webhookSecret, mode: false }]) {
        if (!candidate.stripe || !signed(candidate.secret)) continue;
        try {
          const event = await candidate.stripe.webhooks.constructEventAsync(payload, signature,
            candidate.secret, undefined, cryptoProvider);
          if (event.livemode === candidate.mode) { verified = { ...candidate, event }; break; }
        } catch { /* Only a verified signature can enter fulfillment. */ }
      }
      if (!verified) return reply(400, { error: 'Invalid Stripe signature or payment mode.' });
      try {
        const config = await configFor();
        await services(config, verified.mode).fulfillVerifiedEvent(verified.event, verified.stripe, admin);
        return reply(200, { received: true });
      } catch { return reply(503, { error: 'Could not verify this payment yet.' }); }
    }

    const authorization = request.headers.get('Authorization') || '';
    if (!/^Bearer [\w.-]+$/.test(authorization)) return reply(401, { error: 'Sign in to manage your account.' });
    const client = clientFor(authorization);
    const { data: session, error: sessionError } = await client.rpc('planpatch_session').maybeSingle();
    if (sessionError || !session?.user_id) return reply(401, { error: 'Sign in to manage your account.' });
    const userId = session.user_id;

    const body = await request.json().catch(() => null);
    if (!['status', 'billing', 'checkout', 'delete'].includes(body?.action)) {
      return reply(400, { error: 'Unknown account action.' });
    }

    let deleting = session.deleting;
    try {
      const config = await configFor();
      const isLive = config.billing_live === true;
      const stripe = isLive ? live : test;
      const monthlyVersion = isLive ? LIVE_MONTHLY_VERSION : MONTHLY_VERSION;
      const confirmationRpc = isLive ? 'planpatch_live_subscription_confirmation' : 'planpatch_test_subscription_confirmation';
      const webhookConfigured = signed(isLive ? liveWebhookSecret : webhookSecret);
      const checkoutReady = Boolean(stripe && webhookConfigured && (!isLive || (config.checkout_enabled
        && config.project_price && config.monthly_price && config.portal_configuration)));
      const { createCheckout, monthlyCheckout, openBillingPortal } = services(config, isLive);
      if (body.action === 'status') {
        const access = deleting ? null : checked(await client.rpc('planpatch_sandbox_access').maybeSingle());
        const confirmation = deleting ? null : await admin.rpc(confirmationRpc, {
          owner_id: userId,
        }).maybeSingle();
        return reply(200, {
          billingAvailable: Boolean(stripe && (!isLive || config.portal_configuration)), checkoutReady, deleting, billingMode: isLive ? 'live' : 'test',
          activationPending: isLive && !config.checkout_enabled,
          monthlyOfferVersion: confirmation && !confirmation.error ? monthlyVersion : null,
          monthlyConfirmation: confirmation?.data ?? null,
          paymentsRequired: Boolean(access?.payments_required), monthly: Boolean(access?.monthly),
          projectCredits: Number(access?.project_credits ?? 0), projectIds: access?.project_ids ?? [],
        });
      }
      if (body.action === 'billing' || body.action === 'checkout') {
        if (deleting) return reply(409, { error: 'Account deletion is in progress.', deleting });
        if (!stripe || (isLive && body.action === 'billing' && !config.portal_configuration) || (body.action === 'checkout' && !checkoutReady)) {
          return reply(503, { error: isLive ? 'Payments are awaiting Stripe activation.' : 'Sandbox billing is being set up.' });
        }
        if (body.action === 'checkout' && (!['project', 'monthly'].includes(body.plan) || !validAttempt(body.attempt))) {
          return reply(400, { error: 'Choose a plan.' });
        }
        if (body.action === 'checkout' && body.plan === 'monthly'
            && (body.consent?.accepted !== true || body.consent.version !== monthlyVersion)) {
          return reply(400, { error: 'Refresh the order and agree to the current monthly billing terms before checkout.' });
        }
        const account = await ensureAccount(admin, userId);
        if (!account || account.deletion_started_at) return reply(409, { error: 'Account deletion is in progress.' });
        const customer = await getStripeCustomer(admin, stripe, isLive ? 'stripe_customer_id' : 'stripe_test_customer_id', userId, account, client);
        if (!customer) return reply(409, { error: 'Account deletion is in progress.' });
        const returnOrigin = requestOrigin && requestOrigin !== DEV_ORIGIN ? requestOrigin : origin;
        if (body.action === 'checkout') {
          const options = { plan: body.plan, customer, owner: userId, origin: returnOrigin, attempt: body.attempt };
          if (body.plan === 'monthly') {
            const access = checked(await client.rpc('planpatch_sandbox_access').maybeSingle());
            if (access?.monthly) return reply(409, { error: 'Your monthly subscription is already active.' });
            const url = await monthlyCheckout(stripe, admin, { ...options, origin });
            return url ? reply(200, { url }) : reply(409, { error: 'Check your subscription in Manage billing before starting another checkout.' });
          }
          const checkout = await createCheckout(stripe, options);
          return checkout ? reply(200, { url: checkout.url }) : reply(400, { error: 'Restart checkout from EditFloorPlans.com.' });
        }
        const portal = await openBillingPortal(stripe, customer, returnOrigin + '/#/account/billing', body.cancelMonthly === true);
        return reply(200, { url: portal.url });
      }

      if (body.confirmation !== 'DELETE') return reply(400, { error: 'Type DELETE to confirm.' });
      const account = await ensureAccount(admin, userId);
      if (!account) return reply(401, { error: 'Sign in to manage your account.' });
      if ((!live && account.stripe_customer_id) || (!test && account.stripe_test_customer_id)) {
        return reply(503, { error: 'Billing cleanup is unavailable. Try deleting your account again later.', deleting });
      }
      checked(await admin.from(ACCOUNT).update({ deletion_started_at: new Date().toISOString() })
        .eq('user_id', userId).is('deletion_started_at', null));
      deleting = true;
      const frozen = await readAccount(admin, userId);
      if (frozen) {
        await removeCustomer(live, frozen.stripe_customer_id);
        await removeCustomer(test, frozen.stripe_test_customer_id);
        await removeBlueprints(admin.storage.from('blueprints'), userId);
        const { error } = await admin.auth.admin.deleteUser(userId);
        if (error && error.code !== 'user_not_found') throw error;
      }
      return reply(200, { deleted: true });
    } catch (error) {
      if (body.action === 'checkout' && body.plan === 'monthly' && error?.message === 'A checkout with different terms is still open.') {
        return reply(409, { error: 'A previous monthly checkout is still open. Finish in that tab, or try again when it expires within two hours.' });
      }
      const errors = {
        status: 'Could not check account access. Try again.',
        billing: 'Could not open billing. Try again.',
        checkout: 'Could not open checkout. Try again.',
        delete: 'Could not finish deleting your account. Try again.',
      };
      return reply(503, { error: errors[body.action], deleting });
    }
  };
}
