import {
  txRender,
  txAmountRender,
  txCategory,
  entityFromReason,
  PALPOINTS_CATEGORY_STYLES,
} from '../utils/palPointsTransactions';

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

describe('palPointsTransactions — friendly labels replace raw internals', () => {
  it('maps daily_login to a friendly login label', () => {
    const meta = txRender({
      type: 'EARN',
      amount: 5,
      reason: 'daily_login',
      referenceType: 'LOGIN_REWARD',
    });
    expect(meta.label).toBe('Daily Login Reward');
    expect(meta.kind).toBe('earned');
    expect(meta.description).toBe('Daily Login');
    expect(meta.color).toBe('#F57C00');
  });

  it('maps daily_open to a friendly open label', () => {
    const meta = txRender({
      type: 'EARN',
      amount: 2,
      reason: 'daily_open',
      referenceType: null,
    });
    expect(meta.label).toBe('Daily Open Reward');
    expect(meta.color).toBe('#E64A19');
  });

  it('maps review_write / VENDOR_REVIEW to a friendly review label', () => {
    const meta = txRender({
      type: 'EARN',
      amount: 10,
      reason: 'review_write',
      referenceType: 'VENDOR_REVIEW',
    });
    expect(meta.label).toBe('Vendor Review');
    expect(meta.color).toBe('#F59E0B');
  });

  it('maps hidden gem, photo and reel earns to their accents', () => {
    expect(txRender({ type: 'EARN', amount: 50, reason: 'hidden_gem', referenceType: null })).toMatchObject({
      label: 'Hidden Gem',
      color: '#8B5CF6',
    });
    expect(txRender({ type: 'EARN', amount: 5, reason: 'place_image_approved', referenceType: null })).toMatchObject({
      label: 'Place Photo Approved',
      color: '#7B1FA2',
    });
    expect(txRender({ type: 'EARN', amount: 50, reason: 'reel_upload', referenceType: null })).toMatchObject({
      label: 'Creator Moment',
      color: '#D81B60',
    });
  });

  it('never leaks raw snake_case / SCREAMING_CASE enums into labels or descriptions', () => {
    const samples = [
      { type: 'EARN', amount: 10, reason: 'review_write', referenceType: 'VENDOR_REVIEW' },
      { type: 'EARN', amount: 5, reason: 'daily_login', referenceType: 'LOGIN_REWARD' },
      { type: 'EARN', amount: 2, reason: 'daily_open', referenceType: null },
      { type: 'EARN', amount: 10, reason: 'game_complete', referenceType: 'GAME' },
    ];
    for (const tx of samples) {
      const meta = txRender(tx);
      expect(meta.label).not.toMatch(/_/);
      expect(meta.label).not.toMatch(/[A-Z]{3,}/);
      expect(meta.description).not.toMatch(/_/);
      expect(meta.description).not.toMatch(/[A-Z]{3,}/);
    }
  });

  it('labels offer redemption spends and reads the offer title as description', () => {
    const meta = txRender({
      type: 'SPEND',
      amount: -200,
      reason: 'redeem:Flat 20% Off Filter Coffee',
      referenceType: 'OFFER',
    });
    expect(meta.label).toBe('Offer Redemption');
    expect(meta.description).toBe('Flat 20% Off Filter Coffee');
    expect(meta.kind).toBe('redeemed');
  });

  it('labels partner redemptions', () => {
    const meta = txRender({
      type: 'SPEND',
      amount: -100,
      reason: 'partner_redeem:City Museum Pass',
      referenceType: 'PAL_POINTS_PARTNER',
    });
    expect(meta.label).toBe('Partner Offer Redemption');
    expect(meta.description).toBe('City Museum Pass');
    expect(meta.kind).toBe('redeemed');
  });

  it('treats an EARN with OFFER reference (vendor credit) as an earned offer credit', () => {
    const meta = txRender({
      type: 'EARN',
      amount: 200,
      reason: 'offer_redeem:Flat 20% Off Filter Coffee',
      referenceType: 'OFFER',
    });
    expect(meta.label).toBe('Offer Redemption Credit');
    expect(meta.kind).toBe('earned');
  });

  it('labels point transfers with the counterparty as description', () => {
    const sent = txRender({ type: 'SPEND', amount: -75, reason: 'Sent to Alex', referenceType: 'POINTS_TRANSFER' });
    expect(sent.label).toBe('Points Sent');
    expect(sent.description).toBe('Alex');
    const received = txRender({
      type: 'EARN',
      amount: 75,
      reason: 'Received from Alex',
      referenceType: 'POINTS_TRANSFER',
    });
    expect(received.label).toBe('Points Received');
    expect(received.description).toBe('Alex');
  });

  it('distinguishes refunds from refund reversals and signs them correctly', () => {
    const refund = txRender({ type: 'EARN', amount: 200, reason: 'refund:Flat 20% Off', referenceType: 'REFUND' });
    expect(refund.label).toBe('Refund');
    expect(refund.kind).toBe('refund');
    expect(txAmountRender({ amount: 200 })).toMatchObject({ prefix: '+', value: '200', isPositive: true });

    const reversal = txRender({
      type: 'SPEND',
      amount: -200,
      reason: 'refund_clawback:Flat 20% Off',
      referenceType: 'REFUND',
    });
    expect(reversal.label).toBe('Refund Reversal');
    expect(reversal.kind).toBe('redeemed');
    expect(txAmountRender({ amount: -200 })).toMatchObject({ prefix: '−', value: '200', isPositive: false });
  });

  it('classifies spend/redeem and admin adjustments', () => {
    expect(txCategory({ type: 'SPEND', amount: -10, reason: 'redeem:Coffee', referenceType: 'OFFER' })).toBe('spend');
    expect(txCategory({ type: 'EARN', amount: 10, reason: 'admin_adjustment', referenceType: 'ADMIN_ADJUSTMENT' })).toBe(
      'admin',
    );
  });

  it('extracts entity names only from known reason prefixes', () => {
    expect(entityFromReason('redeem:Latte')).toBe('Latte');
    expect(entityFromReason('Sent to Priya')).toBe('Priya');
    expect(entityFromReason('daily_login')).toBeNull();
  });

  it('keeps every category non-green and provides both icon glyph sets', () => {
    for (const style of Object.values(PALPOINTS_CATEGORY_STYLES)) {
      expect(GREEN_HEXES.map((h) => h.toUpperCase())).not.toContain(style.color.toUpperCase());
      expect(GREEN_HEXES.map((h) => h.toUpperCase())).not.toContain(style.bg.toUpperCase());
      expect(style.icon.length).toBeGreaterThan(0);
      expect(style.ionIcon.length).toBeGreaterThan(0);
    }
  });

  it('uses the same colored MCI glyphs as the Wallet earn cards for review, gem, reel, and login', () => {
    expect(PALPOINTS_CATEGORY_STYLES.reel).toMatchObject({
      icon: 'movie-open-outline',
      color: '#D81B60',
      bg: '#FCE4EC',
    });
    expect(PALPOINTS_CATEGORY_STYLES.hiddenGem).toMatchObject({
      icon: 'diamond-stone',
      color: '#8B5CF6',
      bg: '#F5F3FF',
    });
    expect(PALPOINTS_CATEGORY_STYLES.review).toMatchObject({
      icon: 'star-outline',
      color: '#F59E0B',
      bg: '#FFFBEB',
    });
    expect(PALPOINTS_CATEGORY_STYLES.dailyLogin).toMatchObject({
      icon: 'calendar-check',
      color: '#F57C00',
      bg: '#FFF3E0',
    });
  });
});
