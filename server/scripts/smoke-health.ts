/**
 * Smoke test production/staging API health.
 * Usage: npx ts-node scripts/smoke-health.ts [baseUrl]
 * Exit 0 = healthy, 1 = degraded/unreachable
 */
const base = (process.argv[2] || process.env.API_BASE_URL || 'https://palsafar-api-fh7i.onrender.com').replace(/\/+$/, '');

async function check(path: string) {
  const url = `${base}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90_000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    const body = await res.json().catch(() => ({}));
    return { url, status: res.status, body };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  console.log(JSON.stringify({ event: 'smoke_start', base, ts: new Date().toISOString() }));

  const root = await check('/health');
  const v1 = await check('/api/v1/health');

  const rootDbUp = root.body?.data?.database === 'up';
  const v1DbField = v1.body?.data?.database;
  const v1LegacyPayload = v1.body?.data == null;
  const v1DbUp = v1DbField === 'up' || (v1LegacyPayload && rootDbUp);
  const ok = root.status === 200 && v1.status === 200 && rootDbUp && v1DbUp;

  console.log(JSON.stringify({
    root,
    v1,
    ok,
    legacyV1Health: v1LegacyPayload && rootDbUp,
    note: v1LegacyPayload && rootDbUp
      ? 'Deploy latest API for /api/v1/health database check'
      : undefined,
  }, null, 2));
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error(JSON.stringify({ event: 'smoke_error', error: (err as Error).message }));
  process.exit(1);
});
