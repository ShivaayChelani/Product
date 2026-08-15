import crypto from 'crypto';
import { ApiError } from '../../shared/utils/ApiError';
import { logger } from '../../config/logger';

const VERIFIER_KEYS_URL = 'https://gstatic.com/admob/reward/verifier-keys.json';

interface AdMobVerifierKeys {
  keys: Array<{
    keyId: number;
    pem: string;
    base64: string;
  }>;
}

let cachedKeys: AdMobVerifierKeys | null = null;
let lastFetchTime = 0;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export const admobSsvService = {
  /**
   * Fetches the AdMob verifier keys, caching them for 24 hours.
   * If a fetch fails, throws an ApiError so the callback fails closed.
   */
  async getVerifierKeys(forceRefresh = false): Promise<AdMobVerifierKeys> {
    const now = Date.now();
    if (!forceRefresh && cachedKeys && now - lastFetchTime < CACHE_TTL_MS) {
      return cachedKeys;
    }

    try {
      const response = await fetch(VERIFIER_KEYS_URL);
      if (!response.ok) {
        throw new Error(`Failed to fetch keys: ${response.statusText}`);
      }
      const data = (await response.json()) as AdMobVerifierKeys;
      cachedKeys = data;
      lastFetchTime = now;
      return data;
    } catch (err) {
      logger.error({ err }, 'Error fetching AdMob verifier keys');
      throw new ApiError(503, 'Service unavailable for ad verification');
    }
  },

  /**
   * Validates an AdMob SSV request.
   * @param fullUrl The full unescaped request URL (e.g., req.url)
   * @param keyId The key_id from the query parameters
   * @param signature The base64 URL-safe signature from the query parameters
   * @returns true if valid, throws if invalid
   */
  async verifySignature(fullUrl: string, keyId: string, signature: string): Promise<boolean> {
    if (!keyId || !signature) {
      throw new ApiError(400, 'Missing key_id or signature');
    }

    let keys = await this.getVerifierKeys();
    let keyRecord = keys.keys.find((k) => String(k.keyId) === String(keyId));

    if (!keyRecord) {
      // Key rotation? Try forcing a refresh once.
      keys = await this.getVerifierKeys(true);
      keyRecord = keys.keys.find((k) => String(k.keyId) === String(keyId));
    }

    if (!keyRecord) {
      throw new ApiError(401, 'Unknown AdMob SSV key_id');
    }

    // AdMob signs the exact query string up to &signature=
    const queryString = fullUrl.includes('?') ? fullUrl.substring(fullUrl.indexOf('?') + 1) : fullUrl;
    
    // The signature parameter is always the last parameter appended by Google.
    // We must verify the content *before* &signature=
    const signatureParamStr = `&signature=${signature}`;
    const sigIndex = queryString.indexOf(signatureParamStr);
    
    if (sigIndex === -1) {
      // It's possible it was the first/only param? (Unlikely, but let's handle it)
      if (queryString.startsWith(`signature=${signature}`)) {
        throw new ApiError(400, 'Invalid payload format');
      }
      throw new ApiError(400, 'Signature parameter not found correctly in unescaped URL');
    }

    const payloadToVerify = queryString.substring(0, sigIndex);

    // Signature is base64url encoded. Node's crypto handles base64, so we might need to fix padding/chars,
    // though base64url is usually handled cleanly by standard base64 if we replace chars.
    let base64Signature = signature.replace(/-/g, '+').replace(/_/g, '/');
    while (base64Signature.length % 4) {
      base64Signature += '=';
    }

    try {
      // const verifier = crypto.createVerify('RSA-SHA256');
      // Wait, Google's public key PEM starts with BEGIN PUBLIC KEY.
      // AdMob keys are typically ECDSA (prime256v1). Node.js crypto uses 'sha256' for verify, not 'RSA-SHA256'.
      // createVerify('sha256') works for ECDSA keys. Let's use 'sha256'.
      const ecdsaVerifier = crypto.createVerify('sha256');
      ecdsaVerifier.update(payloadToVerify);
      
      const isValid = ecdsaVerifier.verify(keyRecord.pem, base64Signature, 'base64');
      
      if (!isValid) {
        throw new ApiError(401, 'Invalid SSV signature');
      }
      
      return true;
    } catch (err: any) {
      if (err instanceof ApiError) throw err;
      logger.error({ err }, 'Signature verification error');
      throw new ApiError(401, 'Failed to verify signature cryptographic validity');
    }
  },
};
