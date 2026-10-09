const fs = require('fs');
const path = require('path');

function read(rel: string): string {
  return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
}

describe('Vendor Workspace layout — preserve dashboard spacing fixes', () => {
  const dash = read('screens/VendorDashboardScreen.tsx');

  it('keeps a responsive header that cannot overlap the notification button', () => {
    expect(dash).toMatch(/OvBizName[\s\S]*?numberOfLines=\{1\}/);
    expect(dash).toMatch(/notifications-outline/);
    expect(dash).toMatch(/copyToClipboard\(vendorCode, 'Business Code'\)/);
  });

  it('separates the Upgrade & Grow badge from the heading and keeps the CTA tappable', () => {
    expect(dash).toMatch(/upgradeBannerBadge/);
    expect(dash).toMatch(/UPGRADE & GROW/);
    expect(dash).toMatch(/upgradeBannerTitle/);
    expect(dash).toMatch(/navigate\('VendorSubscription'\)/);
    expect(dash).toMatch(/accessibilityLabel="View subscription plans"/);
  });

  it('pads scroll content for both floating and internal navigation modes', () => {
    expect(dash).toMatch(/contentPadBottom = hideBottomNav/);
    expect(dash).toMatch(/paddingBottom: contentPadBottom/);
    expect(dash).toMatch(/scrollPadBottom=\{contentPadBottom\}/);
    expect(dash).toMatch(/useSafeAreaInsets/);
  });

  it('keeps Today\'s Activity labels wrapping instead of overlapping values', () => {
    expect(dash).toMatch(/activityColLabel[\s\S]*?numberOfLines=\{2\}/);
  });
});
