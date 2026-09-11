import fs from 'fs';
import path from 'path';

describe('Map → Vendor “View on Map” flow', () => {
  const read = (rel: string) =>
    fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

  it('Vendor profile navigates to the Map with the vendors layer and the target vendor', () => {
    const profile = read('screens/VendorProfileScreen.tsx');
    const types = read('navigation/types.ts');
    const tabs = read('navigation/MainTabs.tsx');

    expect(profile).toMatch(/initialMapTab:\s*'vendors'/);
    expect(profile).toMatch(/mapTabKey:\s*Date\.now\(\)/);
    expect(profile).toMatch(/selectedVendorId:\s*vendor\.id/);
    expect(profile).not.toMatch(/mapTab:\s*'vendors'/);

    expect(types).toMatch(/selectedVendorId\?: string/);
    expect(tabs).toMatch(/selectedVendorId=\{selectedVendorId\}/);
  });

  it('MapScreen consumes selectedVendorId and auto-opens the vendor card', () => {
    const map = read('screens/MapScreen.tsx');

    expect(map).toMatch(/selectedVendorId\?: string/);
    expect(map).toMatch(/lastOpenedVendorKeyRef/);
    expect(map).toMatch(/allVendors\.find\(m => m\.id === selectedVendorId\)/);
    expect(map).toMatch(/handleMapTabChange\('vendors'\)/);
    expect(map).toMatch(/flyTo/);
  });

  it('Map clears review-pick mode once the user starts writing a review', () => {
    const map = read('screens/MapScreen.tsx');

    expect(map).toMatch(/navigation\.setParams\(\{\s*reviewMode:\s*false\s*\}\)/);
  });

  it('session restore never resurrects a stale card over a routed vendor target', () => {
    const map = read('screens/MapScreen.tsx');

    expect(map).toMatch(/\&\& !selectedVendorId/);
  });
});