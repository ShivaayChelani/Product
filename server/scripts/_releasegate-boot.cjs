const path = require('path');
const { spawnSync } = require('child_process');
const dotenv = require('dotenv');

const serverRoot = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(serverRoot, '.env.test') });

function ssl(u) {
  if (!u) return u;
  const url = new URL(u);
  url.searchParams.set('sslmode', 'require');
  if (!url.searchParams.has('connection_limit')) url.searchParams.set('connection_limit', '1');
  if (!url.searchParams.has('pool_timeout')) url.searchParams.set('pool_timeout', '20');
  if (!url.searchParams.has('connect_timeout')) url.searchParams.set('connect_timeout', '15');
  url.searchParams.set('keepalives', '1');
  url.searchParams.set('keepalives_idle', '20');
  url.searchParams.set('keepalives_interval', '10');
  return url.toString();
}

const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl) {
  console.error('BOOT: NO TEST_DATABASE_URL in .env.test');
  process.exit(2);
}

const db = ssl(testUrl);
const direct = ssl(process.env.TEST_DIRECT_URL || testUrl);

const env = {
  ...process.env,
  DATABASE_URL: db,
  DIRECT_URL: direct,
  TEST_DATABASE_URL: db,
  TEST_DIRECT_URL: direct,
  NODE_ENV: 'test',
  TS_NODE_FILES: 'true',
};

console.log('BOOT: test env applied (host/db only). Script:', process.argv[2]);

const script = process.argv[2];
const args = process.argv.slice(3);
const r = spawnSync(
  process.execPath,
  ['-r', 'ts-node/register', script, ...args],
  { cwd: serverRoot, env, stdio: 'inherit' },
);
process.exit(r.status ?? 1);