import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  applyUserAppSettingsPatch,
  DEFAULT_PRIVACY,
  publicPrivacyMask,
  readPrivacy,
} from '../modules/user-app/user-app.types';

describe('publicPrivacyMask', () => {
  it('never hides content from the owner', () => {
    const mask = publicPrivacyMask(
      { ...DEFAULT_PRIVACY, profileVisibility: 'private', showReels: false },
      true,
    );
    expect(mask).toEqual({
      hideProfile: false,
      hideReels: false,
      hideTrips: false,
      hideReviews: false,
      hideWishlist: false,
    });
  });

  it('hides reels and profile extras when the profile is private', () => {
    const mask = publicPrivacyMask({ ...DEFAULT_PRIVACY, profileVisibility: 'private' }, false);
    expect(mask.hideProfile).toBe(true);
    expect(mask.hideReels).toBe(true);
    expect(mask.hideWishlist).toBe(true);
  });

  it('hides only reels when Show Reels is off', () => {
    const mask = publicPrivacyMask({ ...DEFAULT_PRIVACY, showReels: false }, false);
    expect(mask.hideProfile).toBe(false);
    expect(mask.hideReels).toBe(true);
    expect(mask.hideReviews).toBe(false);
  });

  it('fills missing privacy keys from defaults', () => {
    expect(readPrivacy({ showReels: false }).showReviews).toBe(true);
    expect(readPrivacy(null).profileVisibility).toBe('public');
  });

  it('keeps sibling privacy keys when two patches are applied in order', () => {
    const stored = {
      privacy: DEFAULT_PRIVACY,
      notifications: {},
      security: {},
      appearance: {},
    };
    const afterReels = applyUserAppSettingsPatch(stored, { privacy: { showReels: false } });
    const afterReviews = applyUserAppSettingsPatch(
      { ...stored, privacy: afterReels.privacy },
      { privacy: { showReviews: false } },
    );
    expect(afterReviews.privacy?.showReels).toBe(false);
    expect(afterReviews.privacy?.showReviews).toBe(false);
    expect(afterReviews.privacy?.showWishlist).toBe(true);
    expect(afterReviews.privacy?.showTrips).toBe(true);
  });

  it('hides profile fields without deleting the stored privacy document', () => {
    const patch = applyUserAppSettingsPatch(
      { privacy: DEFAULT_PRIVACY, notifications: {}, security: {}, appearance: {} },
      { privacy: { showReviews: false, showTrips: false, showWishlist: false } },
    );
    expect(patch.privacy).toMatchObject({
      showReviews: false,
      showTrips: false,
      showWishlist: false,
      showReels: true,
    });
    const service = fs.readFileSync(
      path.join(__dirname, '../modules/user-app/user-app.service.ts'),
      'utf8',
    );
    const patchFn = service.slice(service.indexOf('async patchSettings'), service.indexOf('async listBlocks'));
    expect(patchFn).toContain('$transaction');
    expect(patchFn).toContain('FOR UPDATE');
    expect(patchFn).not.toContain('deleteMany');
  });
});
