/**
 * Verify login credentials against the API.
 * Usage: node scripts/verify-credentials.cjs [baseUrl]
 *
 * Required env (never commit credentials):
 *   SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD (optional admin check)
 *   QA_USER_EMAIL, QA_USER_PASSWORD
 *   QA_VENDOR_EMAIL, QA_VENDOR_PASSWORD  (optional vendorCheck)
 *   QA_CREATOR_EMAIL, QA_CREATOR_PASSWORD
 */
const BASE = (process.argv[2] || process.env.API_BASE || 'http://localhost:5000/api/v1').replace(/\/$/, '');

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`Missing required env: ${name}`);
    process.exit(2);
  }
  return value;
}

function buildAccounts() {
  const accounts = [
    {
      label: 'Tourist',
      email: requireEnv('QA_USER_EMAIL'),
      password: requireEnv('QA_USER_PASSWORD'),
      role: 'USER',
    },
  ];

  if (process.env.SEED_ADMIN_EMAIL && process.env.SEED_ADMIN_PASSWORD) {
    accounts.unshift({
      label: 'Admin',
      email: process.env.SEED_ADMIN_EMAIL.trim(),
      password: process.env.SEED_ADMIN_PASSWORD.trim(),
      role: 'ADMIN',
    });
  }

  if (process.env.QA_VENDOR_EMAIL && process.env.QA_VENDOR_PASSWORD) {
    accounts.push({
      label: 'Vendor',
      email: process.env.QA_VENDOR_EMAIL.trim(),
      password: process.env.QA_VENDOR_PASSWORD.trim(),
      role: 'VENDOR',
      vendorCheck: true,
    });
  }

  if (process.env.QA_CREATOR_EMAIL && process.env.QA_CREATOR_PASSWORD) {
    accounts.push({
      label: 'Creator',
      email: process.env.QA_CREATOR_EMAIL.trim(),
      password: process.env.QA_CREATOR_PASSWORD.trim(),
      role: 'CONTENT_CREATOR',
    });
  }

  return accounts;
}

async function login(email, password) {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function getVendorMe(token) {
  const res = await fetch(`${BASE}/vendors/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function main() {
  const ACCOUNTS = buildAccounts();
  console.log(`Verifying credentials against ${BASE}\n`);
  let failed = 0;

  for (const acct of ACCOUNTS) {
    const { status, json } = await login(acct.email, acct.password);
    const ok = status === 200 && json?.success;
    const permission = json?.data?.user?.permission || json?.data?.user?.role;
    const match = !acct.role || permission === acct.role || (Array.isArray(json?.data?.user?.roles) && json.data.user.roles.includes(acct.role));

    if (!ok || !match) {
      failed++;
      console.log(`FAIL  ${acct.label} (${acct.email}) — status=${status} permission=${permission || 'n/a'}`);
      if (json?.message) console.log(`      ${json.message}`);
      continue;
    }

    if (acct.vendorCheck) {
      const token = json.data.accessToken;
      const v = await getVendorMe(token);
      if (v.status !== 200 || !v.json?.data) {
        failed++;
        console.log(`FAIL  ${acct.label} — login ok but /vendors/me failed (${v.status})`);
        continue;
      }
    }

    console.log(`OK    ${acct.label} (${acct.email}) — ${permission}`);
  }

  console.log(failed === 0 ? '\nAll credentials OK' : `\n${failed} account(s) failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
