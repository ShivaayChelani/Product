const fs = require('fs');
const path = require('path');

function read(rel: string): string {
  return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
}

const GREEN_HEXES = [
  '#4CAF50',
  '#388E3C',
  '#43A047',
  '#2E7D55',
  '#1F4D3A',
  '#16392B',
  '#10B981',
  '#81C784',
  '#E8F5E9',
  '#1B5E20',
  '#2ECC71',
  '#00B894',
];

function expectNoGreen(src: string) {
  for (const hex of GREEN_HEXES) {
    expect(src.toUpperCase()).not.toContain(hex.toUpperCase());
  }
}

describe('Issue 1 — PalPoints category icons keep their original non-green colors', () => {
  const wallet = read('screens/WalletScreen.tsx');
  const howItWorks = read('screens/HowItWorksScreen.tsx');
  const palPoints = read('screens/PalPointsScreen.tsx');

  it('earn tasks: Ads, photo, itinerary and daily-login stay blue/purple/orange', () => {
    expect(wallet).toMatch(/"#1976D2",\s*"#E3F2FD"/);
    expect(wallet).toMatch(/"#7B1FA2",\s*"#F3E5F5"/);
    expect(wallet).toMatch(/"#E64A19",\s*"#FBE9E7"/);
    expect(wallet).toMatch(/"#F57C00",\s*"#FFF3E0"/);
  });

  it('earn tasks keep distinct non-green accents (reel, gem, review are colourful, not monochrome)', () => {
    expect(wallet).toMatch(/"movie-open-outline",\s*"#D81B60",\s*"#FCE4EC"/);
    expect(wallet).toMatch(/"diamond-stone",\s*"#8B5CF6",\s*"#F5F3FF"/);
    expect(wallet).toMatch(/"star-outline",\s*"#F59E0B",\s*"#FFFBEB"/);
    expectNoGreen(wallet);
  });

  it('never uses missing MaterialCommunityIcons glyphs in Wallet earn/history icons', () => {
    expect(wallet).not.toMatch(/videocam-outline/);
    expect(wallet).not.toMatch(/name="videocam-outline"/);
  });

  it('Point Summary restores amber balance and blue month tiles, keeps red spend', () => {
    expect(wallet).toMatch(/summaryIcon,[^{]*\{ backgroundColor: '#FFF3E0' \}\][\s\S]{0,120}color="#FF9800"/);
    expect(wallet).toMatch(/summaryIcon,[^{]*\{ backgroundColor: '#E3F2FD' \}\][\s\S]{0,120}color="#2196F3"/);
    expect(wallet).toMatch(/summaryVal, \{ color: '#2196F3' \}/);
    expect(wallet).toMatch(/summaryVal, \{ color: '#C94A4A' \}/);
  });

  it('How It Works earn categories restore blue, purple and amber icons', () => {
    expect(howItWorks).toMatch(/iconColor: '#3B82F6', iconBg: '#EFF6FF'/);
    expect(howItWorks).toMatch(/iconColor: '#8B5CF6', iconBg: '#F5F3FF'/);
    expect(howItWorks).toMatch(/iconColor: '#F59E0B', iconBg: '#FFFBEB'/);
    expect(howItWorks).toMatch(/pointsColor: '#3B82F6'/);
    expect(howItWorks).toMatch(/pointsColor: '#8B5CF6'/);
    expect(howItWorks).toMatch(/pointsColor: '#F59E0B'/);
  });

  it('How It Works redeem steps restore blue/indigo/amber nodes and keep green/red neutral', () => {
    expect(howItWorks).toMatch(/icon: 'storefront', iconBg: '#3B82F6'/);
    expect(howItWorks).toMatch(/icon: 'cellphone', iconBg: '#1E3A8A'/);
    expect(howItWorks).toMatch(/icon: 'wallet', iconBg: '#F59E0B'/);
    expect(howItWorks).toMatch(/icon: 'gift', iconBg: '#111111'/);
    expect(howItWorks).toMatch(/icon: 'tag', iconBg: '#C94A4A'/);
    expectNoGreen(howItWorks);
    expectNoGreen(palPoints);
  });

  it('PalPoints screen transaction history uses category-colored MaterialCommunityIcons glyphs', () => {
    expect(palPoints).toMatch(/filterChipActive:\s*\{\s*backgroundColor: C\.deep/);
    expect(palPoints).toMatch(/MaterialCommunityIcons name=\{meta\.icon/);
    expect(palPoints).toMatch(/backgroundColor: meta\.bg/);
    expect(palPoints).toMatch(/color=\{meta\.color\}/);
    expect(palPoints).not.toMatch(/Icon name=\{meta\.ionIcon\}/);
  });
});

describe('Issue 2 — active controls with a black background use white foreground', () => {
  const wallet = read('screens/WalletScreen.tsx');
  const palPoints = read('screens/PalPointsScreen.tsx');
  const creatorReels = read('screens/CreatorReelsScreen.tsx');
  const vendorProfile = read('screens/VendorProfileScreen.tsx');
  const vendorOffers = read('screens/VendorOffersScreen.tsx');

  it('Wallet history sub-tabs render white text when active', () => {
    expect(wallet).toMatch(/subTabActive:\s*\{\s*backgroundColor: "#000000"/);
    expect(wallet).toMatch(/subTabTextActive:\s*\{\s*color: "#FFF"/);
    expect(wallet).not.toMatch(/historySubTab === "earned" && \{ color:/);
    expect(wallet).not.toMatch(/historySubTab === "redeemed" && \{ color:/);
  });

  it('Wallet main tabs and category pills keep white active foregrounds', () => {
    expect(wallet).toMatch(/mainTabActive:\s*\{\s*backgroundColor: "#000000"/);
    expect(wallet).toMatch(/mainTabTextActive:\s*\{\s*color: "#FFF"/);
    expect(wallet).toMatch(/isActive \? "#FFF" : "#000000"/);
    expect(wallet).toMatch(/activeTab === "history" \? "#FFF" : "#000000"/);
  });

  it('PalPoints filter chips and creator/vendor tabs stay white on black', () => {
    expect(palPoints).toMatch(/filterTextActive:\s*\{\s*color: '#FFF'/);
    expect(creatorReels).toMatch(/tabChipTextActive:\s*\{\s*color: '#FFF'/);
    expect(vendorProfile).toMatch(/segmentTextActive:\s*\{\s*color: '#FFFFFF'/);
    expect(vendorProfile).toMatch(/segmentBtnActive:\s*\{\s*backgroundColor: Pal\.colors\.light\.primary/);
  });

  it('Vendor offers filter chip active label is white on the dark active chip', () => {
    expect(vendorOffers).toMatch(/filterChipActive:\s*\{[\s\S]*?backgroundColor: colors\.primaryDark/);
    expect(vendorOffers).toMatch(/filterLabelActive:\s*\{\s*color: '#FFFFFF'/);
    expect(vendorOffers).not.toMatch(/filterLabelActive:\s*\{\s*color: colors\.primaryLight/);
  });
});
