import fs from 'fs';
import path from 'path';
import {
  DISABLED_BUTTON_BG,
  DISABLED_BUTTON_FG,
  ON_DARK,
  ON_LIGHT,
  darkButtonColors,
  foregroundOnBackground,
  isDarkBackground,
  isReadableOnDark,
  relativeLuminance,
} from '../design/contrast';

function read(rel: string): string {
  return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
}

describe('contrast helper — dark backgrounds get a light foreground', () => {
  it('treats PalSafar black and near-black fills as dark', () => {
    expect(isDarkBackground('#000000')).toBe(true);
    expect(isDarkBackground('#111111')).toBe(true);
    expect(isDarkBackground('#1A1A1A')).toBe(true);
    expect(isDarkBackground('#2A2A2A')).toBe(true);
    expect(isDarkBackground('black')).toBe(true);
  });

  it('keeps cream, white, and light chips as light surfaces', () => {
    expect(isDarkBackground('#FFFFFF')).toBe(false);
    expect(isDarkBackground('#F7F6F2')).toBe(false);
    expect(isDarkBackground('#E8E8ED')).toBe(false);
  });

  it('maps dark fills to white labels and light fills to dark labels', () => {
    expect(foregroundOnBackground('#000000')).toBe(ON_DARK);
    expect(foregroundOnBackground('#111111')).toBe(ON_DARK);
    expect(foregroundOnBackground('#FFFFFF')).toBe(ON_LIGHT);
    expect(isReadableOnDark(ON_DARK)).toBe(true);
    expect(isReadableOnDark('#202020')).toBe(false);
    expect(isReadableOnDark('#111111')).toBe(false);
  });

  it('uses a readable disabled pair instead of black on black', () => {
    const disabled = darkButtonColors(true);
    expect(disabled.background).toBe(DISABLED_BUTTON_BG);
    expect(disabled.foreground).toBe(DISABLED_BUTTON_FG);
    expect(isDarkBackground(disabled.background)).toBe(false);
    expect(relativeLuminance(disabled.foreground)).toBeLessThan(0.4);
    expect(darkButtonColors(false).foreground).toBe(ON_DARK);
  });
});

describe('shared black buttons keep white labels and icons', () => {
  it('StickyActionBar uses a white label and gift/arrow icon on the dark primary fill', () => {
    const bar = read('components/rewards/StickyActionBar.tsx');
    expect(bar).toMatch(/backgroundColor:\s*DARK_BUTTON_BG_ALT/);
    expect(bar).toMatch(/color:\s*ON_DARK/);
    expect(bar).toMatch(/color=\{foreground\}/);
    expect(bar).toMatch(/primaryActionIcon/);
    expect(bar).not.toContain('Save Offer');
    expect(bar).not.toMatch(/heart-outline/);
  });

  it('disabled dark buttons switch to a muted gray pair', () => {
    const bar = read('components/rewards/StickyActionBar.tsx');
    const primary = read('components/auth/PrimaryButton.tsx');
    const gradient = read('components/ui/GradientButton.tsx');
    expect(bar).toContain('DISABLED_BUTTON_BG');
    expect(bar).toContain('DISABLED_BUTTON_FG');
    expect(primary).toContain('DISABLED_BUTTON_BG');
    expect(primary).toContain('textDisabled');
    expect(gradient).toContain('DISABLED_BUTTON_BG');
    expect(gradient).toContain('DISABLED_BUTTON_FG');
  });

  it('does not break outlined or colored GradientButton variants', () => {
    const gradient = read('components/ui/GradientButton.tsx');
    expect(gradient).toMatch(/outline:\s*\{\s*colors:\s*\['transparent',\s*'transparent'\],\s*textColor:\s*'#111111'/);
    expect(gradient).toMatch(/ghost:\s*\{\s*colors:\s*\['transparent',\s*'transparent'\],\s*textColor:\s*'#6B6B6B'/);
    expect(gradient).toMatch(/danger:\s*\{\s*colors:\s*\['#C94A4A',\s*'#FF7B7F'\],\s*textColor:\s*ON_DARK/);
    expect(gradient).toMatch(/isOutline \? Pal\.colors\.light\.primary/);
  });

  it('auth PrimaryButton keeps white text on the black fill', () => {
    const primary = read('components/auth/PrimaryButton.tsx');
    expect(primary).toMatch(/backgroundColor:\s*COLORS\.brown/);
    expect(primary).toMatch(/color:\s*COLORS\.white/);
    expect(primary).toMatch(/iconColor = COLORS\.white/);
  });
});

describe('active tabs keep a contrasting foreground', () => {
  it('wallet, PalPoints, notifications, and vendor chips stay white on black', () => {
    const wallet = read('screens/WalletScreen.tsx');
    const palPoints = read('screens/PalPointsScreen.tsx');
    const tabs = read('features/notifications/components/NotificationFilterTabs.tsx');
    const vendorTabs = read('navigation/VendorTabs.tsx');
    const categoryTabs = read('components/rewards/CategoryTabs.tsx');
    const planUi = read('features/subscriptions/planUi.tsx');

    expect(wallet).toMatch(/mainTabTextActive:\s*\{\s*color:\s*"#FFF"/);
    expect(palPoints).toMatch(/filterTextActive:\s*\{\s*color:\s*'#FFF'/);
    expect(tabs).toMatch(/activeText:\s*'#FFFFFF'/);
    expect(tabs).toMatch(/color=\{active \? COLORS\.activeText : COLORS\.inactiveText\}/);
    expect(vendorTabs).toMatch(/color="#FFFFFF"/);
    expect(categoryTabs).toMatch(/tabTextActive:\s*\{\s*[\s\S]*?color:\s*COLORS\.white/);
    expect(planUi).toMatch(/periodChipTextActive:\s*\{\s*color:\s*'#FFFFFF'/);
  });

  it('Vendor Workspace dark hero pills and subscription CTA stay light on black', () => {
    const dash = read('screens/VendorDashboardScreen.tsx');
    expect(dash).toMatch(/verifiedPillText:\s*\{[\s\S]*?color:\s*'#FFFFFF'/);
    expect(dash).toMatch(/upgradeBannerBtn:\s*\{[\s\S]*?backgroundColor:\s*'#000000'/);
    expect(dash).toMatch(/upgradeBannerBtnText:\s*\{[\s\S]*?color:\s*'#FFFFFF'/);
  });
});
