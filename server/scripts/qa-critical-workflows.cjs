/**
 * Critical workflow QA — run against live API.
 * Usage: node scripts/qa-critical-workflows.cjs [baseUrl]
 *
 * Required env:
 *   QA_ADMIN_EMAIL, QA_ADMIN_PASSWORD
 *   QA_USER_EMAIL, QA_USER_PASSWORD
 *   QA_VENDOR_EMAIL, QA_VENDOR_PASSWORD
 *   QA_CREATOR_EMAIL, QA_CREATOR_PASSWORD
 */
const BASE = (process.argv[2] || 'http://localhost:5000/api/v1').replace(/\/$/, '');

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return value;
}

const results = [];

function record(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

async function login(email, password) {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json, token: json?.data?.accessToken };
}

async function api(method, path, token, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

async function main() {
  console.log(`Critical workflows — ${BASE}\n`);

  const admin = (await login(requireEnv('QA_ADMIN_EMAIL'), requireEnv('QA_ADMIN_PASSWORD'))).token;
  const tourist = (await login(requireEnv('QA_USER_EMAIL'), requireEnv('QA_USER_PASSWORD'))).token;
  const vendor = (await login(requireEnv('QA_VENDOR_EMAIL'), requireEnv('QA_VENDOR_PASSWORD'))).token;
  const creator = (await login(requireEnv('QA_CREATOR_EMAIL'), requireEnv('QA_CREATOR_PASSWORD'))).token;

  record('auth/admin', !!admin);
  record('auth/tourist', !!tourist);
  record('auth/vendor', !!vendor);
  record('auth/creator', !!creator);

  let r = await api('GET', '/wallet/profile', tourist);
  const walletBefore = r.json?.data?.palPoints ?? 0;
  record('wallet/tourist-balance', r.status === 200, `points=${walletBefore}`);

  r = await api('GET', '/vendors/me', vendor);
  const vendorCode = r.json?.data?.vendorCode;
  const vndOk = /^VND-[A-Z0-9]{6}$/i.test(vendorCode || '');
  record('vendor/code-format', vndOk, vendorCode || 'missing');

  r = await api('GET', '/vendors/offers/mine', vendor);
  record('vendor/offers-mine', r.status === 200);
  const offerId = r.json?.data?.[0]?.id;

  r = await api('GET', '/vendors/offers');
  record('offers/public-list', r.status === 200 && Array.isArray(r.json?.data));

  if (offerId && tourist) {
    r = await api('POST', '/redemptions/redeem', tourist, { offerId, vendorCode: 'VND-WRONG1' });
    record('redemption/wrong-vendor-code', r.status === 403 || r.status === 400, `HTTP ${r.status}`);
  }

  if (offerId && tourist && vendorCode) {
    r = await api('POST', '/redemptions/redeem', tourist, { offerId, vendorCode });
    const ok = r.status === 201 || r.status === 200;
    const dup = r.status === 400 && /duplicate|already|limit|insufficient/i.test(r.json?.message || '');
    record('redemption/attempt', ok || dup, `HTTP ${r.status} ${(r.json?.message || '').slice(0, 60)}`);
    if (ok && r.json?.data?.receiptNumber) {
      record('redemption/receipt-format', /^RCP-\d{4}-\d{6}$/.test(r.json.data.receiptNumber), r.json.data.receiptNumber);
    }
  }

  r = await api('POST', '/hidden-gems', tourist, {
    placeName: `QA Gem ${Date.now()}`,
    description: 'Automated QA hidden gem submission for duplicate detection workflow testing',
    latitude: 23.18,
    longitude: 79.95,
    category: 'VIEWPOINT',
    city: 'Jabalpur',
    state: 'Madhya Pradesh',
    worthVisitingReason: 'Scenic QA test viewpoint',
    locationMethod: 'gps',
  });
  record('hidden-gem/submit', r.status === 201, `HTTP ${r.status}`);
  const gemId = r.json?.data?.id;

  if (gemId && admin) {
    r = await api('GET', `/admin/hidden-gems/${gemId}/duplicates`, admin);
    record('hidden-gem/duplicate-check', r.status === 200, `HTTP ${r.status}`);
  }

  r = await api('GET', '/redemptions/admin/all?limit=5&receiptNumber=RCP', admin);
  record('admin/redemption-search', r.status === 200);

  r = await api('GET', '/redemptions/admin/all', tourist);
  record('rbac/tourist-denied-admin-redemptions', r.status === 403, `HTTP ${r.status}`);

  r = await api('POST', '/vendors/me/regenerate-code', vendor);
  record('security/vendor-cannot-regenerate', r.status === 404 || r.status === 405, `HTTP ${r.status}`);

  r = await api('GET', '/analytics/dashboard', admin);
  record('admin/analytics', r.status === 200);

  if (offerId && admin) {
    r = await api('GET', `/vendors/admin/offers/${offerId}/analytics?period=30d`, admin);
    record('admin/offer-analytics', r.status === 200);
  }

  const failed = results.filter((x) => !x.pass).length;
  console.log(`\n--- ${results.length - failed}/${results.length} passed ---`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
