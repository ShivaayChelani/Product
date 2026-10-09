import fs from 'fs';
import path from 'path';
import {
  SUPPORT_EMAIL,
  SUPPORT_EMAIL_TYPO,
  normalizeSupportEmailTypo,
} from '../config/supportEmail';

function read(rel: string): string {
  return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
}

const LEGAL_AND_CONTACT_FILES = [
  'screens/LegalDocumentScreen.tsx',
  'screens/LegalHubScreen.tsx',
  'screens/SettingsScreen.tsx',
  'components/ui/SimpleMarkdown.tsx',
  'components/auth/LegalAcceptanceModal.tsx',
  'services/legalCacheService.ts',
];

describe('PalSafar support email spelling', () => {
  it('uses shivaay.chelani@gmail.com as the canonical support address', () => {
    expect(SUPPORT_EMAIL).toBe('shivaay.chelani@gmail.com');
    expect(SUPPORT_EMAIL_TYPO).toBe('shivaay.chelai@gmail.com');
  });

  it('rewrites the known Community Guidelines typo in displayed text and mailto targets', () => {
    const body =
      'Report issues to shivaay.chelai@gmail.com or mailto:shivaay.chelai@gmail.com.';
    const fixed = normalizeSupportEmailTypo(body);
    expect(fixed).toContain(SUPPORT_EMAIL);
    expect(fixed).toContain(`mailto:${SUPPORT_EMAIL}`);
    expect(fixed).not.toContain(SUPPORT_EMAIL_TYPO);
    expect(normalizeSupportEmailTypo(SUPPORT_EMAIL)).toBe(SUPPORT_EMAIL);
  });

  it('keeps the typo out of legal, help, and contact screens', () => {
    for (const rel of LEGAL_AND_CONTACT_FILES) {
      const src = read(rel);
      expect(src).not.toContain(SUPPORT_EMAIL_TYPO);
    }
    expect(read('screens/SettingsScreen.tsx')).toMatch(/mailto:\$\{SUPPORT_EMAIL\}/);
    expect(read('components/ui/SimpleMarkdown.tsx')).toMatch(/normalizeSupportEmailTypo\(content\)/);
    expect(read('services/legalCacheService.ts')).toMatch(/normalizeSupportEmailTypo\(res\.data\.content\)/);
  });
});
