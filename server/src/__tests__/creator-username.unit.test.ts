import { describe, it, expect, vi, beforeEach } from 'vitest';
import { socialService } from '../modules/social/social.service';
import { prisma } from '../config/database';

vi.mock('../config/database', () => ({
  prisma: {
    creatorProfile: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
  },
}));

describe('Creator Username Availability & Normalization (Unit Tests)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('TEST 1: New available username returns available=true', async () => {
    (prisma.creatorProfile.findUnique as any).mockResolvedValue({ id: 'current-profile-id' });
    (prisma.creatorProfile.findFirst as any).mockResolvedValue(null);

    const result = await socialService.checkUsernameAvailability('shivaay99', 'user-123');
    expect(result.available).toBe(true);
  });

  it('TEST 2: Taken username returns available=false and privacy message', async () => {
    (prisma.creatorProfile.findUnique as any).mockResolvedValue({ id: 'current-profile-id' });
    (prisma.creatorProfile.findFirst as any).mockResolvedValue({ id: 'other-profile-id', username: 'shivaay' });

    const result = await socialService.checkUsernameAvailability('shivaay', 'user-123');
    expect(result.available).toBe(false);
    expect(result.message).toBe('This username is not available');
    // Ensure no sensitive profile info is leaked
    expect((result as any).userId).toBeUndefined();
    expect((result as any).email).toBeUndefined();
  });

  it('TEST 3: Current user existing username returns available=true', async () => {
    (prisma.creatorProfile.findUnique as any).mockResolvedValue({ id: 'my-creator-id', username: 'shivaay' });
    (prisma.creatorProfile.findFirst as any).mockResolvedValue(null); // NOT: { id: 'my-creator-id' } filters out current user

    const result = await socialService.checkUsernameAvailability('shivaay', 'user-123');
    expect(result.available).toBe(true);
  });

  it('TEST 4: Case insensitive conflict detection', async () => {
    (prisma.creatorProfile.findUnique as any).mockResolvedValue(null);
    (prisma.creatorProfile.findFirst as any).mockResolvedValue({ id: 'existing-id', username: 'shivaay' });

    const result = await socialService.checkUsernameAvailability('ShIvAaY');
    expect(result.available).toBe(false);
    expect(result.message).toBe('This username is not available');
  });

  it('TEST 5: Whitespace normalization', async () => {
    (prisma.creatorProfile.findUnique as any).mockResolvedValue(null);
    (prisma.creatorProfile.findFirst as any).mockResolvedValue(null);

    const result = await socialService.checkUsernameAvailability('  shivaay  ');
    expect(result.available).toBe(true);
    expect(prisma.creatorProfile.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          username: { equals: 'shivaay', mode: 'insensitive' },
        }),
      })
    );
  });

  it('TEST 6: @ symbol normalization', async () => {
    (prisma.creatorProfile.findUnique as any).mockResolvedValue(null);
    (prisma.creatorProfile.findFirst as any).mockResolvedValue(null);

    const result = await socialService.checkUsernameAvailability('@@@shivaay');
    expect(result.available).toBe(true);
    expect(prisma.creatorProfile.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          username: { equals: 'shivaay', mode: 'insensitive' },
        }),
      })
    );
  });

  it('TEST 7: Invalid username (spaces / special chars)', async () => {
    const r1 = await socialService.checkUsernameAvailability('shivaay user');
    expect(r1.available).toBe(false);
    expect(r1.message).toBe('3–30 characters (letters, numbers, _ or . allowed)');

    const r2 = await socialService.checkUsernameAvailability('shivaay#123');
    expect(r2.available).toBe(false);
  });

  it('TEST 8: Catch Prisma P2002 unique constraint error on updateProfile', async () => {
    (prisma.creatorProfile.findUnique as any).mockResolvedValue({
      id: 'profile-1',
      username: 'old_handle',
      status: 'APPROVED',
    });
    (prisma.creatorProfile.findFirst as any).mockResolvedValue(null);
    (prisma.creatorProfile.update as any).mockRejectedValue({ code: 'P2002' });

    await expect(
      socialService.updateProfile('user-123', { username: 'new_handle' })
    ).rejects.toThrow('Username already used');
  });
});
