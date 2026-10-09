import {
  extractCreatorHandle,
  formatCreatorHandle,
  creatorAtHandle,
  isValidPalSafarUsername,
} from '../utils/creatorHandle';

describe('creator handle display', () => {
  it('never derives a handle from a pasted Instagram URL', () => {
    expect(extractCreatorHandle('https://www.instagram.com/palsafarin')).toBeNull();
    expect(extractCreatorHandle('httpswwwinstagramcompalsafarin')).toBeNull();
    expect(extractCreatorHandle('https://instagram.com/palsafarin')).toBeNull();
  });

  it('returns a genuine PalSafar username with the leading @ stripped', () => {
    expect(extractCreatorHandle('@palsafarin')).toBe('palsafarin');
    expect(extractCreatorHandle('RahulChelani')).toBe('rahulchelani');
    expect(extractCreatorHandle('rahul.travels_99')).toBe('rahul.travels_99');
  });

  it('validates only genuine PalSafar usernames', () => {
    expect(isValidPalSafarUsername('palsafarin')).toBe(true);
    expect(isValidPalSafarUsername('httpswwwinstagramcompalsafarin')).toBe(false);
    expect(isValidPalSafarUsername('https://instagram.com/palsafarin')).toBe(false);
    expect(isValidPalSafarUsername('')).toBe(false);
    expect(isValidPalSafarUsername('ab')).toBe(false);
  });

  it('falls back instead of rendering a mashed URL', () => {
    expect(formatCreatorHandle('httpswwwinstagramcompalsafarin')).toBe('creator');
    expect(formatCreatorHandle('')).toBe('creator');
    expect(formatCreatorHandle('palsafarin')).toBe('palsafarin');
    expect(creatorAtHandle('httpswwwinstagramcompalsafarin')).toBe('Creator');
    expect(creatorAtHandle('palsafarin')).toBe('@palsafarin');
    expect(creatorAtHandle(null, '@creator')).toBe('@creator');
  });
});
