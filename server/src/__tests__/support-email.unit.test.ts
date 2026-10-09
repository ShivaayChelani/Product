import { describe, expect, it } from 'vitest';
import {
  SUPPORT_EMAIL,
  SUPPORT_EMAIL_TYPO,
  normalizeSupportEmailTypo,
} from '../shared/utils/supportEmail';
import fs from 'fs';
import path from 'path';

describe('support email typo normalization', () => {
  it('canonicalizes the Community Guidelines misspelling without touching other addresses', () => {
    expect(SUPPORT_EMAIL).toBe('shivaay.chelani@gmail.com');
    const src = `Contact: ${SUPPORT_EMAIL_TYPO} / admin@palsafar.com`;
    expect(normalizeSupportEmailTypo(src)).toBe(`Contact: ${SUPPORT_EMAIL} / admin@palsafar.com`);
  });

  it('public legal and settings defaults no longer ship the typo', () => {
    const legal = fs.readFileSync(path.join(__dirname, '../modules/legal/legal.service.ts'), 'utf8');
    const settings = fs.readFileSync(path.join(__dirname, '../modules/settings/settings.service.ts'), 'utf8');
    const app = fs.readFileSync(path.join(__dirname, '../modules/app/app.service.ts'), 'utf8');
    expect(legal).toMatch(/normalizeSupportEmailTypo\(version\.content\)/);
    expect(settings).toMatch(/value:\s*SUPPORT_EMAIL/);
    expect(app).toMatch(/parseSetting\(settings, 'support_email', SUPPORT_EMAIL\)/);
    expect(legal).not.toContain(SUPPORT_EMAIL_TYPO);
    expect(settings).not.toContain(SUPPORT_EMAIL_TYPO);
    expect(app).not.toContain(SUPPORT_EMAIL_TYPO);
  });
});
