import fs from 'fs';
import path from 'path';
import { unwrapReelRewardPoints, CREATOR_DAILY_REEL_POINTS } from '../utils/reelRewardPoints';

describe('creator daily reel PalPoints (client)', () => {
  it('awards 50 on the first reel of the day', () => {
    expect(CREATOR_DAILY_REEL_POINTS).toBe(50);
  });

  it('reads rewardPoints from createReel and publishDraft envelopes', () => {
    expect(unwrapReelRewardPoints({ data: { id: 'r1', rewardPoints: 50 } })).toBe(50);
    expect(unwrapReelRewardPoints({ id: 'r1', rewardPoints: 50 })).toBe(50);
    expect(unwrapReelRewardPoints({ data: { id: 'r2', rewardPoints: 0 } })).toBe(0);
    expect(unwrapReelRewardPoints(null)).toBe(0);
  });

  it('records every creator reel on the profile, not only the first PalPoints reel', () => {
    const dataContext = fs.readFileSync(
      path.join(__dirname, '../context/DataContext.tsx'),
      'utf8',
    );
    expect(dataContext).toContain("if (job.kind !== 'VENDOR')");
    expect(dataContext).not.toContain("job.kind !== 'VENDOR' && rewardPoints > 0");
    expect(dataContext).toContain('createdReels');
  });
});
