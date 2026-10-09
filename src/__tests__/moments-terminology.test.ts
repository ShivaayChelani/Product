import fs from 'fs';
import path from 'path';
import { reelEditorActions, resolveReelEditorMode } from '../features/creator/utils/reelEditorMode';
import { buildReelShareMessage, buildReelShareUrl, PALSAFAR_WEB_ORIGIN } from '../services/sharing/shareLinks';

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

describe('PalSafar Moments terminology', () => {
  it('shows Moments on the traveler bottom navigation', () => {
    const nav = read('components/navigation/BottomNavigation.tsx');
    const tabs = read('navigation/MainTabs.tsx');
    expect(nav).toMatch(/renderTab\('reels', 'Moments'/);
    expect(nav).not.toMatch(/renderTab\('reels', 'Reels'/);
    expect(tabs).toMatch(/label: 'Moments'/);
  });

  it('shows Moments on the creator studio tab without renaming the screen route', () => {
    const creatorTabs = read('navigation/CreatorTabs.tsx');
    expect(creatorTabs).toMatch(/label: 'Moments'/);
    expect(creatorTabs).toMatch(/name="Reels"/);
  });

  it('uses Moments copy on create, share, and detail surfaces', () => {
    const actions = reelEditorActions(resolveReelEditorMode({}));
    expect(actions.title).toBe('Create Moment');
    expect(actions.primaryActionLabel).toBe('Post Moment');

    const share = read('services/sharing/shareLinks.ts');
    expect(share).toMatch(/Check out this Moment on PalSafar!/);
    expect(share).not.toMatch(/Check out this reel on PalSafar!/i);
  });

  it('keeps the canonical reel URL contract', () => {
    const id = 'cmumcmr4exampleid01';
    expect(buildReelShareUrl(id)).toBe(`${PALSAFAR_WEB_ORIGIN}/reel/${id}`);
    const message = buildReelShareMessage({
      id,
      status: 'APPROVED',
      description: '',
      title: '',
    });
    expect(message).toContain(`https://palsafar.in/reel/${id}`);
    expect(message).toMatch(/Check out this Moment on PalSafar!/);
    expect(message).not.toMatch(/Check out this reel on PalSafar!/i);
  });

  it('does not leak structured vendor metadata into share text', () => {
    const message = buildReelShareMessage({
      id: 'cmumcmr4exampleid01',
      status: 'APPROVED',
      description: JSON.stringify({
        _isStructuredVendorReel: true,
        caption: 'Sunset at the fort',
        showOnHome: true,
      }),
      title: 'Promo',
    });
    expect(message).toContain('Sunset at the fort');
    expect(message).not.toContain('_isStructuredVendorReel');
    expect(message).not.toContain('showOnHome');
  });
});
