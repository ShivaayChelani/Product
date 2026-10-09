import fs from 'fs';
import path from 'path';

function read(rel: string): string {
  return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
}

describe('Vendor reel archive is server-backed, not device-local', () => {
  it('vendors API exposes a real archive endpoint and typed archivedAt', () => {
    const endpoints = read('config/api.ts');
    expect(endpoints).toMatch(/archiveReel:\s*\(reelId: string\)\s*=>\s*`\/vendors\/reels\/\$\{reelId\}\/archive`/);

    const api = read('services/api/vendors.ts');
    expect(api).toMatch(/setVendorReelArchived\(reelId: string, archived: boolean\)/);
    expect(api).toMatch(/archivedAt: string \| null/);
  });

  it('VendorReelsManagementScreen reads/writes archive state through the API', () => {
    const src = read('screens/VendorReelsManagementScreen.tsx');
    expect(src).toMatch(/vendorsApi\.setVendorReelArchived\(/);
    expect(src).toMatch(/archivedAt/);
  });

  it('no longer treats AsyncStorage as the source of truth for archive state', () => {
    const src = read('screens/VendorReelsManagementScreen.tsx');
    expect(src).not.toMatch(/AsyncStorage/);
    expect(src).not.toMatch(/vendor_reels_archived_/);
    expect(src).not.toMatch(/archivedIds/);
  });
});
