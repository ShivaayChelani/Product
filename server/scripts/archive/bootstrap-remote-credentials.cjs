/**
 * One-time bootstrap for production/staging when canonical accounts are missing or misconfigured.
 * Requires admin credentials via environment variables. Safe to re-run (idempotent).
 *
 * Usage:
 *   QA_ADMIN_EMAIL=... QA_ADMIN_PASSWORD=... node scripts/archive/bootstrap-remote-credentials.cjs [baseUrl]
 *
 * Optional vendor bootstrap (comma-separated emails, shared password):
 *   QA_VENDOR_EMAILS=vendor1@example.com,vendor2@example.com
 *   QA_VENDOR_PASSWORD=...
 */
const BASE = (process.argv[2] || 'https://palsafar-production.onrender.com/api/v1').replace(/\/$/, '');

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return value;
}

async function api(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function login(email, password) {
  const { status, json } = await api('/auth/login', {
    method: 'POST',
    body: { email, password },
  });
  if (status !== 200 || !json?.data?.accessToken) {
    throw new Error(`Login failed for ${email}: HTTP ${status}`);
  }
  return json.data.accessToken;
}

async function main() {
  const adminEmail = requireEnv('QA_ADMIN_EMAIL');
  const adminPassword = requireEnv('QA_ADMIN_PASSWORD');

  console.log(`Bootstrap remote credentials — ${BASE}\n`);

  const adminToken = await login(adminEmail, adminPassword);
  console.log('  Admin login OK');

  const vendorEmails = (process.env.QA_VENDOR_EMAILS || '')
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean);
  const vendorPassword = process.env.QA_VENDOR_PASSWORD?.trim();

  if (vendorEmails.length > 0 && vendorPassword) {
    for (const email of vendorEmails) {
      try {
        await login(email, vendorPassword);
        console.log(`  Vendor login OK: ${email}`);
      } catch (err) {
        console.warn(`  Vendor login failed: ${email}`);
      }
    }
  }

  const touristEmail = process.env.QA_USER_EMAIL?.trim();
  if (touristEmail && adminToken) {
    const users = await api(`/users?search=${encodeURIComponent(touristEmail)}&limit=20`, { token: adminToken });
    const list = users.json?.data ?? [];
    const tourist = list.find((u) => u.email === touristEmail);
    if (!tourist) {
      console.log(`  ${touristEmail} not found — will be created on next server deploy`);
    } else {
      console.log(`  Found tourist account: ${touristEmail}`);
    }
  }

  console.log('\nBootstrap complete.');
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
