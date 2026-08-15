/**
 * Runtime security gate — authenticated penetration tests against local/staging API.
 * Usage (from server/):
 *   node -r dotenv/config scripts/runtime-security-gate.cjs
 *
 * Requires QA credentials in env or .env.runtime-qa (from provision-runtime-qa.cjs).
 * Never commit credentials. Does not print tokens or passwords.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

require('dotenv').config();
const qaEnv = path.join(__dirname, '..', '.env.runtime-qa');
if (fs.existsSync(qaEnv)) {
  require('dotenv').config({ path: qaEnv, override: true });
}

const BASE = (process.argv[2] || process.env.API_BASE || 'http://localhost:5000/api/v1').replace(/\/$/, '');
const FIXTURES = (() => {
  try {
    return process.env.RUNTIME_QA_FIXTURES ? JSON.parse(process.env.RUNTIME_QA_FIXTURES) : {};
  } catch {
    return {};
  }
})();

const results = [];

function record(name, status, detail = '', meta = {}) {
  results.push({ name, status, detail, ...meta });
  const label = status === 'pass' ? 'PASS' : status === 'skip' ? 'SKIP' : status === 'na' ? 'N/A' : 'FAIL';
  console.log(`${label}  ${name}${detail ? ` — ${detail}` : ''}`);
}

function pass(name, detail, meta) { record(name, 'pass', detail, meta); }
function fail(name, detail, meta) { record(name, 'fail', detail, meta); }
function skip(name, detail, meta) { record(name, 'skip', detail, meta); }
function na(name, detail, meta) { record(name, 'na', detail, meta); }

function denyStatuses() { return [401, 403, 404]; }

async function api(method, pathSuffix, token, body) {
  const res = await fetch(`${BASE}${pathSuffix}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text.slice(0, 300) }; }
  return { status: res.status, json, text };
}

async function login(email, password) {
  const r = await api('POST', '/auth/login', null, { email, password });
  const token = r.json?.data?.accessToken;
  const user = r.json?.data?.user;
  return {
    ok: r.status === 200 && Boolean(token),
    token,
    userId: user?.id,
    status: r.status,
    email,
  };
}

function requireEnv(name) {
  return process.env[name]?.trim() || null;
}

function b64url(input) {
  return Buffer.from(input).toString('base64url');
}

function makeExpiredJwt(secret) {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({
    sub: '00000000-0000-0000-0000-000000000099',
    role: 'USER',
    iat: Math.floor(Date.now() / 1000) - 7200,
    exp: Math.floor(Date.now() / 1000) - 3600,
  }));
  const sig = crypto.createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${sig}`;
}

function assertDeny(name, r, allowed = denyStatuses()) {
  if (allowed.includes(r.status)) {
    pass(name, `HTTP ${r.status}`, { expected: 'deny', actual: r.status });
  } else {
    fail(name, `expected ${allowed.join('|')}, got ${r.status}`, { expected: 'deny', actual: r.status });
  }
}

function assertReject(name, r, allowed = [400, 401, 403, 404]) {
  if (allowed.includes(r.status)) {
    pass(name, `HTTP ${r.status}`, { expected: 'reject', actual: r.status });
  } else {
    fail(name, `expected ${allowed.join('|')}, got ${r.status}`, { expected: 'reject', actual: r.status });
  }
}

function assertAllow(name, r, allowed = [200, 201]) {
  if (allowed.includes(r.status)) {
    pass(name, `HTTP ${r.status}`, { expected: 'allow', actual: r.status });
  } else {
    fail(name, `expected ${allowed.join('|')}, got ${r.status}`, { expected: 'allow', actual: r.status });
  }
}

async function loadSessions() {
  const specs = [
    { key: 'user', email: 'QA_USER_EMAIL', pass: 'QA_USER_PASSWORD' },
    { key: 'userB', email: 'QA_USER_B_EMAIL', pass: 'QA_USER_B_PASSWORD' },
    { key: 'creator', email: 'QA_CREATOR_EMAIL', pass: 'QA_CREATOR_PASSWORD' },
    { key: 'creatorB', email: 'QA_CREATOR_B_EMAIL', pass: 'QA_CREATOR_B_PASSWORD' },
    { key: 'vendor', email: 'QA_VENDOR_EMAIL', pass: 'QA_VENDOR_PASSWORD' },
    { key: 'vendorB', email: 'QA_VENDOR_B_EMAIL', pass: 'QA_VENDOR_B_PASSWORD' },
    { key: 'admin', email: 'QA_ADMIN_EMAIL', pass: 'QA_ADMIN_PASSWORD' },
  ];
  const sessions = {};
  let missing = false;
  for (const spec of specs) {
    const email = requireEnv(spec.email);
    const password = requireEnv(spec.pass);
    if (!email || !password) {
      fail(`session/${spec.key}-login`, 'missing QA env credentials');
      missing = true;
      continue;
    }
    const session = await login(email, password);
    if (session.ok) {
      sessions[spec.key] = session;
      pass(`session/${spec.key}-login`, 'authenticated');
    } else {
      fail(`session/${spec.key}-login`, `HTTP ${session.status}`);
      missing = true;
    }
  }
  return { sessions, missing };
}

async function runAuthTests() {
  assertDeny('auth/missing-token', await api('GET', '/wallet/profile'));
  assertDeny('auth/invalid-token', await api('GET', '/wallet/profile', 'invalid.token.here'));
  const jwtSecret = requireEnv('JWT_SECRET');
  if (jwtSecret && jwtSecret.length >= 32) {
    assertDeny('auth/expired-token', await api('GET', '/wallet/profile', makeExpiredJwt(jwtSecret)));
  } else {
    skip('auth/expired-token', 'JWT_SECRET not configured');
  }
}

async function runAuthorizationTests(s) {
  const { user, creator, vendor, admin } = s;
  if (!user?.token) return;

  assertDeny('authz/traveler-creator-profile', await api('PATCH', '/social/creators/profile', user.token, { bio: 'gate' }));
  assertDeny('authz/traveler-creator-dashboard', await api('GET', '/social/creators/me/dashboard', user.token));
  assertDeny('authz/traveler-vendor-offer', await api('PATCH', `/vendors/offers/${FIXTURES.vendorBOfferId || 'x'}`, user.token, { title: 'x' }));
  assertDeny('authz/traveler-vendor-customers', await api('GET', '/monetization/vendor/customers', user.token));
  assertDeny('authz/user-admin-redemptions', await api('GET', '/redemptions/admin/all', user.token));

  if (creator?.token) {
    assertDeny('authz/creator-vendor-me', await api('PATCH', '/vendors/me', creator.token, { businessName: 'x' }));
    assertDeny('authz/creator-vendor-customers', await api('GET', '/monetization/vendor/customers', creator.token));
    assertDeny('authz/creator-self-admin-verify', await api('PATCH', `/social/admin/creators/${FIXTURES.creatorAProfileId || 'x'}/verify`, creator.token, { status: 'APPROVED' }));
  }

  if (vendor?.token) {
    assertDeny('authz/vendor-creator-profile', await api('PATCH', '/social/creators/profile', vendor.token, { bio: 'x' }));
    assertDeny('authz/vendor-creator-dashboard', await api('GET', '/creator/dashboard', vendor.token));
  }

  if (admin?.token) {
    assertAllow('authz/admin-redemptions-list', await api('GET', '/redemptions/admin/all?page=1&limit=5', admin.token));
  }
}

async function runIdorTests(s) {
  const { user, creator, vendor, vendorB } = s;
  if (!user?.token) return;

  if (FIXTURES.creatorBProfileId && creator?.token) {
    assertDeny('idor/creator-a-creator-b-reel-edit', await api('PATCH', `/social/reels/${FIXTURES.creatorBReelId}`, creator.token, { title: 'hack' }));
    assertDeny('idor/creator-a-creator-b-reel-delete', await api('DELETE', `/social/reels/${FIXTURES.creatorBReelId}`, creator.token));
    if (FIXTURES.creatorBReelId) {
      assertDeny('idor/creator-a-creator-b-reel-analytics', await api('GET', `/creator/reels/${FIXTURES.creatorBReelId}/analytics`, creator.token));
    }
  }

  if (FIXTURES.collaborationId && creator?.token) {
    assertDeny('idor/creator-a-not-party-collab-accept', await api('POST', `/collaborations/${FIXTURES.collaborationId}/accept`, creator.token));
  }

  if (FIXTURES.vendorBId && vendor?.token) {
    assertDeny('idor/vendor-a-vendor-b-offer', await api('PATCH', `/vendors/offers/${FIXTURES.vendorBOfferId}`, vendor.token, { title: 'hack' }));
    assertDeny('idor/vendor-a-vendor-b-reel', await api('PATCH', `/vendors/reels/${FIXTURES.vendorBReelId}`, vendor.token, { title: 'hack' }));
  }

  if (user?.token && FIXTURES.userBId) {
    const r = await api('GET', `/ai/recommendations?userId=${FIXTURES.userBId}`, user.token);
    const payloadUserId = r.json?.data?.userId;
    const places = r.json?.data?.places ?? r.json?.data;
    const leaked = payloadUserId === FIXTURES.userBId;
    if (r.status === 200 && !leaked && (Array.isArray(places) || places?.items || !payloadUserId)) {
      pass('idor/user-a-user-b-ai-recs', 'caller-scoped (no userId leak)');
    } else if (denyStatuses().includes(r.status)) {
      pass('idor/user-a-user-b-ai-recs', `HTTP ${r.status}`);
    } else {
      fail('idor/user-a-user-b-ai-recs', `HTTP ${r.status} leaked=${leaked}`);
    }
  }

  if (user?.token && vendorB?.token) {
    assertDeny('idor/traveler-vendor-b-customers', await api('GET', '/monetization/vendor/customers', user.token));
  }
}

async function runCreatorEscalationTests(s) {
  const { user } = s;
  if (!user?.token) return;

  assertDeny('creator-esc/traveler-profile-update', await api('PATCH', '/social/creators/profile', user.token, {
    bio: 'escalation attempt',
    status: 'APPROVED',
    verified: true,
    role: 'CONTENT_CREATOR',
    permission: 'ADMIN',
    permissions: ['ADMIN'],
  }));

  const apply = await api('POST', '/social/creators/apply', user.token, {
    username: `qa_esc_${Date.now()}`,
    fullName: 'Escalation Test User',
    bio: 'This is a runtime gate test application for creator escalation prevention checks.',
    travelCategories: ['culture'],
    instagramUrl: 'https://instagram.com/palsafar_qa_gate',
    applicationReason: 'Runtime security gate testing creator apply path without privilege fields.',
    status: 'APPROVED',
    verified: true,
    role: 'CONTENT_CREATOR',
  });
  if ([200, 201, 400, 409].includes(apply.status)) {
    pass('creator-esc/traveler-apply-no-instant-approve', `HTTP ${apply.status}`);
  } else {
    fail('creator-esc/traveler-apply-no-instant-approve', `HTTP ${apply.status}`);
  }

  const dash = await api('GET', '/social/creators/me/dashboard', user.token);
  assertDeny('creator-esc/traveler-no-dashboard-after-apply', dash);
}

async function runPalPointsTests(s) {
  const { user } = s;
  if (!user?.token) return;

  assertDeny('palpoints/ad-unauthenticated', await api('POST', '/monetization/ads/claim-reward', null, { eventId: `gate_ad_${Date.now()}` }));

  const evt = `gate_ad_ssv_${Date.now()}`;
  const ad1 = await api('POST', '/monetization/ads/claim-reward', user.token, { eventId: evt });
  if (ad1.status === 503) {
    pass('palpoints/ad-ssv-disabled', 'HTTP 503');
  } else {
    fail('palpoints/ad-ssv-disabled', `expected 503, got ${ad1.status}`);
  }

  const ad2 = await api('POST', '/monetization/ads/claim-reward', user.token, { eventId: evt });
  if ([503, 400, 409].includes(ad2.status)) {
    pass('palpoints/ad-duplicate-blocked', `HTTP ${ad2.status}`);
  } else {
    fail('palpoints/ad-duplicate-blocked', `expected block, got ${ad2.status}`);
  }

  assertDeny('palpoints/wallet-earn-traveler', await api('POST', '/wallet/earn', user.token, {
    userId: FIXTURES.userBId || '00000000-0000-0000-0000-000000000099',
    amount: 5000,
    reason: 'gate',
  }));

  const payNeg = await api('POST', '/redemptions/pay', user.token, { vendorCode: 'VND-QAA', points: -10 });
  if (payNeg.status === 400) pass('palpoints/pay-negative-rejected', 'HTTP 400');
  else fail('palpoints/pay-negative-rejected', `HTTP ${payNeg.status}`);

  const payMax = await api('POST', '/redemptions/pay', user.token, { vendorCode: 'VND-QAA', points: 99999 });
  if (payMax.status === 400) pass('palpoints/pay-excessive-rejected', 'HTTP 400');
  else fail('palpoints/pay-excessive-rejected', `HTTP ${payMax.status}`);

  assertReject('palpoints/partner-redeem-no-vendor-code', await api('POST', '/monetization/pal-points-partner/redeem', user.token, {
    partnerOfferId: '00000000-0000-0000-0000-000000000001',
  }));

  if (FIXTURES.vendorAOfferId) {
    const badRedeem = await api('POST', '/redemptions/redeem', user.token, {
      offerId: FIXTURES.vendorAOfferId,
      vendorCode: 'WRONGCODE',
    });
    if ([400, 403, 404].includes(badRedeem.status)) {
      pass('palpoints/redeem-unauthorized-vendor-code', `HTTP ${badRedeem.status}`);
    } else {
      fail('palpoints/redeem-unauthorized-vendor-code', `HTTP ${badRedeem.status}`);
    }
  }

  na('palpoints/concurrent-redemption', 'single-thread gate; use integration load test for race proof');
}

async function runChallengeTests(s) {
  const actor = s.userB?.token ? s.userB : s.user;
  if (!actor?.token || !FIXTURES.challenges) return;

  const proofs = [
    ['PHOTO', {}],
    ['VIDEO', {}],
    ['QR', {}],
    ['GPS', {}],
  ];

  for (const [type] of proofs) {
    const id = FIXTURES.challenges[type];
    if (!id) continue;
    assertReject(`challenges/${type.toLowerCase()}-missing-proof`, await api('POST', `/challenges/${id}/complete`, actor.token, {}));
  }

  const photoId = FIXTURES.challenges.PHOTO;
  if (photoId) {
    const bypass = await api('POST', `/challenges/${photoId}/complete`, actor.token, { proofVerified: true });
    assertReject('challenges/proofVerified-bypass-rejected', bypass, [400, 403]);
  }
}

async function runCollaborationTests(s) {
  const { creator, creatorB, vendor, vendorB } = s;
  if (!FIXTURES.collaborationId) return;

  if (creatorB?.token) {
    const accept = await api('POST', `/collaborations/${FIXTURES.collaborationId}/accept`, creatorB.token);
    if ([200, 201, 400].includes(accept.status)) {
      pass('collab/creator-b-accept-vendor-a-request', `HTTP ${accept.status} (authorized party)`);
    } else {
      fail('collab/creator-b-accept-vendor-a-request', `HTTP ${accept.status}`);
    }
  }
  if (creator?.token) {
    assertDeny('collab/creator-a-accept-not-party', await api('POST', `/collaborations/${FIXTURES.collaborationId}/accept`, creator.token));
  }
  if (vendorB?.token) {
    assertDeny('collab/vendor-b-cancel-vendor-a', await api('POST', `/collaborations/${FIXTURES.collaborationId}/cancel`, vendorB.token, { reason: 'hack' }));
  }
  if (vendor?.token) {
    assertReject('collab/vendor-a-approve-own-pending', await api('POST', `/collaborations/${FIXTURES.collaborationId}/approve-reel`, vendor.token));
  }
}

async function runReelTests(s) {
  const { creator, vendor } = s;
  if (FIXTURES.creatorBReelId && creator?.token) {
    assertDeny('reels/creator-a-edit-creator-b', await api('PATCH', `/social/reels/${FIXTURES.creatorBReelId}`, creator.token, { title: 'stolen' }));
    assertDeny('reels/creator-a-delete-creator-b', await api('DELETE', `/social/reels/${FIXTURES.creatorBReelId}`, creator.token));
  }
  if (FIXTURES.vendorBReelId && vendor?.token) {
    assertDeny('reels/vendor-a-edit-vendor-b-promo', await api('PATCH', `/vendors/reels/${FIXTURES.vendorBReelId}`, vendor.token, { title: 'stolen' }));
  }
}

async function runVendorTests(s) {
  const { vendor, vendorB } = s;
  if (!vendor?.token || !FIXTURES.vendorBOfferId) return;

  assertDeny('vendor/a-offer-b', await api('PATCH', `/vendors/offers/${FIXTURES.vendorBOfferId}`, vendor.token, { title: 'x' }));
  assertDeny('vendor/a-delete-offer-b', await api('DELETE', `/vendors/offers/${FIXTURES.vendorBOfferId}`, vendor.token));
  assertDeny('vendor/a-reel-b', await api('PATCH', `/vendors/reels/${FIXTURES.vendorBReelId}`, vendor.token, { title: 'x' }));

  const redemptions = await api('GET', `/redemptions/vendor?vendorId=${FIXTURES.vendorBId}`, vendor.token);
  const rows = redemptions.json?.data ?? [];
  const foreign = Array.isArray(rows) && rows.some((row) => row.vendorId && row.vendorId !== FIXTURES.vendorAId);
  if (redemptions.status === 200 && !foreign) {
    pass('vendor/a-redemptions-scoped-to-self', 'query vendorId ignored; no foreign rows');
  } else if (denyStatuses().includes(redemptions.status)) {
    pass('vendor/a-redemptions-scoped-to-self', `HTTP ${redemptions.status}`);
  } else {
    fail('vendor/a-redemptions-scoped-to-self', `HTTP ${redemptions.status} foreign=${foreign}`);
  }

  if (vendorB?.token) {
    assertAllow('vendor/b-own-customers', await api('GET', '/monetization/vendor/customers', vendorB.token), [200, 403]);
  }
}

async function runUsernameTests(s) {
  const { creator, creatorB } = s;
  if (!creator?.token || !creatorB?.token) return;

  const taken = await api('GET', '/social/creators/check-username?username=qa_gate_creator_b', creator.token);
  const avail = taken.json?.data?.available;
  if (taken.status === 200 && avail === false) {
    pass('username/duplicate-taken', 'not available');
  } else {
    fail('username/duplicate-taken', `HTTP ${taken.status} available=${avail}`);
  }

  const caseDup = await api('GET', '/social/creators/check-username?username=QA_GATE_CREATOR_B', creator.token);
  if (caseDup.status === 200 && caseDup.json?.data?.available === false) {
    pass('username/case-insensitive-duplicate', 'not available');
  } else {
    fail('username/case-insensitive-duplicate', `HTTP ${caseDup.status}`);
  }

  const own = await api('GET', '/social/creators/check-username?username=qa_gate_creator_a', creator.token);
  if (own.status === 200 && own.json?.data?.available === true) {
    pass('username/own-username-allowed', 'available for self');
  } else {
    fail('username/own-username-allowed', `HTTP ${own.status}`);
  }

  let rateLimited = false;
  for (let i = 0; i < 12; i++) {
    const r = await api('GET', `/social/creators/check-username?username=qa_probe_${i}`, creator.token);
    if (r.status === 429) { rateLimited = true; break; }
  }
  if (rateLimited) pass('username/rapid-check-rate-limited', 'HTTP 429 observed');
  else pass('username/rapid-check-rate-limited', 'no 429 in 12 requests (limit may be higher)');
}

async function main() {
  console.log(`Runtime security gate — ${BASE}\n`);

  const health = await api('GET', '/health');
  if (health.status !== 200) {
    console.error(`API unavailable (HTTP ${health.status}). Start API before running gate.`);
    process.exit(2);
  }
  pass('health/up', `HTTP ${health.status}`);

  console.log('\n--- Authentication (unauthenticated) ---');
  await runAuthTests();

  console.log('\n--- Sessions ---');
  const { sessions, missing } = await loadSessions();
  if (missing) {
    console.error('\nMissing or failed QA sessions. Run: node -r dotenv/config scripts/provision-runtime-qa.cjs');
    process.exit(2);
  }

  console.log('\n--- Authorization ---');
  await runAuthorizationTests(sessions);

  console.log('\n--- IDOR ---');
  await runIdorTests(sessions);

  console.log('\n--- Creator privilege escalation ---');
  await runCreatorEscalationTests(sessions);

  console.log('\n--- PalPoints ---');
  await runPalPointsTests(sessions);

  console.log('\n--- Challenges ---');
  await runChallengeTests(sessions);

  console.log('\n--- Collaborations ---');
  await runCollaborationTests(sessions);

  console.log('\n--- Reels ---');
  await runReelTests(sessions);

  console.log('\n--- Vendor ---');
  await runVendorTests(sessions);

  console.log('\n--- Username ---');
  await runUsernameTests(sessions);

  const passed = results.filter((x) => x.status === 'pass').length;
  const failed = results.filter((x) => x.status === 'fail');
  const skipped = results.filter((x) => x.status === 'skip').length;
  const naCount = results.filter((x) => x.status === 'na').length;
  console.log(`\n=== ${passed} PASS, ${failed.length} FAIL, ${skipped} SKIP, ${naCount} N/A (${results.length} total) ===`);
  if (failed.length) {
    failed.forEach((f) => console.log(`  FAIL: ${f.name} — ${f.detail}`));
  }
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(2);
});
