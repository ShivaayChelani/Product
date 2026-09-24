import { OAuth2Client, type TokenPayload } from 'google-auth-library';
import { ApiError } from '../../shared/utils/ApiError';
import { normalizeEmail } from '../../shared/utils/userEmailLookup';

export const GOOGLE_PROVIDER = 'google';

export const DEFAULT_GOOGLE_OAUTH_CLIENT_IDS = [
  // Web (required so the mobile SDK can return a server-verifiable ID token)
  '27219212015-kocrm1ig6vs0nkar7mjjial0gctbd1nj.apps.googleusercontent.com',
  // Android (emulator/debug cert) + Android release/upload cert
  '27219212015-65ift40sfsoimib2b208rrtet1cjh3gs.apps.googleusercontent.com',
  '27219212015-tnmd3127e6ha25idhdctcc7fhiopnhs8.apps.googleusercontent.com',
  // iOS (GoogleService-Info.plist CLIENT_ID, used as iosClientId by src/config/googleAuth.ts)
  '27219212015-g0fhqdou0dhmh342pae2k9tm0bq2d6i9.apps.googleusercontent.com',
] as const;

const GOOGLE_ISSUERS = new Set(['accounts.google.com', 'https://accounts.google.com']);

export type VerifiedGoogleIdentity = {
  sub: string;
  email: string;
  emailVerified: true;
  name: string | null;
  picture: string | null;
};

function normalizeClientId(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (trimmed.includes('.')) return trimmed;
  return `${trimmed}.apps.googleusercontent.com`;
}

function splitClientIds(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[,\s]+/)
    .map(normalizeClientId)
    .filter(Boolean);
}

export function getGoogleOAuthAudiences(): string[] {
  const ids = new Set<string>();
  for (const id of DEFAULT_GOOGLE_OAUTH_CLIENT_IDS) ids.add(id);
  for (const id of splitClientIds(process.env.GOOGLE_WEB_CLIENT_ID)) ids.add(id);
  for (const id of splitClientIds(process.env.GOOGLE_IOS_CLIENT_ID)) ids.add(id);
  for (const id of splitClientIds(process.env.GOOGLE_ANDROID_CLIENT_IDS)) ids.add(id);
  for (const id of splitClientIds(process.env.GOOGLE_OAUTH_CLIENT_IDS)) ids.add(id);
  return [...ids];
}

function isGoogleEmailVerified(value: unknown): boolean {
  return value === true || value === 'true';
}

function audienceMatches(aud: TokenPayload['aud'], allowed: string[]): boolean {
  const values = Array.isArray(aud) ? aud : [aud];
  return values.some((value) => typeof value === 'string' && allowed.includes(value));
}

export function mapGoogleVerifyError(error: unknown): ApiError {
  const message = error instanceof Error ? error.message : String(error ?? '');
  const lower = message.toLowerCase();
  if (lower.includes('expired') || lower.includes('used too late') || lower.includes('token used too early')) {
    return new ApiError(401, 'Google token has expired.');
  }
  if (lower.includes('audience') || lower.includes('wrong recipient') || lower.includes('incorrect recipient')) {
    return new ApiError(401, 'Invalid Google token audience.');
  }
  return new ApiError(401, 'Invalid Google token.');
}

export function assertGoogleIdTokenClaims(
  payload: TokenPayload | undefined | null,
  audiences: string[] = getGoogleOAuthAudiences(),
): VerifiedGoogleIdentity {
  if (!payload) {
    throw new ApiError(401, 'Invalid Google token.');
  }

  if (!payload.iss || !GOOGLE_ISSUERS.has(payload.iss)) {
    throw new ApiError(401, 'Invalid Google token issuer.');
  }

  if (!audienceMatches(payload.aud, audiences)) {
    throw new ApiError(401, 'Invalid Google token audience.');
  }

  if (typeof payload.exp === 'number' && payload.exp * 1000 <= Date.now()) {
    throw new ApiError(401, 'Google token has expired.');
  }

  const sub = typeof payload.sub === 'string' ? payload.sub.trim() : '';
  if (!sub) {
    throw new ApiError(401, 'Invalid Google token.');
  }

  const emailRaw = typeof payload.email === 'string' ? payload.email : '';
  if (!emailRaw) {
    throw new ApiError(400, 'Google token missing email.');
  }

  if (!isGoogleEmailVerified(payload.email_verified)) {
    throw new ApiError(401, 'Google email is not verified.');
  }

  const name = typeof payload.name === 'string' && payload.name.trim() ? payload.name.trim() : null;
  const picture = typeof payload.picture === 'string' && payload.picture.trim() ? payload.picture.trim() : null;

  return {
    sub,
    email: normalizeEmail(emailRaw),
    emailVerified: true,
    name,
    picture,
  };
}

export async function verifyGoogleIdToken(idToken: string): Promise<VerifiedGoogleIdentity> {
  if (typeof idToken !== 'string' || !idToken.trim()) {
    throw new ApiError(401, 'Invalid Google token.');
  }

  const audiences = getGoogleOAuthAudiences();
  if (audiences.length === 0) {
    throw new ApiError(503, 'Google Sign-In is not configured.');
  }

  const client = new OAuth2Client();
  let payload: TokenPayload | undefined;
  try {
    const ticket = await client.verifyIdToken({
      idToken: idToken.trim(),
      audience: audiences,
    });
    payload = ticket.getPayload();
  } catch (error) {
    throw mapGoogleVerifyError(error);
  }

  return assertGoogleIdTokenClaims(payload, audiences);
}
