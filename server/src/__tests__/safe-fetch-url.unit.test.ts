import { describe, it, expect } from 'vitest';
import { assertSafeExternalUrl, isPrivateOrLocalIp } from '../shared/utils/safeFetchUrl';

async function expectBlocked(raw: string) {
  await expect(assertSafeExternalUrl(raw)).rejects.toMatchObject({ statusCode: 400 });
}

describe('safeFetchUrl SSRF guard (M-06)', () => {
  it('blocks IPv4 loopback, unspecified, private, link-local, and metadata', async () => {
    await expectBlocked('http://127.0.0.1/image.png');
    await expectBlocked('http://localhost/image.png');
    await expectBlocked('http://0.0.0.0/');
    await expectBlocked('http://10.0.0.1/');
    await expectBlocked('http://172.16.0.1/');
    await expectBlocked('http://192.168.1.1/image.png');
    await expectBlocked('http://169.254.169.254/latest/meta-data/');
  });

  it('blocks IPv6 loopback, link-local, and IPv4-mapped IPv6', async () => {
    await expectBlocked('http://[::1]/');
    await expectBlocked('http://[::ffff:127.0.0.1]/');
    await expectBlocked('http://[::ffff:10.0.0.1]/');
    await expectBlocked('http://[::ffff:192.168.1.1]/');
    await expectBlocked('http://[fe80::1]/');
  });

  it('classifies IPv4-mapped IPv6 as private without relying on string equality', () => {
    expect(isPrivateOrLocalIp('::ffff:127.0.0.1')).toBe(true);
    expect(isPrivateOrLocalIp('::ffff:7f00:1')).toBe(true);
    expect(isPrivateOrLocalIp('::ffff:10.0.0.1')).toBe(true);
    expect(isPrivateOrLocalIp('::ffff:c0a8:101')).toBe(true);
    expect(isPrivateOrLocalIp('2001:4860:4860::8888')).toBe(false);
    expect(isPrivateOrLocalIp('8.8.8.8')).toBe(false);
  });

  it('blocks multicast and unique-local ranges', async () => {
    await expectBlocked('http://224.0.0.1/');
    await expectBlocked('http://[ff02::1]/');
    await expectBlocked('http://[fd00::1]/');
  });

  it('allows public HTTPS URLs', async () => {
    const url = await assertSafeExternalUrl('https://images.unsplash.com/photo-1');
    expect(url.protocol).toBe('https:');
  });
});
