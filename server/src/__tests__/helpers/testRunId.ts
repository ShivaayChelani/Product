import { randomUUID } from 'crypto';

/** Unique suffix per test worker/run so parallel files never collide on slug. */
export const testRunId =
  process.env.VITEST_POOL_ID != null
    ? `${process.env.VITEST_POOL_ID}-${randomUUID().slice(0, 8)}`
    : randomUUID().slice(0, 8);

export function testSlug(base: string): string {
  return `${base}-${testRunId}`
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120);
}
