import { createClient } from 'npm:@supabase/supabase-js@2.119.0';
import Stripe from 'npm:stripe@23.1.0';
import { accountHandler } from './handler.js';

function supabaseKey(name: string, legacy: string) {
  const keys = Deno.env.get(name);
  return (keys ? JSON.parse(keys).default : undefined) || Deno.env.get(legacy) || '';
}

function connectStripe(name: string, mode: string) {
  const key = Deno.env.get(name);
  if (!key?.startsWith(`sk_${mode}_`) && !key?.startsWith(`rk_${mode}_`)) return null;
  return new Stripe(key, { httpClient: Stripe.createFetchHttpClient(), timeout: 12000, maxNetworkRetries: 1 });
}

const url = Deno.env.get('SUPABASE_URL')!;
const publishableKey = supabaseKey('SUPABASE_PUBLISHABLE_KEYS', 'SUPABASE_ANON_KEY');
const secretKey = supabaseKey('SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY');
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const admin = createClient(url, secretKey, options);
const test = connectStripe('STRIPE_TEST_SECRET_KEY', 'test');
const live = connectStripe('STRIPE_LIVE_SECRET_KEY', 'live');
const siteOrigin = Deno.env.get('PLANPATCH_SITE_ORIGIN') || 'https://www.editfloorplans.com';
let capabilityCheck = { until: 0, enabled: false };

async function getBillingConfig() {
  const { data, error } = await admin.rpc('planpatch_billing_config').single();
  if (error || !data) throw new Error('Billing configuration unavailable.');
  if (data.billing_live && live && capabilityCheck.until < Date.now()) {
    try {
      const account = await live.accounts.retrieve();
      capabilityCheck = { until: Date.now() + 30_000,
        enabled: account.id === 'acct_1UcU89FQHJCPVJXE' && account.charges_enabled === true };
    } catch {
      capabilityCheck = { until: Date.now() + 10_000, enabled: false };
    }
  }
  return { ...data, checkout_enabled: Boolean(live && capabilityCheck.enabled) };
}

Deno.serve(accountHandler({
  admin,
  test,
  live,
  getBillingConfig,
  webhookSecret: Deno.env.get('STRIPE_TEST_WEBHOOK_SECRET'),
  liveWebhookSecret: Deno.env.get('STRIPE_LIVE_WEBHOOK_SECRET'),
  cryptoProvider: Stripe.createSubtleCryptoProvider(),
  siteOrigin,
  clientFor: (authorization: string) => createClient(url, publishableKey, {
    ...options,
    global: { headers: { Authorization: authorization } },
  }),
}));
