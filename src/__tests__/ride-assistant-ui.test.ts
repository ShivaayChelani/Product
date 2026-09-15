import fs from 'fs';
import path from 'path';

describe('Ride Assistant UI', () => {
  const sheet = fs.readFileSync(
    path.join(__dirname, '../features/rideOptions/components/RideBottomSheet.tsx'),
    'utf8',
  );

  it('does not render a Refresh / Share / Copy browser-style footer', () => {
    expect(sheet).not.toMatch(/FooterAction/);
    expect(sheet).not.toMatch(/label="Refresh"/);
    expect(sheet).not.toMatch(/label="Share"/);
    expect(sheet).not.toMatch(/label="Copy"/);
    expect(sheet).not.toMatch(/Share\.share/);
    expect(sheet).not.toMatch(/styles\.footer/);
  });

  it('scrolls the full provider list in a single vertical ScrollView', () => {
    expect(sheet).toMatch(/<ScrollView/);
    expect(sheet).toMatch(/Available providers/);
    expect(sheet).toMatch(/flexShrink: 1/);
    expect(sheet).not.toMatch(/maxHeight:\s*380/);
    expect(sheet).not.toMatch(/WebView/);
  });
});
