import dns from 'dns/promises';
import net from 'net';
import { ApiError } from './ApiError';

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'metadata.google.internal',
  'metadata.goog',
]);

const blockedNets = new net.BlockList();
blockedNets.addSubnet('0.0.0.0', 8, 'ipv4');
blockedNets.addSubnet('10.0.0.0', 8, 'ipv4');
blockedNets.addSubnet('127.0.0.0', 8, 'ipv4');
blockedNets.addSubnet('169.254.0.0', 16, 'ipv4');
blockedNets.addSubnet('172.16.0.0', 12, 'ipv4');
blockedNets.addSubnet('192.168.0.0', 16, 'ipv4');
blockedNets.addSubnet('100.64.0.0', 10, 'ipv4');
blockedNets.addSubnet('192.0.0.0', 24, 'ipv4');
blockedNets.addSubnet('192.0.2.0', 24, 'ipv4');
blockedNets.addSubnet('198.51.100.0', 24, 'ipv4');
blockedNets.addSubnet('203.0.113.0', 24, 'ipv4');
blockedNets.addSubnet('224.0.0.0', 4, 'ipv4');
blockedNets.addSubnet('240.0.0.0', 4, 'ipv4');
blockedNets.addAddress('255.255.255.255', 'ipv4');
blockedNets.addAddress('::', 'ipv6');
blockedNets.addAddress('::1', 'ipv6');
blockedNets.addSubnet('fc00::', 7, 'ipv6');
blockedNets.addSubnet('fe80::', 10, 'ipv6');
blockedNets.addSubnet('ff00::', 8, 'ipv6');
blockedNets.addSubnet('2001:db8::', 32, 'ipv6');

function stripHostBrackets(host: string): string {
  if (host.startsWith('[') && host.endsWith(']')) {
    return host.slice(1, -1);
  }
  return host;
}

export function isPrivateOrLocalIp(ip: string): boolean {
  const normalized = stripHostBrackets(ip.trim().toLowerCase());
  const family = net.isIP(normalized);
  if (family === 4) return blockedNets.check(normalized, 'ipv4');
  if (family === 6) return blockedNets.check(normalized, 'ipv6');
  return true;
}

async function assertResolvedAddressesSafe(hostname: string): Promise<void> {
  let records: Array<{ address: string }>;
  try {
    records = await dns.lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new ApiError(400, 'URL host could not be resolved.');
  }
  if (!records.length) {
    throw new ApiError(400, 'URL host could not be resolved.');
  }
  for (const record of records) {
    if (isPrivateOrLocalIp(record.address)) {
      throw new ApiError(400, 'URL host is not allowed.');
    }
  }
}

export async function assertSafeExternalUrl(rawUrl: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new ApiError(400, 'Invalid URL.');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new ApiError(400, 'Only HTTP(S) URLs are allowed.');
  }

  const hostname = stripHostBrackets(parsed.hostname.toLowerCase());
  if (
    BLOCKED_HOSTNAMES.has(hostname)
    || hostname.endsWith('.localhost')
    || hostname.endsWith('.local')
  ) {
    throw new ApiError(400, 'URL host is not allowed.');
  }

  if (net.isIP(hostname)) {
    if (isPrivateOrLocalIp(hostname)) {
      throw new ApiError(400, 'URL host is not allowed.');
    }
    return parsed;
  }

  await assertResolvedAddressesSafe(hostname);
  return parsed;
}

export async function safeFetchExternalUrl(
  rawUrl: string,
  init?: RequestInit & { timeoutMs?: number },
): Promise<Response> {
  const parsed = await assertSafeExternalUrl(rawUrl);
  // Re-resolve immediately before fetch to shrink the DNS-rebinding window.
  await assertSafeExternalUrl(parsed.toString());
  const controller = new AbortController();
  const timeoutMs = init?.timeoutMs ?? 15000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const userSignal = init?.signal;
    const onUserAbort = () => controller.abort();
    if (userSignal) {
      if (userSignal.aborted) controller.abort();
      else userSignal.addEventListener('abort', onUserAbort, { once: true });
    }
    try {
      return await fetch(parsed.toString(), {
        ...init,
        signal: controller.signal,
        redirect: 'error',
      });
    } finally {
      userSignal?.removeEventListener('abort', onUserAbort);
    }
  } finally {
    clearTimeout(timer);
  }
}
