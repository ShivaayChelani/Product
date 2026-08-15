import fs from 'fs';
import path from 'path';

describe('Vendor subscription + premium UI', () => {
  const sub = fs.readFileSync(path.join(__dirname, '../screens/VendorSubscriptionScreen.tsx'), 'utf8');
  const preview = fs.readFileSync(path.join(__dirname, '../screens/VendorListingPreviewScreen.tsx'), 'utf8');
  const premium = fs.readFileSync(path.join(__dirname, '../screens/UserPremiumScreen.tsx'), 'utf8');
  const checkout = fs.readFileSync(path.join(__dirname, '../screens/RazorpayCheckoutScreen.tsx'), 'utf8');
  const dash = fs.readFileSync(path.join(__dirname, '../screens/VendorDashboardScreen.tsx'), 'utf8');

  it('shows Starter Growth Unlimited CTAs and usage counters from server entitlements', () => {
    expect(sub).toMatch(/Choose \{plan\.name\}/);
    expect(sub).toMatch(/You're upgrading to/);
    expect(sub).toMatch(/Pay \$\{formatInr/);
    expect(sub).toMatch(/listing\.offersUsed/);
    expect(sub).toMatch(/CURRENT PLAN/);
    expect(sub).toMatch(/vendor-starter/);
    expect(sub).toMatch(/vendor-growth/);
    expect(sub).toMatch(/vendor-unlimited/);
    expect(sub).toMatch(/p\.period === 'MONTHLY'/);
    expect(sub).not.toMatch(/plans\[0\]/);
    expect(sub).not.toMatch(/Silver · Gold · Platinum · Diamond/);
  });

  it('preview never claims the listing is publicly live when inactive', () => {
    expect(preview).toMatch(/Your listing is not live yet/);
    expect(preview).toMatch(/Preview never makes you publicly visible/);
    expect(preview).toMatch(/View Plans/);
  });

  it('premium UI uses server pricing and ad-free copy', () => {
    expect(premium).toMatch(/Ad-free experience/);
    expect(premium).toMatch(/listPlans\('USER_PREMIUM'\)/);
    expect(premium).toMatch(/slug === 'user-premium'/);
    expect(premium).toMatch(/refreshEntitlements/);
    expect(premium).not.toMatch(/₹99/);
    expect(premium).not.toMatch(/plans\[0\]/);
  });

  it('checkout verifies with the server before treating payment as success', () => {
    expect(checkout).toMatch(/verifyRazorpayPayment/);
    expect(checkout).toMatch(/refreshEntitlements/);
    expect(checkout).toMatch(/phase === 'verifying'/);
    expect(checkout).toMatch(/phase === 'failed'/);
    expect(checkout).not.toMatch(/paymentSuccess:\s*true/);
  });

  it('vendor dashboard exposes listing status, plan upgrade path, and listing preview', () => {
    expect(dash).toMatch(/Verification rejected/);
    expect(dash).toMatch(/Awaiting verification/);
    expect(dash).toMatch(/Active Offers/);
    expect(dash).toMatch(/Live now/);
    expect(dash).toMatch(/View listing/);
    expect(dash).toMatch(/Upgrade your plan and get more visibility, offers, reels, analytics and rewards\./);
    expect(dash).toMatch(/View Subscription Plans/);
    expect(dash).toMatch(/navigate\('VendorSubscription'\)/);
    expect(dash).not.toMatch(/reelCount \?\? 2/);
  });
});
