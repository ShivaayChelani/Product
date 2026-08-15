import AsyncStorage from '@react-native-async-storage/async-storage';
import { legalApi, LegalDocumentPayload, LegalDocumentType } from './api/legal';

const CACHE_PREFIX = 'PALSAFAR_LEGAL_DOC_';

interface CachedLegalDocument {
  payload: LegalDocumentPayload;
  cachedAt: number;
}

function cacheKey(type: LegalDocumentType, locale: string): string {
  return `${CACHE_PREFIX}${type}_${locale}`;
}

async function readCache(type: LegalDocumentType, locale: string): Promise<CachedLegalDocument | null> {
  try {
    const raw = await AsyncStorage.getItem(cacheKey(type, locale));
    if (!raw) return null;
    return JSON.parse(raw) as CachedLegalDocument;
  } catch {
    return null;
  }
}

async function writeCache(type: LegalDocumentType, locale: string, payload: LegalDocumentPayload): Promise<void> {
  try {
    const entry: CachedLegalDocument = { payload, cachedAt: Date.now() };
    await AsyncStorage.setItem(cacheKey(type, locale), JSON.stringify(entry));
  } catch {
    // Non-fatal — worst case the next fetch just misses the cache.
  }
}

export interface LegalDocumentResult {
  document: LegalDocumentPayload | null;
  source: 'network' | 'cache' | 'none';
  cachedAt: number | null;
  /** True when the CMS has no published version yet for this type (distinct from a network failure). */
  notPublished: boolean;
}

/**
 * Fetches the latest published legal document from the backend and refreshes the
 * offline cache. Falls back to the last cached version if the network/API is
 * unavailable — never shows a hardcoded/blank screen if a cached copy exists.
 */
export async function getLegalDocument(type: LegalDocumentType, locale = 'en'): Promise<LegalDocumentResult> {
  try {
    const res = await legalApi.getDocument(type, locale);
    if (res.success && res.data) {
      await writeCache(type, locale, res.data);
      return { document: res.data, source: 'network', cachedAt: Date.now(), notPublished: false };
    }
  } catch (err: any) {
    // 404 means the CMS genuinely has nothing published yet — don't mask that with a stale cache lie,
    // but still prefer a previously cached copy if one exists (e.g. it was unpublished after being cached).
    const notPublished = err?.status === 404;
    const cached = await readCache(type, locale);
    if (cached) {
      return { document: cached.payload, source: 'cache', cachedAt: cached.cachedAt, notPublished: false };
    }
    return { document: null, source: 'none', cachedAt: null, notPublished };
  }

  const cached = await readCache(type, locale);
  if (cached) {
    return { document: cached.payload, source: 'cache', cachedAt: cached.cachedAt, notPublished: false };
  }
  return { document: null, source: 'none', cachedAt: null, notPublished: false };
}

export async function clearLegalCache(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const legalKeys = keys.filter((k) => k.startsWith(CACHE_PREFIX));
    if (legalKeys.length) await AsyncStorage.multiRemove(legalKeys);
  } catch {
    // best-effort
  }
}
