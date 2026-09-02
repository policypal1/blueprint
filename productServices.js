import { PRODUCT_CONFIG } from './product.config.js';

const KEYS = {
  accounts: `${PRODUCT_CONFIG.storagePrefix}:accounts`,
  session: `${PRODUCT_CONFIG.storagePrefix}:session`,
  subscriptions: `${PRODUCT_CONFIG.storagePrefix}:subscriptions`,
};

const read = (key, fallback) => {
  try {
    const parsed = JSON.parse(localStorage.getItem(key));
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
};

const write = (key, value) => localStorage.setItem(key, JSON.stringify(value));
const normalizeEmail = (email) => String(email || '').trim().toLowerCase();
const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

async function hashPassword(password) {
  const data = new TextEncoder().encode(String(password));
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function sanitizeAccount(account) {
  if (!account) return null;
  const { passwordHash, ...safe } = account;
  return safe;
}

export async function createAccount({ name, email, password }) {
  const cleanName = String(name || '').trim();
  const cleanEmail = normalizeEmail(email);
  if (cleanName.length < 2) throw new Error('Enter your full name.');
  if (!/^\S+@\S+\.\S+$/.test(cleanEmail)) throw new Error('Enter a valid email address.');
  if (String(password || '').length < 8) throw new Error('Use at least 8 characters for your password.');

  const accounts = read(KEYS.accounts, []);
  if (accounts.some(account => account.email === cleanEmail)) throw new Error('An account with that email already exists.');

  const account = {
    id: uid(),
    name: cleanName,
    email: cleanEmail,
    passwordHash: await hashPassword(password),
    createdAt: new Date().toISOString(),
  };
  accounts.push(account);
  write(KEYS.accounts, accounts);
  write(KEYS.session, { accountId: account.id, createdAt: new Date().toISOString() });
  return sanitizeAccount(account);
}

export async function login({ email, password }) {
  const cleanEmail = normalizeEmail(email);
  const accounts = read(KEYS.accounts, []);
  const account = accounts.find(item => item.email === cleanEmail);
  if (!account || account.passwordHash !== await hashPassword(password)) throw new Error('Incorrect email or password.');
  write(KEYS.session, { accountId: account.id, createdAt: new Date().toISOString() });
  return sanitizeAccount(account);
}

export function logout() {
  localStorage.removeItem(KEYS.session);
  sessionStorage.removeItem('blueprint-studio-unlocked');
}

export function getCurrentAccount() {
  const session = read(KEYS.session, null);
  if (!session?.accountId) return null;
  const account = read(KEYS.accounts, []).find(item => item.id === session.accountId);
  return sanitizeAccount(account);
}

export async function updateAccount({ name, email, password }) {
  const session = read(KEYS.session, null);
  if (!session?.accountId) throw new Error('You are not signed in.');
  const accounts = read(KEYS.accounts, []);
  const index = accounts.findIndex(item => item.id === session.accountId);
  if (index === -1) throw new Error('Account not found.');

  const cleanName = String(name || '').trim();
  const cleanEmail = normalizeEmail(email);
  if (cleanName.length < 2) throw new Error('Enter your full name.');
  if (!/^\S+@\S+\.\S+$/.test(cleanEmail)) throw new Error('Enter a valid email address.');
  if (accounts.some((item, i) => i !== index && item.email === cleanEmail)) throw new Error('That email is already in use.');

  const next = { ...accounts[index], name: cleanName, email: cleanEmail };
  if (password) {
    if (password.length < 8) throw new Error('Use at least 8 characters for your password.');
    next.passwordHash = await hashPassword(password);
  }
  accounts[index] = next;
  write(KEYS.accounts, accounts);
  return sanitizeAccount(next);
}

function detectBrand(cardNumber) {
  const value = String(cardNumber || '').replace(/\D/g, '');
  if (/^4/.test(value)) return 'Visa';
  if (/^(5[1-5]|2[2-7])/.test(value)) return 'Mastercard';
  if (/^3[47]/.test(value)) return 'Amex';
  if (/^6(?:011|5)/.test(value)) return 'Discover';
  return 'Card';
}

export function activateSubscription({ accountId, cardNumber = '', expiry = '', cardholder = '', testBypass = false } = {}) {
  if (!accountId) throw new Error('Account required.');
  const subscriptions = read(KEYS.subscriptions, {});
  const cleanCard = String(cardNumber || '').replace(/\D/g, '');

  if (!testBypass) {
    if (cleanCard.length < 13 || cleanCard.length > 19) throw new Error('Enter a valid card number.');
    if (!/^\d{2}\s*\/\s*\d{2}$/.test(String(expiry || '').trim())) throw new Error('Use MM/YY for the expiration date.');
    if (String(cardholder || '').trim().length < 2) throw new Error('Enter the name on the card.');
  }

  const record = {
    status: testBypass ? 'developer_access' : 'active',
    startedAt: new Date().toISOString(),
    testBypass,
    priceMonthly: PRODUCT_CONFIG.pricing.launchMonthly,
    paymentMethod: testBypass
      ? { brand: 'Developer mode', last4: '1234', expiry: '—' }
      : {
          brand: detectBrand(cleanCard),
          last4: cleanCard.slice(-4),
          expiry: String(expiry).trim(),
          cardholder: String(cardholder).trim(),
        },
  };

  // Frontend-only placeholder. Store only display-safe card metadata.
  // Replace this with Stripe Checkout/Elements before accepting real payments.
  subscriptions[accountId] = record;
  write(KEYS.subscriptions, subscriptions);
  return record;
}

export function unlockDeveloperMode(accountId) {
  return activateSubscription({ accountId, testBypass: true });
}

export function updatePaymentMethod({ accountId, cardNumber, expiry, cardholder }) {
  if (!accountId) throw new Error('Account required.');
  const cleanCard = String(cardNumber || '').replace(/\D/g, '');
  if (cleanCard.length < 13 || cleanCard.length > 19) throw new Error('Enter a valid card number.');
  if (!/^\d{2}\s*\/\s*\d{2}$/.test(String(expiry || '').trim())) throw new Error('Use MM/YY for the expiration date.');
  if (String(cardholder || '').trim().length < 2) throw new Error('Enter the name on the card.');

  const subscriptions = read(KEYS.subscriptions, {});
  const current = subscriptions[accountId];
  if (!current) throw new Error('No active subscription found.');
  const next = {
    ...current,
    testBypass: false,
    status: 'active',
    paymentMethod: {
      brand: detectBrand(cleanCard),
      last4: cleanCard.slice(-4),
      expiry: String(expiry || '').trim(),
      cardholder: String(cardholder || '').trim(),
    },
    updatedAt: new Date().toISOString(),
  };
  subscriptions[accountId] = next;
  write(KEYS.subscriptions, subscriptions);
  return next;
}

export function getSubscription(accountId) {
  if (!accountId) return null;
  return read(KEYS.subscriptions, {})[accountId] || null;
}

export function removeSubscription(accountId) {
  const subscriptions = read(KEYS.subscriptions, {});
  delete subscriptions[accountId];
  write(KEYS.subscriptions, subscriptions);
}

export function createDeveloperAccount() {
  const accounts = read(KEYS.accounts, []);
  let account = accounts.find(item => item.email === 'developer@blueprintstudio.local');
  if (!account) {
    account = {
      id: uid(),
      name: 'Blueprint Developer',
      email: 'developer@blueprintstudio.local',
      passwordHash: 'developer-only',
      createdAt: new Date().toISOString(),
    };
    accounts.push(account);
    write(KEYS.accounts, accounts);
  }
  write(KEYS.session, { accountId: account.id, createdAt: new Date().toISOString(), developer: true });
  unlockDeveloperMode(account.id);
  return sanitizeAccount(account);
}
