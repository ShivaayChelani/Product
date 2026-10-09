import fs from 'fs';
import path from 'path';

const screen = fs.readFileSync(
  path.join(__dirname, '../screens/VendorOfferDetailScreen.tsx'),
  'utf8',
);
const bar = fs.readFileSync(
  path.join(__dirname, '../components/rewards/StickyActionBar.tsx'),
  'utf8',
);
const modal = fs.readFileSync(
  path.join(__dirname, '../components/VendorCodeRedeemModal.tsx'),
  'utf8',
);

describe('Offer Detail — Save Offer removed', () => {
  it('does not render a Save Offer action or heart control', () => {
    expect(screen).not.toContain('Save Offer');
    expect(screen).not.toContain('onSaveOffer');
    expect(screen).not.toContain('isSaved');
    expect(screen).not.toContain('toggleSavedOfferId');
    expect(screen).not.toContain('loadSavedOfferIds');
    expect(screen).not.toMatch(/heart-outline|name=\{isSaved/);
    expect(bar).not.toContain('Save Offer');
    expect(bar).not.toMatch(/heart/);
  });

  it('keeps Redeem Offer as the full-width bottom action', () => {
    expect(screen).toContain("primaryActionLabel={canRedeem ? 'Redeem Offer'");
    expect(screen).toContain('primaryActionIcon="gift-outline"');
    expect(screen).toContain('onPrimaryAction={onRedeemPress}');
    expect(bar).toMatch(/alignItems:\s*'stretch'/);
    expect(bar).not.toContain('saveBtn');
  });
});

describe('Offer Detail — Redeem Offer contrast and eligibility', () => {
  it('uses a white label and icon on the dark Redeem button', () => {
    expect(bar).toMatch(/color:\s*ON_DARK/);
    expect(bar).toMatch(/color=\{foreground\}/);
    expect(screen).toContain('primaryActionIcon="gift-outline"');
    expect(screen).toMatch(/contactBtnPrimaryText:\s*\{[\s\S]*?color:\s*ON_DARK/);
    expect(screen).toMatch(/offerBadgeText:\s*\{[\s\S]*?color:\s*ON_DARK/);
  });

  it('preserves eligibility checks and the existing redeem click path', () => {
    expect(screen).toContain('const canRedeem = userPoints >= (offer.pointsRequired || 0)');
    expect(screen).toContain("Alert.alert('Sign In Required'");
    expect(screen).toContain("Alert.alert('Insufficient Points'");
    expect(screen).toContain('setRedeemOpen(true)');
    expect(screen).toContain('onRedeemPress');
    expect(screen).toContain('handleRedeemOffer(offerId, vendorCode)');
    expect(screen).not.toMatch(/disabled=\{!canRedeem\}/);
  });

  it('keeps a readable loading state on the confirm sheet', () => {
    expect(modal).toMatch(/submitText:\s*\{[\s\S]*?color:\s*'#FFFFFF'/);
    expect(modal).toContain("ActivityIndicator color=\"#6B6B6B\"");
    expect(modal).toMatch(/submitBtnDisabled:\s*\{[\s\S]*?backgroundColor:\s*'#E8E8ED'/);
  });
});
