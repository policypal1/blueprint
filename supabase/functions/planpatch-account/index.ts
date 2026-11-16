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
const siteOrigin = Deno.env.get('PLANPATCH_SITE_ORIGIN') || 'https://blueprint-blue-theta.vercel.app';

Deno.serve(accountHandler({
  admin,
  test,
  webhookSecret: Deno.env.get('STRIPE_TEST_WEBHOOK_SECRET'),
  cryptoProvider: Stripe.createSubtleCryptoProvider(),
  siteOrigin,
  clientFor: (authorization: string) => createClient(url, publishableKey, {
    ...options,
    global: { headers: { Authorization: authorization } },
  }),
}));
