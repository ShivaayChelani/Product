import fs from 'fs';
import path from 'path';

const dash = fs.readFileSync(
  path.join(__dirname, '../screens/CreatorDashboardScreen.tsx'),
  'utf8',
);
const sidebar = fs.readFileSync(
  path.join(__dirname, '../components/CreatorStudioSidebar.tsx'),
  'utf8',
);
const sub = fs.readFileSync(
  path.join(__dirname, '../screens/CreatorSubscriptionScreen.tsx'),
  'utf8',
);

describe('Creator Studio sidebar wiring', () => {
  it('opens creator subscription checkout and live PalPoints', () => {
    expect(dash).toContain("navigate('CreatorSubscription')");
    expect(dash).toContain('palPoints={palPoints}');
    expect(dash).toContain('applyWalletPalPoints');
    expect(dash).toContain("navigate('PalPointsScreen')");
    expect(dash).not.toContain("navigate('CreatorAnalyticsScreen')");
    expect(dash).not.toContain("navigate('CollaborationDetailScreen'");
  });

  it('wires Subscription and PalPoints in the hamburger menu', () => {
    expect(sidebar).toContain('onNavigateSubscription');
    expect(sidebar).toContain('onNavigateWallet');
    expect(sidebar).toContain('formatCreatorHandle');
    expect(sidebar).toContain('runAfterDrawerClose');
  });

  it('starts Razorpay checkout from the creator plan screen', () => {
    expect(sub).toContain("navigate('RazorpayCheckout'");
    expect(sub).toContain('createRazorpayOrder');
    expect(sub).toContain("listPlans('CREATOR')");
  });

  it('uses the shared forest-green studio palette', () => {
    expect(sub).toContain('CreatorUI');
    expect(sub).toContain('bg: CreatorUI.colors.bg');
    expect(sub).toContain('gold: CreatorUI.colors.primary');
    expect(sub).not.toContain('#B7791F');
  });
});
