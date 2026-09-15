import crypto from 'crypto';
import {
  createSession,
  createUser,
  findUserByEmail,
  updateUser,
} from './auth-store.js';
import {
  authCookieName,
  authCookieOptions,
  clearAuthCookieOptions,
} from './auth.js';

const STATE_COOKIE = 'git_azure_oauth';

function cfg() {
  const clientId = String(process.env.AZURE_CLIENT_ID || '').trim();
  const clientSecret = String(process.env.AZURE_CLIENT_SECRET || '').trim();
  const tenant = String(process.env.AZURE_TENANT_ID || 'organizations').trim();
  const scopes = String(
    process.env.AZURE_SCOPES ||
      'openid profile email offline_access https://graph.microsoft.com/User.Read'
  ).trim();
  const vercelHost = String(process.env.VERCEL_PROJECT_PRODUCTION_URL || '').trim();
  const baseUrl = String(
    process.env.APP_BASE_URL ||
      (vercelHost ? `https://${vercelHost}` : 'https://jaffer-brother-group-it.vercel.app')
  ).replace(/\/$/, '');
  // Prefer this portal's callback. Do NOT default to peopleanalytic callback.php.
  const redirectUri = String(
    process.env.AZURE_REDIRECT_URI || `${baseUrl}/auth/azure/callback`
  ).trim();
  // Comma-separated domains, or empty / * / any = any Microsoft work/school account.
  // Prefer AZURE_ALLOWED_DOMAINS; fall back to AZURE_ALLOWED_DOMAIN for older configs.
  const allowedDomainsRaw = String(
    process.env.AZURE_ALLOWED_DOMAINS != null
      ? process.env.AZURE_ALLOWED_DOMAINS
      : process.env.AZURE_ALLOWED_DOMAIN != null
        ? process.env.AZURE_ALLOWED_DOMAIN
        : ''
  )
    .trim()
    .toLowerCase();
  const allowedDomains =
    !allowedDomainsRaw || allowedDomainsRaw === '*' || allowedDomainsRaw === 'any'
      ? []
      : allowedDomainsRaw
          .split(/[,;\s]+/)
          .map((d) => d.replace(/^@/, '').trim())
          .filter(Boolean);
  const autoProvision = String(process.env.AZURE_SSO_AUTO_PROVISION || '0') === '1';
  return {
    clientId,
    clientSecret,
    tenant,
    scopes,
    redirectUri,
    allowedDomains,
    autoProvision,
    enabled: Boolean(clientId && clientSecret && redirectUri),
  };
}

export function azureSsoEnabled() {
  return cfg().enabled;
}

export function azureSsoPublicConfig() {
  const c = cfg();
  return {
    enabled: c.enabled,
    allowedDomains: c.allowedDomains,
    multiTenant: !c.allowedDomains.length,
  };
}

function authorizeUrl(state) {
  const c = cfg();
  const url = new URL(
    `https://login.microsoftonline.com/${encodeURIComponent(c.tenant)}/oauth2/v2.0/authorize`
  );
  url.searchParams.set('client_id', c.clientId);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', c.redirectUri);
  url.searchParams.set('response_mode', 'query');
  url.searchParams.set('scope', c.scopes);
  url.searchParams.set('state', state);
  url.searchParams.set('prompt', 'select_account');
  return url.toString();
}

async function exchangeCode(code) {
  const c = cfg();
  const body = new URLSearchParams({
    client_id: c.clientId,
    client_secret: c.clientSecret,
    code: String(code || ''),
    redirect_uri: c.redirectUri,
    grant_type: 'authorization_code',
    scope: c.scopes,
  });
  const res = await fetch(
    `https://login.microsoftonline.com/${encodeURIComponent(c.tenant)}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    }
  );
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json.error_description || json.error || 'Azure token exchange failed');
    err.status = 401;
    err.details = json;
    throw err;
  }
  return json;
}

async function fetchGraphMe(accessToken) {
  const res = await fetch('https://graph.microsoft.com/v1.0/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json.error?.message || 'Failed to load Microsoft profile');
    err.status = 401;
    throw err;
  }
  return json;
}

function normalizeEmail(profile) {
  const raw =
    profile.mail ||
    profile.userPrincipalName ||
    profile.otherMails?.[0] ||
    '';
  return String(raw).trim().toLowerCase();
}

function displayName(profile, email) {
  const name = String(profile.displayName || '').trim();
  if (name) return name;
  const local = String(email || '').split('@')[0] || 'User';
  return local
    .replace(/[._-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

async function resolvePortalUser(profile) {
  const c = cfg();
  const email = normalizeEmail(profile);
  if (!email || !email.includes('@')) {
    const err = new Error('Microsoft account has no email address');
    err.status = 400;
    throw err;
  }
  if (c.allowedDomains.length) {
    const domain = email.split('@')[1] || '';
    if (!c.allowedDomains.includes(domain)) {
      const list = c.allowedDomains.map((d) => `@${d}`).join(', ');
      const err = new Error(`Only ${list} accounts can sign in with Microsoft`);
      err.status = 403;
      throw err;
    }
  }

  let user = await findUserByEmail(email);
  const name = displayName(profile, email);

  if (user) {
    if (!user.is_active) {
      const err = new Error('This account is disabled. Contact your GIT admin.');
      err.status = 403;
      throw err;
    }
    if (name && name !== user.name) {
      try {
        await updateUser(user.id, { name });
        user = { ...user, name };
      } catch (_) {}
    }
    return user;
  }

  if (!c.autoProvision) {
    const err = new Error(
      'You signed in with Microsoft, but you do not have portal access yet. Ask an admin to add your account first.'
    );
    err.status = 403;
    throw err;
  }

  // v3 user model: viewer/lead/owner/manager/admin (no org team/access columns yet)
  const created = await createUser({
    name,
    email,
    password: null,
    role: 'viewer',
    department: 'IT / GIT',
  });
  // createUser returns public map; load full row for session
  return findUserByEmail(email) || created;
}

function newSessionToken() {
  return crypto.randomBytes(32).toString('base64url');
}

export function startAzureLogin(req, res) {
  const c = cfg();
  if (!c.enabled) {
    return res.status(503).send('Microsoft SSO is not configured on this server.');
  }
  const state = crypto.randomBytes(24).toString('base64url');
  res.cookie(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 10 * 60 * 1000,
  });
  return res.redirect(authorizeUrl(state));
}

export async function handleAzureCallback(req, res) {
  try {
    const c = cfg();
    if (!c.enabled) {
      return res.redirect('/login?sso=off');
    }

    const { code, state, error, error_description: errorDescription } = req.query || {};
    const savedState = req.cookies?.[STATE_COOKIE];
    res.clearCookie(STATE_COOKIE, clearAuthCookieOptions());

    if (error) {
      console.error('Azure SSO error:', error, errorDescription);
      return res.redirect(`/login?sso=error&msg=${encodeURIComponent(String(errorDescription || error))}`);
    }
    if (!code || !state || !savedState || String(state) !== String(savedState)) {
      return res.redirect('/login?sso=state');
    }

    const tokens = await exchangeCode(code);
    const profile = await fetchGraphMe(tokens.access_token);
    const user = await resolvePortalUser(profile);
    const userId = user.id || user.userId;
    if (!userId) {
      return res.redirect('/login?sso=user');
    }

    const token = newSessionToken();
    await createSession({
      userId,
      token,
      userAgent: req.headers['user-agent'] || '',
      ip: req.ip,
    });
    res.cookie(authCookieName(), token, authCookieOptions());
    return res.redirect('/');
  } catch (err) {
    console.error('Azure SSO callback failed:', err.message || err, err.details || '');
    const msg = encodeURIComponent(err.message || 'SSO failed');
    return res.redirect(`/login?sso=error&msg=${msg}`);
  }
}
