import { Linking, Platform, Alert } from 'react-native';

export function digitsOnly(value?: string | null): string {
  return String(value || '').replace(/\D/g, '');
}

export function telUrl(phone?: string | null): string | null {
  const raw = String(phone || '').trim();
  if (!raw) return null;
  const digits = digitsOnly(raw);
  if (digits.length < 8) return null;
  return `tel:${raw.replace(/\s+/g, '')}`;
}

export function whatsappUrl(phone?: string | null): string | null {
  let digits = digitsOnly(phone);
  if (digits.length === 11 && digits.startsWith('0')) {
    digits = `91${digits.slice(1)}`;
  }
  if (digits.length === 10) digits = `91${digits}`;
  if (digits.length < 10) return null;
  return `https://wa.me/${digits}`;
}

export function websiteUrl(raw?: string | null): string | null {
  const t = String(raw || '').trim();
  if (!t) return null;
  if (/^https?:\/\//i.test(t)) return t;
  return `https://${t.replace(/^\/+/, '')}`;
}

export function mapsSearchUrl(
  latitude?: number | null,
  longitude?: number | null,
  label?: string,
): string | null {
  if (latitude == null || longitude == null || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }
  const q = encodeURIComponent(label || `${latitude},${longitude}`);
  return Platform.select({
    ios: `maps:0,0?q=${latitude},${longitude}(${q})`,
    android: `geo:0,0?q=${latitude},${longitude}(${q})`,
    default: `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`,
  }) || `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
}

export function googleMapsFallbackUrl(
  latitude: number,
  longitude: number,
): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`;
}

export async function openExternalUrl(url: string, missingMessage: string): Promise<void> {
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert('Unable to open', missingMessage);
  }
}

export async function openVendorCall(phone?: string | null): Promise<void> {
  const url = telUrl(phone);
  if (!url) {
    Alert.alert('Phone unavailable', 'This business has not shared a phone number.');
    return;
  }
  await openExternalUrl(url, 'Could not start the phone call.');
}

export async function openVendorWhatsApp(phone?: string | null): Promise<void> {
  const url = whatsappUrl(phone);
  if (!url) {
    Alert.alert('WhatsApp unavailable', 'This business has not shared a WhatsApp number.');
    return;
  }
  await openExternalUrl(url, 'Could not open WhatsApp.');
}

export async function openVendorWebsite(site?: string | null): Promise<void> {
  const url = websiteUrl(site);
  if (!url) {
    Alert.alert('Website unavailable', 'This business has not added a website.');
    return;
  }
  await openExternalUrl(url, 'Could not open the website.');
}

export async function openVendorDirections(
  latitude?: number | null,
  longitude?: number | null,
  label?: string,
): Promise<void> {
  const url = mapsSearchUrl(latitude, longitude, label);
  if (!url || latitude == null || longitude == null) {
    Alert.alert('Location unavailable', 'Directions are not available for this business.');
    return;
  }
  try {
    await Linking.openURL(url);
  } catch {
    await openExternalUrl(
      googleMapsFallbackUrl(latitude, longitude),
      'Could not open maps for directions.',
    );
  }
}
