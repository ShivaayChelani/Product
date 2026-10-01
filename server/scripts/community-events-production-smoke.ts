import fs from 'node:fs';
import path from 'node:path';

const REQUIRED_ENV = [
  'PROD_BASE_URL',
  'SMOKE_USER_EMAIL',
  'SMOKE_USER_PASSWORD',
  'SMOKE_ADMIN_EMAIL',
  'SMOKE_ADMIN_PASSWORD',
] as const;

const TIME_STAMP = new Date().toISOString();
const REPORT_PATH = path.join(process.cwd(), 'artifacts', 'community-events-production-smoke-report.md');
const LOG_PATH = path.join(process.cwd(), 'artifacts', 'community-events-production-smoke.log');

const RESULTS: Array<{
  name: string;
  status: 'PASS' | 'FAIL' | 'BLOCKED' | 'NON-BLOCKING WARNING';
  endpoint: string;
  httpStatus?: number;
  detail: string;
  evidence: string;
}> = [];

const BELL = '🔎';
const OK = '✅';
const WARN = '⚠️';
const FAIL = '❌';
const BLOCK = '⛔';

type ApiResult = { status: number; url: string; body: any };

type AuthTokens = { userToken: string; adminToken: string };

type SmokeContext = {
  baseUrl: string;
  userEmail: string;
  userPassword: string;
  adminEmail: string;
  adminPassword: string;
  userToken: string;
  adminToken: string;
  eventId?: string;
  eventTitle?: string;
  reportId?: string;
  reelId?: string;
  originalReelEventId?: string | null;
  reelLinkChanged?: boolean;
  reportHandled?: boolean;
  eventCancelled?: boolean;
};

const ARRANGE = {
  eventTitlePrefix: '[SMOKE TEST] PalSafar Community Event',
  latitude: 22.1793,
  longitude: 79.9889,
  startDate: '2036-05-01',
  endDate: '2036-05-03',
};
const PRODUCTION_API_ORIGIN = 'https://palsafar-api-fh7i.onrender.com';
let cleanupFailed = false;

function ensureReportDir() {
  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
}

function appendLog(line: string) {
  ensureReportDir();
  fs.appendFileSync(LOG_PATH, `${line}\n`, 'utf8');
}

function recordResult(
  name: string,
  status: 'PASS' | 'FAIL' | 'BLOCKED' | 'NON-BLOCKING WARNING',
  endpoint: string,
  detail: string,
  evidence = '',
  httpStatus?: number,
) {
  RESULTS.push({ name, status, endpoint, httpStatus, detail, evidence });
  const label = status === 'PASS' ? OK : status === 'FAIL' ? FAIL : status === 'BLOCKED' ? BLOCK : WARN;
  const payload = `${label} ${name}: ${detail}${httpStatus ? ` (HTTP ${httpStatus})` : ''}`;
  console.log(payload);
  if (evidence) {
    console.log(`  Evidence: ${evidence}`);
  }
  appendLog(payload);
}

function requireText(value: string | undefined, label: string): string {
  if (!value || !value.trim()) {
    throw new Error(`${label} is missing or empty`);
  }
  return value.trim();
}

async function fetchJson(url: string, init: RequestInit = {}): Promise<ApiResult> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init.headers ?? {}),
    },
  });

  const raw = await response.text();
  let body: any = {};
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    body = { raw: raw.slice(0, 2000) };
  }

  return { status: response.status, url, body };
}

function extractToken(body: any): string | undefined {
  const token = body?.data?.accessToken ?? body?.accessToken ?? body?.token;
  return typeof token === 'string' && token.length > 0 ? token : undefined;
}

function extractUserId(body: any): string | undefined {
  return body?.data?.id ?? body?.user?.id ?? body?.id;
}

function extractEventId(body: any): string | undefined {
  return body?.data?.id ?? body?.id ?? body?.event?.id;
}

function eventListEntries(body: any): any[] {
  if (Array.isArray(body?.data)) return body.data;
  if (Array.isArray(body?.data?.items)) return body.data.items;
  if (Array.isArray(body?.events)) return body.events;
  if (Array.isArray(body?.data?.events)) return body.data.events;
  return [];
}

function asArray(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}

async function login(baseUrl: string, email: string, password: string): Promise<string> {
  const response = await fetchJson(`${baseUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (response.status !== 200) {
    throw new Error(`Login failed: ${response.status} ${JSON.stringify(response.body).slice(0, 500)}`);
  }

  const token = extractToken(response.body);
  if (!token) {
    throw new Error('Login response did not include an access token');
  }
  return token;
}

async function me(baseUrl: string, token: string): Promise<{ status: number; userId?: string; body: any }> {
  const response = await fetchJson(`${baseUrl}/api/v1/auth/me`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
  return { status: response.status, userId: extractUserId(response.body), body: response.body };
}

function sanitizeSummary() {
  const overall = (() => {
    if (RESULTS.some((item) => item.status === 'BLOCKED')) return 'BLOCKED';
    if (RESULTS.some((item) => item.status === 'FAIL')) return 'FAIL';
    if (RESULTS.some((item) => item.status === 'NON-BLOCKING WARNING')) return 'PASS WITH NON-BLOCKING WARNINGS';
    return 'PASS';
  })();

  const lines: string[] = [
    '# Production Community Events Smoke Test',
    '',
    'Environment: Production',
    `Timestamp: ${TIME_STAMP}`,
    `Overall Status: ${overall}`,
    '',
    '## Results',
    '',
    ...RESULTS.map((result) => `- ${result.status}: ${result.name} | ${result.endpoint} | ${result.detail}`),
    '',
    '## Blockers',
    '',
    ...RESULTS.filter((result) => result.status === 'BLOCKED').map((result) => `- ${result.name}: ${result.detail}`),
    '',
    '## Non-Blockers',
    '',
    ...RESULTS.filter((result) => result.status === 'NON-BLOCKING WARNING').map((result) => `- ${result.name}: ${result.detail}`),
    '',
    '## Failed Tests',
    '',
    ...RESULTS.filter((result) => result.status === 'FAIL').map((result) => {
      const detail = [
        `- Test: ${result.name}`,
        `  Endpoint: ${result.endpoint}`,
        `  HTTP status: ${result.httpStatus ?? 'n/a'}`,
        `  Expected: ${result.detail}`,
        `  Actual: ${result.evidence || 'Not available'}`,
      ];
      return detail.join('\n');
    }),
    '',
    '## Evidence',
    '',
    `- Base URL: ${process.env.PROD_BASE_URL ?? 'not provided'}`,
    `- Event ID used: ${RESULTS.find((result) => result.name === 'Create Event')?.evidence ?? 'n/a'}`,
    `- Reel ID used: ${RESULTS.find((result) => result.name === 'Reel ↔ Event Linkage')?.evidence ?? 'n/a'}`,
    `- Report ID used: ${RESULTS.find((result) => result.name === 'Report Flow')?.evidence ?? 'n/a'}`,
    `- GitHub Actions command: npm run smoke:community-events`,
    `- Commit SHA: ${process.env.GITHUB_SHA ?? 'local-run'}`,
    '',
  ];

  return lines.join('\n');
}

async function run(): Promise<number> {
  ensureReportDir();
  appendLog(`Production Community Events smoke test started at ${TIME_STAMP}`);

  const baseUrl = (process.env.PROD_BASE_URL ?? '').replace(/\/+$/, '');
  const userEmail = process.env.SMOKE_USER_EMAIL ?? '';
  const userPassword = process.env.SMOKE_USER_PASSWORD ?? '';
  const adminEmail = process.env.SMOKE_ADMIN_EMAIL ?? '';
  const adminPassword = process.env.SMOKE_ADMIN_PASSWORD ?? '';

  const requiredCheck = REQUIRED_ENV.every((key) => Boolean(process.env[key] && process.env[key]!.trim()));
  if (!requiredCheck) {
    const missing = REQUIRED_ENV.filter((key) => !process.env[key]?.trim());
    const detectionEndpoint = baseUrl ? `${baseUrl}/api/v1/auth/login` : 'PROD_BASE_URL';
    recordResult('Authentication', 'BLOCKED', detectionEndpoint, 'Missing required production smoke-test secrets.', `Missing env vars: ${missing.join(', ')}`);
    fs.writeFileSync(REPORT_PATH, sanitizeSummary(), 'utf8');
    appendLog('Missing required production smoke-test secrets.');
    return 2;
  }

  const ctx: SmokeContext = {
    baseUrl,
    userEmail,
    userPassword,
    adminEmail,
    adminPassword,
    userToken: '',
    adminToken: '',
  };

  try {
    let parsedBaseUrl: URL;
    try {
      parsedBaseUrl = new URL(baseUrl);
    } catch {
      recordResult('Production Target', 'BLOCKED', 'PROD_BASE_URL', 'PROD_BASE_URL must be the configured production API origin.', `Expected ${PRODUCTION_API_ORIGIN}`);
      return 2;
    }
    if (parsedBaseUrl.origin !== PRODUCTION_API_ORIGIN || parsedBaseUrl.pathname !== '/') {
      recordResult('Production Target', 'BLOCKED', 'PROD_BASE_URL', 'Smoke tests are restricted to the production API configured by the repository.', `Expected ${PRODUCTION_API_ORIGIN}`);
      return 2;
    }

  try {
    const rootHealth = await fetchJson(`${baseUrl}/health`);
    const apiHealth = await fetchJson(`${baseUrl}/api/v1/health`);
    const databaseUp = apiHealth.body?.data?.database === 'up' || rootHealth.body?.data?.database === 'up';
    if (rootHealth.status === 200 && apiHealth.status === 200 && databaseUp) {
      recordResult('Production Health', 'PASS', `${baseUrl}/api/v1/health`, 'Production API and database health checks succeeded.', JSON.stringify({ root: rootHealth.status, api: apiHealth.status, database: apiHealth.body?.data?.database ?? rootHealth.body?.data?.database }), rootHealth.status);
    } else {
      recordResult('Production Health', 'FAIL', `${baseUrl}/api/v1/health`, 'Production API or database health check failed.', JSON.stringify({ root: rootHealth.status, api: apiHealth.status, database: apiHealth.body?.data?.database ?? rootHealth.body?.data?.database }), Math.max(rootHealth.status, apiHealth.status));
      return 1;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    recordResult('Production Health', 'BLOCKED', `${baseUrl}/api/v1/health`, 'Could not reach the production API.', message);
    return 2;
  }

  try {
    ctx.userToken = await login(baseUrl, userEmail, userPassword);
    const meRes = await me(baseUrl, ctx.userToken);
    if (meRes.status !== 200 || !meRes.userId) {
      throw new Error(`Unexpected /auth/me response: ${meRes.status}`);
    }
    recordResult('Authentication', 'PASS', `${baseUrl}/api/v1/auth/me`, 'Authenticated smoke user session is valid.', `userId=${meRes.userId}`, meRes.status);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    recordResult('Authentication', 'BLOCKED', `${baseUrl}/api/v1/auth/login`, 'User authentication failed for the production smoke account.', message);
    fs.writeFileSync(REPORT_PATH, sanitizeSummary(), 'utf8');
    appendLog('Blocking due to smoke user authentication failure.');
    return 2;
  }

  try {
    ctx.adminToken = await login(baseUrl, adminEmail, adminPassword);
    const meRes = await me(baseUrl, ctx.adminToken);
    const adminUserId = meRes.userId;
    if (meRes.status !== 200 || !adminUserId) {
      throw new Error(`Unexpected admin /auth/me response: ${meRes.status}`);
    }
    const adminAccess = await fetchJson(`${baseUrl}/api/v1/admin/events?limit=1`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${ctx.adminToken}` },
    });
    if (adminAccess.status >= 400) {
      throw new Error(`Admin moderation access failed: ${adminAccess.status}`);
    }
    recordResult('Admin Authentication', 'PASS', `${baseUrl}/api/v1/admin/events`, 'Admin session is valid and moderation APIs are reachable.', `adminId=${adminUserId}`, adminAccess.status);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    recordResult('Admin Authentication', 'BLOCKED', `${baseUrl}/api/v1/admin/events`, 'Admin authentication or moderation access failed.', message);
    fs.writeFileSync(REPORT_PATH, sanitizeSummary(), 'utf8');
    return 2;
  }

  try {
    const creatorReels = await fetchJson(`${baseUrl}/api/v1/social/creators/me/reels?limit=50`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${ctx.userToken}` },
    });
    const publishedReels = asArray(creatorReels.body?.data?.items)
      .filter((reel: any) => reel.status === 'APPROVED' && reel.id);
    if (creatorReels.status !== 200 || publishedReels.length === 0) {
      throw new Error(`Smoke user needs an approved creator profile and an approved reel to verify event linkage without publishing a new reel. Status ${creatorReels.status}.`);
    }
    const reel = publishedReels[0];
    ctx.reelId = String(reel.id);
    ctx.originalReelEventId = reel.eventId ?? null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    recordResult('Reel ↔ Event Linkage', 'BLOCKED', `${baseUrl}/api/v1/social/creators/me/reels`, 'A published smoke-user reel is required to exercise event linkage without creating permanent production reward data.', message);
    fs.writeFileSync(REPORT_PATH, sanitizeSummary(), 'utf8');
    return 2;
  }

  const eventTitle = `${ARRANGE.eventTitlePrefix} ${Date.now()}`;
  ctx.eventTitle = eventTitle;

  try {
    const response = await fetchJson(`${baseUrl}/api/v1/events`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ctx.userToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: eventTitle,
        description: 'This event was created by the automated PalSafar production smoke test and is temporary.',
        eventType: 'FESTIVAL',
        startDate: ARRANGE.startDate,
        endDate: ARRANGE.endDate,
        latitude: ARRANGE.latitude,
        longitude: ARRANGE.longitude,
        address: 'Nagpur, Maharashtra',
        city: 'Nagpur',
        state: 'Maharashtra',
      }),
    });

    if (response.status !== 201 && response.status !== 200) {
      throw new Error(`Unexpected create event status: ${response.status}. ${JSON.stringify(response.body).slice(0, 500)}`);
    }

    const eventId = extractEventId(response.body);
    if (!eventId) {
      throw new Error('Create event response did not include an event ID.');
    }
    ctx.eventId = eventId;

    const evtStatus = response.body?.data?.status ?? response.body?.status;
    if (evtStatus && evtStatus !== 'PENDING') {
      throw new Error(`Event status was ${evtStatus} instead of PENDING after creation.`);
    }

    recordResult('Create Event', 'PASS', `${baseUrl}/api/v1/events`, 'Temporary event created and stored in PENDING moderation state.', `eventId=${eventId}; status=${evtStatus ?? 'PENDING'}`, response.status);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    recordResult('Create Event', 'FAIL', `${baseUrl}/api/v1/events`, 'Smoke user could not create a temporary production event.', message);
    fs.writeFileSync(REPORT_PATH, sanitizeSummary(), 'utf8');
    return 1;
  }

  try {
    const queueResp = await fetchJson(`${baseUrl}/api/v1/admin/events?limit=200&status=PENDING`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${ctx.adminToken}` },
    });

    const items = eventListEntries(queueResp.body);
    const match = items.find((item: any) => String(item.id) === String(ctx.eventId) || String(item.title) === String(eventTitle));
    if (queueResp.status !== 200 || !match) {
      throw new Error(`Pending queue did not contain the newly created event. Status ${queueResp.status}. Payload: ${JSON.stringify(queueResp.body).slice(0, 500)}`);
    }
    recordResult('Moderation Queue', 'PASS', `${baseUrl}/api/v1/admin/events`, 'Newly created event is visible in the moderation queue in PENDING state.', `eventId=${ctx.eventId}`, queueResp.status);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    recordResult('Moderation Queue', 'FAIL', `${baseUrl}/api/v1/admin/events`, 'Admin moderation queue could not confirm the test event.', message);
    fs.writeFileSync(REPORT_PATH, sanitizeSummary(), 'utf8');
    return 1;
  }

  try {
    const approveRes = await fetchJson(`${baseUrl}/api/v1/admin/events/${ctx.eventId}/approve`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${ctx.adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ force: true, isFeatured: false }),
    });

    if (approveRes.status < 200 || approveRes.status >= 300) {
      throw new Error(`Approve endpoint returned ${approveRes.status}: ${JSON.stringify(approveRes.body).slice(0, 500)}`);
    }

    const verifyRes = await fetchJson(`${baseUrl}/api/v1/events/${ctx.eventId}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${ctx.adminToken}` },
    });

    const status = verifyRes.body?.data?.status ?? verifyRes.body?.status;
    if (verifyRes.status !== 200 || status === 'PENDING' || status === 'REJECTED' || status === 'CANCELLED') {
      throw new Error(`Approval verification failed. Status ${verifyRes.status}; persisted status=${status ?? 'unknown'}`);
    }
    recordResult('Admin Approval', 'PASS', `${baseUrl}/api/v1/admin/events/${ctx.eventId}/approve`, 'Event was approved and persisted in an active public state.', `status=${status ?? 'unknown'}`, approveRes.status);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    recordResult('Admin Approval', 'FAIL', `${baseUrl}/api/v1/admin/events/${ctx.eventId}/approve`, 'Admin approval did not successfully publish the smoke-test event.', message);
    fs.writeFileSync(REPORT_PATH, sanitizeSummary(), 'utf8');
    return 1;
  }

  try {
    const mapResp = await fetchJson(`${baseUrl}/api/v1/events/map?north=23.6&south=21.4&east=80.4&west=78.8&limit=200`, {
      method: 'GET',
    });
    const ids = asArray(mapResp.body?.data).map((event: any) => String(event.id));
    if (mapResp.status !== 200 || !ids.includes(String(ctx.eventId))) {
      throw new Error(`Map did not include event ${ctx.eventId}. Status ${mapResp.status}; ids=${ids.slice(0, 10).join(', ') || 'none'}`);
    }
    recordResult('Map Visibility', 'PASS', `${baseUrl}/api/v1/events/map`, 'Approved event appears in the public event map within the expected viewport.', `eventId=${ctx.eventId}`, mapResp.status);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    recordResult('Map Visibility', 'FAIL', `${baseUrl}/api/v1/events/map`, 'Approved event is not publicly discoverable on the map.', message);
    fs.writeFileSync(REPORT_PATH, sanitizeSummary(), 'utf8');
    return 1;
  }

  try {
    const searchResp = await fetchJson(`${baseUrl}/api/v1/events?q=${encodeURIComponent(eventTitle)}`);
    const ids = asArray(searchResp.body?.data).map((event: any) => String(event.id));
    if (searchResp.status !== 200 || !ids.includes(String(ctx.eventId))) {
      throw new Error(`Search did not include event ${ctx.eventId}. Status ${searchResp.status}; ids=${ids.slice(0, 10).join(', ') || 'none'}`);
    }
    recordResult('Search Visibility', 'PASS', `${baseUrl}/api/v1/events?q=`, 'Search results include the smoke-test event by exact title.', `eventId=${ctx.eventId}`, searchResp.status);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    recordResult('Search Visibility', 'FAIL', `${baseUrl}/api/v1/events?q=`, 'Public search did not surface the approved smoke-test event.', message);
    fs.writeFileSync(REPORT_PATH, sanitizeSummary(), 'utf8');
    return 1;
  }

  try {
    const detailResp = await fetchJson(`${baseUrl}/api/v1/events/${ctx.eventId}`);
    if (detailResp.status !== 200) {
      throw new Error(`Public event detail returned ${detailResp.status}`);
    }
    if (String(detailResp.body?.data?.id) !== String(ctx.eventId)) {
      throw new Error(`Detail payload mismatched the event ID: ${detailResp.body?.data?.id ?? 'missing'}`);
    }
    recordResult('Event Detail', 'PASS', `${baseUrl}/api/v1/events/${ctx.eventId}`, 'Public event detail endpoint resolves the approved event correctly.', `id=${detailResp.body?.data?.id}; title=${detailResp.body?.data?.title}`, detailResp.status);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    recordResult('Event Detail', 'FAIL', `${baseUrl}/api/v1/events/${ctx.eventId}`, 'Public detail endpoint did not return the approved event as expected.', message);
    fs.writeFileSync(REPORT_PATH, sanitizeSummary(), 'utf8');
    return 1;
  }

  try {
    const creatorReel = await fetchJson(`${baseUrl}/api/v1/social/creators/me/reels?limit=50`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${ctx.userToken}` },
    });
    if (creatorReel.status !== 200 || !ctx.reelId) {
      throw new Error(`Could not access the approved smoke-user reel: ${creatorReel.status}`);
    }
    ctx.reelLinkChanged = true;
    const linkResp = await fetchJson(`${baseUrl}/api/v1/social/reels/${ctx.reelId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${ctx.userToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ eventId: ctx.eventId }),
    });
    if (linkResp.status < 200 || linkResp.status >= 300) {
      throw new Error(`Linking the published reel to the smoke event failed: ${linkResp.status}. ${JSON.stringify(linkResp.body).slice(0, 400)}`);
    }
    const eventReels = await fetchJson(`${baseUrl}/api/v1/events/${ctx.eventId}/reels?limit=50`);
    const linkedReels = asArray(eventReels.body?.data);
    if (eventReels.status !== 200 || !linkedReels.some((reel: any) => String(reel.id) === ctx.reelId)) {
      throw new Error(`Event -> Reel listing did not contain reel ${ctx.reelId}; status=${eventReels.status}`);
    }

    const reelDetail = await fetchJson(`${baseUrl}/api/v1/social/reels/${ctx.reelId}`, {
      headers: { Authorization: `Bearer ${ctx.userToken}` },
    });
    const detailEventId = reelDetail.body?.data?.eventId ?? reelDetail.body?.data?.event?.id;
    if (reelDetail.status !== 200 || String(detailEventId) !== String(ctx.eventId)) {
      throw new Error(`Reel -> Event detail did not contain event ${ctx.eventId}; status=${reelDetail.status}; eventId=${detailEventId ?? 'missing'}`);
    }
    recordResult('Reel ↔ Event Linkage', 'PASS', `${baseUrl}/api/v1/events/${ctx.eventId}/reels`, 'The smoke event lists the linked published reel, and reel detail points back to the smoke event.', `reelId=${ctx.reelId}; eventId=${ctx.eventId}`, eventReels.status);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    recordResult('Reel ↔ Event Linkage', 'FAIL', `${baseUrl}/api/v1/social/reels/${ctx.reelId}`, 'Both reel-to-event and event-to-reel linkage must be verified.', message);
    fs.writeFileSync(REPORT_PATH, sanitizeSummary(), 'utf8');
    return 1;
  }

  try {
    const reportResp = await fetchJson(`${baseUrl}/api/v1/events/${ctx.eventId}/report`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ctx.userToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ reason: 'FAKE_EVENT', details: 'Automated smoke-test report against temporary event.' }),
    });

    if (reportResp.status !== 201 && reportResp.status !== 200) {
      throw new Error(`Report endpoint returned ${reportResp.status}: ${JSON.stringify(reportResp.body).slice(0, 500)}`);
    }

    const reportId = reportResp.body?.data?.id ?? reportResp.body?.id;
    if (!reportId) {
      throw new Error('Report response did not include a report ID required for admin handling and cleanup.');
    }
    ctx.reportId = reportId;
    recordResult('Report Flow', 'PASS', `${baseUrl}/api/v1/events/${ctx.eventId}/report`, 'User report was accepted and stored for admin review.', `reportId=${reportId ?? 'unknown'}`, reportResp.status);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    recordResult('Report Flow', 'FAIL', `${baseUrl}/api/v1/events/${ctx.eventId}/report`, 'The smoke-test event report could not be created.', message);
    fs.writeFileSync(REPORT_PATH, sanitizeSummary(), 'utf8');
    return 1;
  }

  try {
    const reportListResp = await fetchJson(`${baseUrl}/api/v1/admin/events/reports`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${ctx.adminToken}` },
    });
    const reportRows = asArray(reportListResp.body?.data).filter((item: any) => String(item.eventId) === String(ctx.eventId));
    if (reportListResp.status !== 200 || reportRows.length === 0) {
      throw new Error(`Admin reports list did not show the smoke report: ${reportListResp.status}`);
    }
    ctx.reportId = reportRows[0]?.id ?? ctx.reportId;
    const resolveResp = await fetchJson(`${baseUrl}/api/v1/admin/events/reports/${ctx.reportId}/resolve`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${ctx.adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ resolutionNote: 'Resolved during PalSafar production smoke test.' }),
    });
    if (resolveResp.status < 200 || resolveResp.status >= 300) {
      throw new Error(`Resolve report failed: ${resolveResp.status}; body=${JSON.stringify(resolveResp.body).slice(0, 400)}`);
    }
    ctx.reportHandled = true;
    recordResult('Admin Report Handling', 'PASS', `${baseUrl}/api/v1/admin/events/reports/${ctx.reportId}/resolve`, 'The admin successfully reviewed and resolved the smoke-test event report.', `reportId=${ctx.reportId}`, resolveResp.status);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    recordResult('Admin Report Handling', 'FAIL', `${baseUrl}/api/v1/admin/events/reports`, 'Report review or resolution did not complete as expected.', message);
    fs.writeFileSync(REPORT_PATH, sanitizeSummary(), 'utf8');
    return 1;
  }

  try {
    const featureResp = await fetchJson(`${baseUrl}/api/v1/admin/events/${ctx.eventId}/feature`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${ctx.adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ isFeatured: true }),
    });
    if (featureResp.status < 200 || featureResp.status >= 300) {
      throw new Error(`Feature endpoint failed: ${featureResp.status}`);
    }
    const featuredResp = await fetchJson(`${baseUrl}/api/v1/events/featured?limit=20`);
    const featuredIds = asArray(featuredResp.body?.data).map((item: any) => String(item.id));
    if (featuredResp.status !== 200 || !featuredIds.includes(String(ctx.eventId))) {
      throw new Error(`Featured list did not include event ${ctx.eventId}; status=${featuredResp.status}`);
    }
    recordResult('Feature Flow', 'PASS', `${baseUrl}/api/v1/admin/events/${ctx.eventId}/feature`, 'Event was successfully featured and appears in the public featured events feed.', `eventId=${ctx.eventId}`, featureResp.status);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    recordResult('Feature Flow', 'FAIL', `${baseUrl}/api/v1/admin/events/${ctx.eventId}/feature`, 'Feature operation did not complete successfully.', message);
    fs.writeFileSync(REPORT_PATH, sanitizeSummary(), 'utf8');
    return 1;
  }

  try {
    const unauthCreateResp = await fetchJson(`${baseUrl}/api/v1/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Unauthorized event',
        eventType: 'FESTIVAL',
        startDate: '2036-05-10',
        latitude: 22.5,
        longitude: 78.5,
        city: 'Nagpur',
        state: 'Maharashtra',
      }),
    });

    if (unauthCreateResp.status !== 401) {
      throw new Error(`Expected 401 for unauthenticated create, got ${unauthCreateResp.status}`);
    }

    const userAdminList = await fetchJson(`${baseUrl}/api/v1/admin/events?limit=1`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${ctx.userToken}` },
    });
    if (userAdminList.status !== 403 && userAdminList.status !== 401) {
      throw new Error(`Expected non-authorized status for user admin access, got ${userAdminList.status}`);
    }

    const invalidEvent = await fetchJson(`${baseUrl}/api/v1/events/not-a-valid-event-id`);
    if (invalidEvent.status !== 404) {
      throw new Error(`Expected 404 for invalid event ID, got ${invalidEvent.status}`);
    }

    const malformed = await fetchJson(`${baseUrl}/api/v1/events`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ctx.userToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title: '', latitude: 'bad', longitude: 'bad', startDate: 'not-a-date' }),
    });
    if (malformed.status !== 400) {
      throw new Error(`Expected validation error 400, got ${malformed.status}`);
    }

    recordResult('Authorization Checks', 'PASS', `${baseUrl}/api/v1/admin/events`, 'Security boundaries are enforced for unauthenticated writes and unauthorized moderation access.', `unauthCreate=${unauthCreateResp.status}; userAdmin=${userAdminList.status}; invalidEvent=${invalidEvent.status}; malformed=${malformed.status}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    recordResult('Authorization Checks', 'FAIL', `${baseUrl}/api/v1/admin/events`, 'Authorization or validation checks did not match the expected security behavior.', message);
    fs.writeFileSync(REPORT_PATH, sanitizeSummary(), 'utf8');
    return 1;
  }

  try {
    const cancelResp = await fetchJson(`${baseUrl}/api/v1/events/${ctx.eventId}/cancel`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ctx.userToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ reason: 'Smoke test cleanup.' }),
    });
    if (cancelResp.status < 200 || cancelResp.status >= 300) {
      throw new Error(`Cancel endpoint returned ${cancelResp.status}`);
    }
    const cancelledDetail = await fetchJson(`${baseUrl}/api/v1/events/${ctx.eventId}`);
    const finalStatus = cancelledDetail.body?.data?.status ?? cancelledDetail.body?.status;
    if (cancelledDetail.status !== 200 || finalStatus !== 'CANCELLED') {
      throw new Error(`Cancelled event verification failed. Status=${cancelledDetail.status}; finalStatus=${finalStatus ?? 'unknown'}`);
    }
    ctx.eventCancelled = true;
    recordResult('Cancel Event Flow', 'PASS', `${baseUrl}/api/v1/events/${ctx.eventId}/cancel`, 'Smoke-test event has been cancelled and no longer appears as active.', `finalStatus=${finalStatus}`, cancelResp.status);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    recordResult('Cancel Event Flow', 'FAIL', `${baseUrl}/api/v1/events/${ctx.eventId}/cancel`, 'Cancellation did not update the event to the expected cancelled state.', message);
    fs.writeFileSync(REPORT_PATH, sanitizeSummary(), 'utf8');
    return 1;
  }

  try {
    const regression = await fetchJson(`${baseUrl}/api/v1/events/featured?limit=10`);
    const regression2 = await fetchJson(`${baseUrl}/api/v1/events/map?north=23.6&south=21.4&east=80.4&west=78.8&limit=10`);
    const regression3 = await fetchJson(`${baseUrl}/api/v1/auth/me`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${ctx.userToken}` },
    });
    if ([regression.status, regression2.status, regression3.status].some((status) => status >= 500)) {
      throw new Error(`Regression health check failed: featured=${regression.status}; map=${regression2.status}; me=${regression3.status}`);
    }
    recordResult('Regression Checks', 'PASS', `${baseUrl}/api/v1/events/featured`, 'Core community event surfaces and auth checks are still healthy.', `featured=${regression.status}; map=${regression2.status}; authMe=${regression3.status}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    recordResult('Regression Checks', 'FAIL', `${baseUrl}/api/v1/events/featured`, 'One or more community event regression checks returned unexpected errors.', message);
    fs.writeFileSync(REPORT_PATH, sanitizeSummary(), 'utf8');
    return 1;
  }

  const summary = sanitizeSummary();
  fs.writeFileSync(REPORT_PATH, summary, 'utf8');
  appendLog(`Final status: ${summary}`);

  const hasFail = RESULTS.some((entry) => entry.status === 'FAIL');
  const hasBlocked = RESULTS.some((entry) => entry.status === 'BLOCKED');
  if (hasBlocked) return 2;
  if (hasFail) return 1;
  return 0;
  } finally {
    await cleanup(ctx);
  }
}

async function cleanup(ctx: SmokeContext): Promise<void> {
  const failures: string[] = [];
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  if (ctx.reelId && ctx.reelLinkChanged) {
    try {
      const response = await fetchJson(`${ctx.baseUrl}/api/v1/social/reels/${ctx.reelId}`, {
        method: 'PATCH',
        headers: {
          ...auth(ctx.userToken),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ eventId: ctx.originalReelEventId }),
      });
      if (response.status < 200 || response.status >= 300) {
        throw new Error(`Could not restore reel event link: ${response.status}`);
      }
      const verification = await fetchJson(`${ctx.baseUrl}/api/v1/social/reels/${ctx.reelId}`, {
        headers: auth(ctx.userToken),
      });
      const restoredEventId = verification.body?.data?.eventId ?? null;
      if (verification.status !== 200 || restoredEventId !== ctx.originalReelEventId) {
        throw new Error(`Reel event link restore verification failed: status=${verification.status}; eventId=${restoredEventId ?? 'null'}`);
      }
      ctx.reelLinkChanged = false;
    } catch (error) {
      failures.push(`reel-link restore: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (ctx.reportId && !ctx.reportHandled && ctx.adminToken) {
    try {
      const response = await fetchJson(`${ctx.baseUrl}/api/v1/admin/events/reports/${ctx.reportId}/resolve`, {
        method: 'PATCH',
        headers: {
          ...auth(ctx.adminToken),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ resolutionNote: 'Resolved during PalSafar production smoke test cleanup.' }),
      });
      if (response.status < 200 || response.status >= 300) {
        throw new Error(`Could not resolve smoke report: ${response.status}`);
      }
      ctx.reportHandled = true;
    } catch (error) {
      failures.push(`report resolution: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (ctx.eventId && !ctx.eventCancelled && ctx.userToken) {
    try {
      const response = await fetchJson(`${ctx.baseUrl}/api/v1/events/${ctx.eventId}/cancel`, {
        method: 'POST',
        headers: {
          ...auth(ctx.userToken),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reason: 'Smoke test cleanup.' }),
      });
      if (response.status < 200 || response.status >= 300) {
        throw new Error(`Could not cancel smoke event: ${response.status}`);
      }
      const verification = await fetchJson(`${ctx.baseUrl}/api/v1/events/${ctx.eventId}`);
      const status = verification.body?.data?.status ?? verification.body?.status;
      if (verification.status !== 200 || status !== 'CANCELLED') {
        throw new Error(`Smoke event cancellation verification failed: status=${verification.status}; eventStatus=${status ?? 'unknown'}`);
      }
      ctx.eventCancelled = true;
    } catch (error) {
      failures.push(`event cancellation: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (failures.length > 0) {
    cleanupFailed = true;
    recordResult('Cleanup', 'FAIL', 'production smoke artifacts', 'One or more temporary production changes could not be restored or closed.', failures.join('; '));
  } else if (ctx.reelLinkChanged || ctx.eventId || ctx.reportId) {
    recordResult('Cleanup', 'PASS', 'production smoke artifacts', 'Temporary production changes were restored or cancelled.');
  }
}

run().then((exitCode) => {
  if (cleanupFailed && exitCode === 0) exitCode = 1;
  const summary = sanitizeSummary();
  fs.writeFileSync(REPORT_PATH, summary, 'utf8');
  if (exitCode === 0) {
    console.log(`\n${OK} Production Community Events smoke test status: PASS`);
  } else if (exitCode === 2) {
    console.log(`\n${BLOCK} Production Community Events smoke test status: BLOCKED`);
  } else {
    console.log(`\n${FAIL} Production Community Events smoke test status: FAIL`);
  }
  process.exit(exitCode);
}).catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  recordResult('Smoke Test Runner', 'FAIL', 'n/a', 'The production smoke test crashed before completion.', message);
  fs.writeFileSync(REPORT_PATH, sanitizeSummary(), 'utf8');
  console.error(message);
  process.exit(1);
});
