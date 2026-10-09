import fs from 'fs';
import path from 'path';
import { extractCreatorHandle, creatorAtHandle } from '../utils/creatorHandle';
import { buildCreatorShareUrl } from '../services/sharing/shareLinks';

function read(rel: string): string {
  return fs.readFileSync(path.join(__dirname, rel), 'utf8');
}

describe('Instagram removed from user-facing surfaces', () => {
  it('never renders a malformed Instagram-derived value as a creator handle', () => {
    const malformed = 'httpswwwinstagramcompalsafarin';
    expect(extractCreatorHandle(malformed)).toBeNull();
    expect(creatorAtHandle(malformed)).toBe('Creator');
  });

  it('renders the genuine PalSafar username instead', () => {
    expect(creatorAtHandle('palsafarin')).toBe('@palsafarin');
  });

  it('hides the handle line when no genuine username exists', () => {
    expect(creatorAtHandle(undefined, '')).toBe('');
    expect(creatorAtHandle('https://instagram.com/someone', '')).toBe('');
  });

  it('has no Instagram UI in the creator profile screen and reel cards', () => {
    const view = read('../features/travelSocial/screens/ViewCreatorProfileScreen.tsx');
    expect(view).not.toMatch(/instagram/i);
    expect(view).not.toMatch(/logo-instagram/);
    const reelCard = read('../components/reels/ReelCard.tsx');
    expect(reelCard).not.toMatch(/instagram/i);
  });

  it('has no Instagram field, label or icon in creator registration or studio profile', () => {
    const become = read('../screens/BecomeCreatorScreen.tsx');
    expect(become).not.toMatch(/Instagram Handle/);
    expect(become).not.toMatch(/logo-instagram/);
    expect(become).not.toMatch(/instagram\.com/);
    const studio = read('../screens/CreatorStudioProfileScreen.tsx');
    expect(studio).not.toMatch(/Instagram URL/);
    expect(studio).not.toMatch(/logo-instagram/);
    expect(studio).not.toMatch(/instagram\.com/);
  });

  it('keeps creator and reel navigation wired', () => {
    const nav = read('../navigation/RootNavigator.tsx');
    expect(nav).toContain('CreatorProfile');
    expect(nav).toContain('ReelDetail');
  });

  it('never mints a share URL from a URL-like username', () => {
    expect(buildCreatorShareUrl({ username: 'httpswwwinstagramcompalsafarin' })).toBeNull();
    expect(buildCreatorShareUrl({ username: 'https://instagram.com/palsafarin' })).toBeNull();
    expect(buildCreatorShareUrl({ username: 'palsafarin' })).toBe('https://palsafar.in/creator/palsafarin');
  });
});
