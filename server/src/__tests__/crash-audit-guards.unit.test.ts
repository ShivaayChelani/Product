import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

function readSrc(rel: string) {
  return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
}

describe('crash-audit follow-up guards', () => {
  it('treasure hunt answers use a dedicated per-user limiter', () => {
    const routes = readSrc('modules/riddles/riddles.routes.ts');
    expect(routes).toMatch(/huntAnswerLimiter/);
    const limiter = readSrc('config/rateLimit.ts');
    expect(limiter).toMatch(/export const huntAnswerLimiter/);
    expect(limiter).toMatch(/hunt-answer:/);
  });

  it('AI user-vector access uses ADMIN_ROLES rather than a single ADMIN permission', () => {
    const src = readSrc('modules/ai/ai.controller.ts');
    expect(src).toMatch(/ADMIN_ROLES/);
    expect(src).toMatch(/hasRole/);
    expect(src).not.toMatch(/permission !== 'ADMIN'/);
  });

  it('reorderStops rejects stop IDs that do not belong to the day', () => {
    const src = readSrc('modules/trips/trips.service.ts');
    const fn = src.slice(src.indexOf('async reorderStops'), src.indexOf('async generateItinerary'));
    expect(fn).toMatch(/tripPlanDayId: dayId/);
    expect(fn).toMatch(/Invalid stop order/);
    expect(fn).toMatch(/must not contain duplicates/);
  });
});
