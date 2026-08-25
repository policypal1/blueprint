import crypto from 'node:crypto';

const COOKIE_NAME = 'blueprint_studio_session';
const THIRTY_DAYS = 60 * 60 * 24 * 30;

function configuredPassword() {
  return process.env.APP_PASSWORD || '';
}

function sessionToken(password) {
  return crypto.createHash('sha256').update(`blueprint-studio:${password}:session-v1`).digest('hex');
}

function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').map(v => v.trim()).filter(Boolean).map(part => {
    const i = part.indexOf('=');
    return i === -1 ? [part, ''] : [part.slice(0, i), decodeURIComponent(part.slice(i + 1))];
  }));
}

function safeEqual(a, b) {
  const aa = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

export default function handler(req, res) {
  const password = configuredPassword();
  if (!password) {
    return res.status(503).json({ error: 'APP_PASSWORD is not configured in Vercel.' });
  }

  if (req.method === 'GET') {
    const cookies = parseCookies(req.headers.cookie || '');
    const valid = safeEqual(cookies[COOKIE_NAME] || '', sessionToken(password));
    return valid ? res.status(200).json({ authenticated: true }) : res.status(401).json({ authenticated: false });
  }

  if (req.method === 'POST') {
    const supplied = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!safeEqual(supplied, password)) return res.status(401).json({ error: 'Incorrect password' });
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    res.setHeader('Set-Cookie', `${COOKIE_NAME}=${encodeURIComponent(sessionToken(password))}; HttpOnly; Path=/; Max-Age=${THIRTY_DAYS}; SameSite=Strict${secure}`);
    return res.status(200).json({ authenticated: true });
  }

  if (req.method === 'DELETE') {
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    res.setHeader('Set-Cookie', `${COOKIE_NAME}=; HttpOnly; Path=/; Max-Age=0; SameSite=Strict${secure}`);
    return res.status(200).json({ authenticated: false });
  }

  res.setHeader('Allow', 'GET, POST, DELETE');
  return res.status(405).json({ error: 'Method not allowed' });
}
