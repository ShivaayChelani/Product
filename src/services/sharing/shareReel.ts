import { Platform, Share } from 'react-native';
import { incrementReelShares } from '../reelService';
import { buildReelShareMessage } from './shareLinks';
import { shouldRecordReelShare } from './shareReelDecision';

export async function shareReelAndRecord(reel: {
  id: string;
  status?: string | null;
  title?: string | null;
  description?: string | null;
}): Promise<'unavailable' | 'cancelled' | 'shared'> {
  const message = buildReelShareMessage(reel);
  if (!message) return 'unavailable';

  let threw = false;
  let action: string | null = null;
  try {
    const result = await Share.share({ message, title: 'PalSafar Reel' });
    action = result?.action ?? null;
  } catch {
    threw = true;
  }

  if (!shouldRecordReelShare({ platform: Platform.OS, threw, action })) {
    return 'cancelled';
  }

  try {
    await incrementReelShares(reel.id);
  } catch {
    /* Studio reads the server column; a failed PATCH is retried on the next share. */
  }
  return 'shared';
}
