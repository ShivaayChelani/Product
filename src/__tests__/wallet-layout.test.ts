import fs from 'fs';
import path from 'path';

describe('wallet summary and transaction layout', () => {
  it('keeps the balance number and PalPoints unit together beside a smaller coin', () => {
    const screen = fs.readFileSync(path.join(__dirname, '../screens/WalletScreen.tsx'), 'utf8');

    expect(screen).toMatch(/balanceAmountRow/);
    expect(screen).toMatch(/numberOfLines=\{1\}\s+adjustsFontSizeToFit/);
    expect(screen).toMatch(/width: 50,\s+height: 50/);
    expect(screen).toMatch(/PalPoints Balance/);
  });

  it('lays out four summary values in a readable two-column grid and keeps signed history amounts', () => {
    const screen = fs.readFileSync(path.join(__dirname, '../screens/WalletScreen.tsx'), 'utf8');

    expect(screen).toMatch(/summaryCard:\s*\{[\s\S]*?flexWrap:\s*"wrap"/);
    expect(screen).toMatch(/summaryCol:\s*\{[\s\S]*?width:\s*"50%"/);
    expect(screen).toMatch(/txAmountRender/);
    expect(screen).toMatch(/amount\.prefix/);
    expect(screen).toMatch(/toLocaleString\(undefined,\s*\{/);
  });

  it('keeps Daily Login extra content under the title column and disables a second claim', () => {
    const screen = fs.readFileSync(path.join(__dirname, '../screens/WalletScreen.tsx'), 'utf8');

    expect(screen).toMatch(/earnCardMain:\s*\{[\s\S]*?flexDirection:\s*"row"/);
    expect(screen).toMatch(/<Text style=\{styles\.earnSubtitle\}>\{subtitle\}<\/Text>\s*\{extraContent\}/);
    expect(screen).toMatch(/dailyStatus\?\.claimedToday\s*\?\s*"Claimed"/);
    expect(screen).toMatch(/dailyStatus\?\.claimedToday\s*\?\s*undefined/);
    expect(screen).toMatch(/earnBtnDisabled/);
    expect(screen).toMatch(/Claimed today/);
  });
});
