import fs from 'fs';
import path from 'path';

describe('Archived reels leave public feeds (server-backed archive)', () => {
  it('creatorApi exposes a real archive endpoint call', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../features/creator/api/creatorApi.ts'),
      'utf8',
    );
    expect(src).toMatch(/setArchived\(id: string, archived: boolean\)/);
    expect(src).toMatch(/\/creator\/reels\/\$\{id\}\/archive/);
  });

  it('CreatorReelsScreen persists archive/unarchive through the API', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../screens/CreatorReelsScreen.tsx'),
      'utf8',
    );
    expect(src).toMatch(/creatorApi\s*\.\s*setArchived|creatorApi\s*\.\s*setArchived/);
    expect(src).toMatch(/setArchived\(id, nextArchived\)/);
    // Server status must also classify the ARCHIVED tab, not only local storage.
    expect(src).toMatch(/status === 'ARCHIVED'\) return 'ARCHIVED'/);
  });
});
