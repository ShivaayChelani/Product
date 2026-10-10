import fs from 'fs';
import path from 'path';
import { classifyAppleServerPayload, toAppleApiBody } from '../services/appleLoginRequest';

describe('Apple login request contract', () => {
  const authorization = {
    identityToken: 'signed.jwt.value',
    nonce: 'client-nonce-value',
    appleUserId: 'client-supplied-sub',
    firstName: 'Grace',
    lastName: 'Hopper',
  };

  it('requests email and full name, and does not require credential.email', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../services/authService.ts'),
      'utf8',
    );
    expect(source).toContain('appleAuth.Scope.EMAIL');
    expect(source).toContain('appleAuth.Scope.FULL_NAME');
    expect(source).not.toContain('response.email');
    expect(source).not.toContain('credential.email');
  });

  it('sends the identity token and nonce, never a client Apple user id', () => {
    const body = toAppleApiBody(authorization);
    expect(body).toEqual({
      identityToken: 'signed.jwt.value',
      nonce: 'client-nonce-value',
      firstName: 'Grace',
      lastName: 'Hopper',
    });
    expect(body).not.toHaveProperty('appleUserId');
    expect(body).not.toHaveProperty('sub');
    expect(body).not.toHaveProperty('userId');
  });

  it('includes a completion email and code only when the user is proving a mailbox', () => {
    const body = toAppleApiBody({
      ...authorization,
      email: 'grace@example.com',
      emailVerificationCode: 'APPLEOTP',
    });
    expect(body.email).toBe('grace@example.com');
    expect(body.emailVerificationCode).toBe('APPLEOTP');
    expect(body).not.toHaveProperty('appleUserId');
  });
});

describe('classifyAppleServerPayload', () => {
  it('treats a missing email as an account-completion step, not a dead-end error', () => {
    expect(classifyAppleServerPayload({ requiresEmailCompletion: true })).toEqual({
      type: 'email_completion',
    });
  });

  it('recognises the verification step for a new user email', () => {
    expect(classifyAppleServerPayload({
      requiresEmailVerification: true,
      email: 'grace@example.com',
    })).toEqual({ type: 'email_verification', email: 'grace@example.com' });
  });

  it('keeps legal acceptance and an existing session distinct from email completion', () => {
    expect(classifyAppleServerPayload({ requiresLegalAcceptance: true })).toEqual({ type: 'legal' });
    expect(classifyAppleServerPayload({
      accessToken: 'token',
      refreshToken: 'refresh',
      user: { id: 'user-1', email: 'grace@example.com' },
    })).toEqual({ type: 'session' });
    expect(classifyAppleServerPayload({})).toEqual({ type: 'incomplete' });
  });
});
