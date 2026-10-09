/**
 * Foreground contrast for PalSafar's near-black primary surfaces.
 * Dark button/tab backgrounds must never keep the default body text color.
 */

export const ON_DARK = '#FFFFFF';
export const ON_LIGHT = '#111111';
export const DARK_BUTTON_BG = '#000000';
export const DARK_BUTTON_BG_ALT = '#111111';
export const DISABLED_BUTTON_BG = '#E8E8ED';
export const DISABLED_BUTTON_FG = '#6B6B6B';

const DARK_LUMINANCE_MAX = 0.4;

function expandShortHex(hex: string): string {
  if (hex.length !== 3) return hex;
  return hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
}

export function parseCssColor(input: string): { r: number; g: number; b: number } | null {
  if (typeof input !== 'string') return null;
  const raw = input.trim().toLowerCase();
  if (!raw || raw === 'transparent') return null;
  if (raw === 'black') return { r: 0, g: 0, b: 0 };
  if (raw === 'white') return { r: 255, g: 255, b: 255 };

  const hexMatch = raw.match(/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/);
  if (hexMatch) {
    const hex = expandShortHex(hexMatch[1].slice(0, 6));
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
    };
  }

  const rgbMatch = raw.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/);
  if (rgbMatch) {
    return {
      r: Number(rgbMatch[1]),
      g: Number(rgbMatch[2]),
      b: Number(rgbMatch[3]),
    };
  }
  return null;
}

function channelLuminance(channel: number): number {
  const c = Math.max(0, Math.min(255, channel)) / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(color: string): number | null {
  const rgb = parseCssColor(color);
  if (!rgb) return null;
  return 0.2126 * channelLuminance(rgb.r) + 0.7152 * channelLuminance(rgb.g) + 0.0722 * channelLuminance(rgb.b);
}

export function isDarkBackground(color: string): boolean {
  const lum = relativeLuminance(color);
  if (lum == null) return false;
  return lum <= DARK_LUMINANCE_MAX;
}

export function foregroundOnBackground(background: string): string {
  return isDarkBackground(background) ? ON_DARK : ON_LIGHT;
}

export function darkButtonColors(disabled = false): { background: string; foreground: string } {
  if (disabled) {
    return { background: DISABLED_BUTTON_BG, foreground: DISABLED_BUTTON_FG };
  }
  return { background: DARK_BUTTON_BG, foreground: ON_DARK };
}

export function isReadableOnDark(foreground: string): boolean {
  if (!isDarkBackground(DARK_BUTTON_BG_ALT)) return true;
  const lum = relativeLuminance(foreground);
  if (lum == null) return false;
  return lum >= 0.7;
}
