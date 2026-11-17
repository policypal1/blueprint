import { createCheckout, fulfillVerifiedEvent } from './billing.js';

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

export function accountHandler({ admin, test, clientFor, siteOrigin, webhookSecret, cryptoProvider }) {
  const origin = new URL(siteOrigin).origin;
  const allowed = new Set([
    origin,
    'https://www.editfloorplans.com',
    'https://editfloorplans.com',
    'https://blueprint-blue-theta.vercel.app',
    DEV_ORIGIN,
  ]);
  const webhookConfigured = Boolean(webhookSecret?.startsWith('whsec_'));
  const checkoutReady = Boolean(test && webhookConfigured);

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
    if (request.method === 'GET') return reply(200, {
      sandboxBillingConfigured: Boolean(test), webhookConfigured, checkoutReady,
    });
    if (request.method !== 'POST') return reply(405, { error: 'Method not allowed.' });

    const signature = request.headers.get('stripe-signature');
    if (signature) {
      if (!checkoutReady) return reply(503, { error: 'Sandbox checkout is being set up.' });
      let event;
      try {
        event = await test.webhooks.constructEventAsync(await request.text(), signature,
          webhookSecret, undefined, cryptoProvider);
      } catch {
        return reply(400, { error: 'Invalid Stripe signature.' });
      }
      if (event.livemode !== false) return reply(400, { error: 'Expected a sandbox event.' });
      try {
        await fulfillVerifiedEvent(event, test, admin);
        return reply(200, { received: true });
      } catch {
        return reply(503, { error: 'Could not verify this sandbox payment yet.' });
      }
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
      if (body.action === 'status') {
        const access = deleting ? null : checked(await client.rpc('planpatch_sandbox_access').maybeSingle());
        return reply(200, {
          billingAvailable: Boolean(test), checkoutReady, deleting,
          paymentsRequired: Boolean(access?.payments_required), monthly: Boolean(access?.monthly),
          projectCredits: Number(access?.project_credits ?? 0), projectIds: access?.project_ids ?? [],
        });
      }
      if (body.action === 'billing' || body.action === 'checkout') {
        if (deleting) return reply(409, { error: 'Account deletion is in progress.', deleting });
        if (!test || (body.action === 'checkout' && !checkoutReady)) {
          return reply(503, { error: 'Sandbox billing is being set up.' });
        }
        if (body.action === 'checkout' && !['project', 'monthly'].includes(body.plan)) {
          return reply(400, { error: 'Choose a test plan.' });
        }
        const account = await ensureAccount(admin, userId);
        if (!account || account.deletion_started_at) return reply(409, { error: 'Account deletion is in progress.' });
        const customer = await getStripeCustomer(admin, test, 'stripe_test_customer_id', userId, account, client);
        if (!customer) return reply(409, { error: 'Account deletion is in progress.' });
        const returnOrigin = requestOrigin && requestOrigin !== DEV_ORIGIN ? requestOrigin : origin;
        if (body.action === 'checkout') {
          if (body.plan === 'monthly') {
            const access = checked(await client.rpc('planpatch_sandbox_access').maybeSingle());
            if (access?.monthly) return reply(409, { error: 'Your monthly test subscription is already active.' });
          }
          const url = await createCheckout(test, { plan: body.plan, customer, owner: userId, origin: returnOrigin, attempt: body.attempt });
          return url ? reply(200, { url }) : reply(400, { error: 'Restart checkout from EditFloorPlans.com.' });
        }
        const portal = await test.billingPortal.sessions.create({ customer, return_url: returnOrigin + '/#/account/billing' });
        return reply(200, { url: portal.url });
      }

      if (body.confirmation !== 'DELETE') return reply(400, { error: 'Type DELETE to confirm.' });
      const account = await ensureAccount(admin, userId);
      if (!account) return reply(401, { error: 'Sign in to manage your account.' });
      if (account.stripe_customer_id || (!test && account.stripe_test_customer_id)) {
        return reply(503, { error: 'Billing cleanup is unavailable. Try deleting your account again later.', deleting });
      }
      checked(await admin.from(ACCOUNT).update({ deletion_started_at: new Date().toISOString() })
        .eq('user_id', userId).is('deletion_started_at', null));
      deleting = true;
      const frozen = await readAccount(admin, userId);
      if (frozen) {
        await removeCustomer(test, frozen.stripe_test_customer_id);
        await removeBlueprints(admin.storage.from('blueprints'), userId);
        const { error } = await admin.auth.admin.deleteUser(userId);
        if (error && error.code !== 'user_not_found') throw error;
      }
      return reply(200, { deleted: true });
    } catch {
      const errors = {
        status: 'Could not check account access. Try again.',
        billing: 'Could not open billing. Try again.',
        checkout: 'Could not open test checkout. Try again.',
        delete: 'Could not finish deleting your account. Try again.',
      };
      return reply(503, { error: errors[body.action], deleting });
    }
  };
}
