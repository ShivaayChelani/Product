import { Platform } from 'react-native';
import {
  telUrl,
  whatsappUrl,
  websiteUrl,
  mapsSearchUrl,
} from '../utils/vendorContactActions';

describe('vendor contact action URLs', () => {
  it('builds tel: URLs and rejects short numbers', () => {
    expect(telUrl('+91 98765 43210')).toBe('tel:+919876543210');
    expect(telUrl('9876543210')).toBe('tel:9876543210');
    expect(telUrl('123')).toBeNull();
    expect(telUrl(null)).toBeNull();
  });

  it('builds WhatsApp links with India country code for 10-digit numbers', () => {
    expect(whatsappUrl('9876543210')).toBe('https://wa.me/919876543210');
    expect(whatsappUrl('+91 98765 43210')).toBe('https://wa.me/919876543210');
    expect(whatsappUrl('09876543210')).toBe('https://wa.me/919876543210');
    expect(whatsappUrl('12345')).toBeNull();
  });

  it('normalizes website URLs', () => {
    expect(websiteUrl('https://streetstoryjabalpur.com')).toBe('https://streetstoryjabalpur.com');
    expect(websiteUrl('streetstoryjabalpur.com')).toBe('https://streetstoryjabalpur.com');
    expect(websiteUrl('')).toBeNull();
  });

  it('builds a maps URL when coordinates exist', () => {
    const url = mapsSearchUrl(23.16, 79.93, 'Street story');
    expect(url).toBeTruthy();
    expect(url).toContain('23.16');
    expect(url).toContain('79.93');
    if (Platform.OS === 'ios') {
      expect(url).toMatch(/^maps:/);
    } else if (Platform.OS === 'android') {
      expect(url).toMatch(/^geo:/);
    }
    expect(mapsSearchUrl(null, null, 'X')).toBeNull();
  });
});
