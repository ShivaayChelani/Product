import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../config/database', () => ({
  prisma: {
    legalDocument: { findUnique: vi.fn() },
    legalDocumentVersion: { findFirst: vi.fn() },
  },
}));

import { legalService } from '../modules/legal/legal.service';

describe('legalService.getCurrentVersions (no published docs)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws 503 when the Terms document has never been published', async () => {
    const prisma = (await import('../config/database')).prisma as any;
    prisma.legalDocument.findUnique.mockResolvedValue(null);

    await expect(legalService.getCurrentVersions()).rejects.toMatchObject({
      statusCode: 503,
      message: expect.stringMatching(/Terms of Service has not been published/i),
    });
    expect(prisma.legalDocumentVersion.findFirst).not.toHaveBeenCalled();
  });

  it('throws 503 when the Terms document exists but has no published version', async () => {
    const prisma = (await import('../config/database')).prisma as any;
    prisma.legalDocument.findUnique
      .mockResolvedValueOnce({ id: 'terms-doc' })
      .mockResolvedValueOnce({ id: 'privacy-doc' });
    prisma.legalDocumentVersion.findFirst.mockResolvedValue(null);

    await expect(legalService.getCurrentVersions()).rejects.toMatchObject({
      statusCode: 503,
      message: expect.stringMatching(/Terms of Service has not been published/i),
    });
  });

  it('throws 503 when the Privacy Policy document has no published version', async () => {
    const prisma = (await import('../config/database')).prisma as any;
    prisma.legalDocument.findUnique
      .mockResolvedValueOnce({ id: 'terms-doc' })
      .mockResolvedValueOnce({ id: 'privacy-doc' });
    prisma.legalDocumentVersion.findFirst
      .mockResolvedValueOnce({ versionNumber: 1 })
      .mockResolvedValueOnce(null);

    await expect(legalService.getCurrentVersions()).rejects.toMatchObject({
      statusCode: 503,
      message: expect.stringMatching(/Privacy Policy has not been published/i),
    });
  });

  it('returns current versions when both documents are published', async () => {
    const prisma = (await import('../config/database')).prisma as any;
    prisma.legalDocument.findUnique
      .mockResolvedValueOnce({ id: 'terms-doc' })
      .mockResolvedValueOnce({ id: 'privacy-doc' });
    prisma.legalDocumentVersion.findFirst
      .mockResolvedValueOnce({ versionNumber: 2 })
      .mockResolvedValueOnce({ versionNumber: 7 });

    await expect(legalService.getCurrentVersions()).resolves.toEqual({
      termsVersion: 2,
      privacyVersion: 7,
    });
  });
});