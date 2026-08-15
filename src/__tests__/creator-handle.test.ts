import { extractCreatorHandle, formatCreatorHandle } from '../utils/creatorHandle';

describe('creator handle display', () => {
  it('extracts a username from a pasted Instagram URL', () => {
    expect(extractCreatorHandle('https://www.instagram.com/palsafarin')).toBe('palsafarin');
    expect(extractCreatorHandle('httpswwwinstagramcompalsafarin')).toBe('palsafarin');
    expect(extractCreatorHandle('@palsafarin')).toBe('palsafarin');
  });

  it('formats a display handle without a mashed URL', () => {
    expect(formatCreatorHandle('httpswwwinstagramcompalsafarin')).toBe('palsafarin');
    expect(formatCreatorHandle('')).toBe('creator');
  });
});
