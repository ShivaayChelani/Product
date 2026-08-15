import RNFS from 'react-native-fs';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type StorageBreakdown = {
  downloadedMapsBytes: number;
  offlineTripsBytes: number;
  imageCacheBytes: number;
  videoCacheBytes: number;
  totalBytes: number;
};

async function dirSize(path: string): Promise<number> {
  try {
    const exists = await RNFS.exists(path);
    if (!exists) return 0;
    const stat = await RNFS.stat(path);
    if (stat.isFile()) return Number(stat.size) || 0;
    const entries = await RNFS.readDir(path);
    let total = 0;
    for (const e of entries) {
      total += e.isFile() ? Number(e.size) || 0 : await dirSize(e.path);
    }
    return total;
  } catch {
    return 0;
  }
}

export async function measureAppStorage(): Promise<StorageBreakdown> {
  const doc = RNFS.DocumentDirectoryPath;
  const cache = RNFS.CachesDirectoryPath;
  const [downloadedMapsBytes, offlineTripsBytes, imageCacheBytes, videoCacheBytes] = await Promise.all([
    dirSize(`${doc}/maps`),
    dirSize(`${doc}/offline-trips`),
    dirSize(`${cache}/images`),
    dirSize(`${cache}/videos`),
  ]);
  const totalBytes = downloadedMapsBytes + offlineTripsBytes + imageCacheBytes + videoCacheBytes;
  return { downloadedMapsBytes, offlineTripsBytes, imageCacheBytes, videoCacheBytes, totalBytes };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export async function clearAppCaches(): Promise<void> {
  const cache = RNFS.CachesDirectoryPath;
  for (const sub of ['images', 'videos']) {
    const p = `${cache}/${sub}`;
    if (await RNFS.exists(p)) {
      await RNFS.unlink(p).catch(() => {});
    }
  }
}

export async function clearDownloads(): Promise<void> {
  const doc = RNFS.DocumentDirectoryPath;
  for (const sub of ['maps', 'offline-trips']) {
    const p = `${doc}/${sub}`;
    if (await RNFS.exists(p)) {
      await RNFS.unlink(p).catch(() => {});
    }
  }
}

export async function countOfflineSyncPending(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem('ps_sync_queue');
    if (!raw) return 0;
    const parsed = JSON.parse(raw) as unknown[];
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}
