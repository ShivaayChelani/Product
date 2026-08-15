import { Share } from 'react-native';

/**
 * Copy text without depending on the deprecated react-native Clipboard export.
 * Prefers @react-native-clipboard/clipboard when installed; otherwise Share sheet.
 */
export async function copyToClipboard(text: string, title = 'Copy'): Promise<boolean> {
  const value = String(text || '');
  if (!value) return false;

  try {
    // Optional dependency — may not be installed
     
    const mod = require('@react-native-clipboard/clipboard');
    const Clipboard = mod?.default ?? mod;
    if (Clipboard && typeof Clipboard.setString === 'function') {
      Clipboard.setString(value);
      return true;
    }
  } catch {
    /* package not installed */
  }

  try {
    await Share.share({ message: value, title });
    return true;
  } catch {
    return false;
  }
}
