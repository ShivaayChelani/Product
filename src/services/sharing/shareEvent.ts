import { Alert, Share } from 'react-native';
import { buildEventShareMessage } from './shareLinks';

/**
 * Shares a Community Event via the OS share sheet.
 *
 * Mirrors `shareReelAndRecord`: the message is built first and a null message
 * means "this event cannot be shared" (unapproved status, or an id the URL
 * builder rejects), which the caller surfaces rather than opening an empty
 * sheet. Events have no server-side share counter to increment, so there is no
 * follow-up write.
 */
export async function shareEvent(event: {
  id: string;
  slug?: string | null;
  status?: string | null;
  title?: string | null;
}): Promise<'unavailable' | 'cancelled' | 'shared'> {
  const message = buildEventShareMessage(event);
  if (!message) return 'unavailable';

  try {
    const result = await Share.share({ message, title: event.title?.trim() || 'PalSafar Event' });
    if (result?.action === Share.dismissedAction) return 'cancelled';
    return 'shared';
  } catch {
    Alert.alert('Sharing failed', 'Could not open the share sheet. Please try again.');
    return 'cancelled';
  }
}