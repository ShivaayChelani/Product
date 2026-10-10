/**
 * Apple login request shaping and server-response classification.
 * Identity is the verified token on the server. This module never sends a
 * client Apple user id, and it never treats a typed email as proof of identity.
 */

export type AppleAuthorizationFields = {
  identityToken: string;
  nonce: string;
  /** Local credential-state tracking only. Never sent to the API. */
  appleUserId?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  emailVerificationCode?: string;
};

export type AppleLoginRequestBody = {
  identityToken: string;
  nonce: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  emailVerificationCode?: string;
  termsAccepted?: boolean;
  privacyAccepted?: boolean;
  termsVersion?: number;
  privacyVersion?: number;
  platform?: 'ios' | 'android' | 'web';
};

export type AppleLegalRequestFields = {
  termsAccepted?: boolean;
  privacyAccepted?: boolean;
  termsVersion?: number;
  privacyVersion?: number;
  platform?: 'ios' | 'android' | 'web';
};

export type AppleServerOutcome =
  | { type: 'email_completion' }
  | { type: 'email_verification'; email: string }
  | { type: 'legal' }
  | { type: 'session' }
  | { type: 'incomplete' };

export function toAppleApiBody(
  authorization: AppleAuthorizationFields,
  legal?: AppleLegalRequestFields,
): AppleLoginRequestBody {
  const body: AppleLoginRequestBody = {
    identityToken: authorization.identityToken,
    nonce: authorization.nonce,
  };
  if (authorization.firstName) body.firstName = authorization.firstName;
  if (authorization.lastName) body.lastName = authorization.lastName;
  if (authorization.email) body.email = authorization.email;
  if (authorization.emailVerificationCode) {
    body.emailVerificationCode = authorization.emailVerificationCode;
  }
  if (legal?.termsAccepted) body.termsAccepted = true;
  if (legal?.privacyAccepted) body.privacyAccepted = true;
  if (typeof legal?.termsVersion === 'number') body.termsVersion = legal.termsVersion;
  if (typeof legal?.privacyVersion === 'number') body.privacyVersion = legal.privacyVersion;
  if (legal?.platform) body.platform = legal.platform;
  return body;
}

export function classifyAppleServerPayload(data: unknown): AppleServerOutcome {
  if (!data || typeof data !== 'object') return { type: 'incomplete' };
  const record = data as Record<string, unknown>;
  if (record.requiresEmailCompletion === true) return { type: 'email_completion' };
  if (record.requiresEmailVerification === true && typeof record.email === 'string' && record.email) {
    return { type: 'email_verification', email: record.email };
  }
  if (record.requiresLegalAcceptance === true) return { type: 'legal' };
  if (typeof record.accessToken === 'string' && record.accessToken.length > 0) return { type: 'session' };
  return { type: 'incomplete' };
}
