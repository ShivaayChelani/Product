import {
  attemptDailyOpenReward,
  shouldAttemptDailyOpenReward,
  markDailyOpenRewardAttempted,
  claimDailyOpenRewardForUser,
} from '../services/dailyOpenReward';
import { walletApi } from '../services/api/wallet';
import { applyWalletPalPoints } from '../utils/syncPalPoints';

jest.mock('../services/api/wallet', () => ({
  walletApi: {
    claimDailyOpen: jest.fn(),
  },
}));

jest.mock('../utils/syncPalPoints', () => ({
  applyWalletPalPoints: jest.fn(async () => 5),
}));

describe('daily open reward (mobile)', () => {
  const setUser = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    markDailyOpenRewardAttempted(0);
  });

  it('only fires once per foreground transition (debounce gate)', () => {
    markDailyOpenRewardAttempted(0);
    expect(shouldAttemptDailyOpenReward(2000)).toBe(true);
    markDailyOpenRewardAttempted(2000);
    expect(shouldAttemptDailyOpenReward(2000)).toBe(false);
    expect(shouldAttemptDailyOpenReward(3999)).toBe(false);
    expect(shouldAttemptDailyOpenReward(4000)).toBe(true);
  });

  it('calls the signed wallet claim endpoint on app-open attempts', async () => {
    (walletApi.claimDailyOpen as jest.Mock).mockResolvedValue({
      awarded: true,
      alreadyClaimed: false,
      points: 5,
      rewardDate: '2026-09-13',
    });

    const result = await claimDailyOpenRewardForUser();

    expect(walletApi.claimDailyOpen).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ awarded: true, points: 5 });
  });

  it('refreshes the wallet balance only when the server actually awards', async () => {
    (walletApi.claimDailyOpen as jest.Mock).mockResolvedValue({
      awarded: true,
      alreadyClaimed: false,
      points: 5,
      rewardDate: '2026-09-13',
    });

    const result = await attemptDailyOpenReward(setUser);

    expect(result?.awarded).toBe(true);
    expect(applyWalletPalPoints).toHaveBeenCalledTimes(1);
  });

  it('does not touch the balance when the claim is a repeated same-day open', async () => {
    (walletApi.claimDailyOpen as jest.Mock).mockResolvedValue({
      awarded: false,
      alreadyClaimed: true,
      points: 0,
      rewardDate: '2026-09-13',
    });

    const result = await attemptDailyOpenReward(setUser);

    expect(result?.alreadyClaimed).toBe(true);
    expect(applyWalletPalPoints).not.toHaveBeenCalled();
  });

  it('swallows network errors so app-open never crashes on a reward', async () => {
    (walletApi.claimDailyOpen as jest.Mock).mockRejectedValue(new Error('offline'));

    const result = await attemptDailyOpenReward(setUser);

    expect(result).toBeNull();
    expect(applyWalletPalPoints).not.toHaveBeenCalled();
  });
});