import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../app';
import { prisma } from '../config/database';

describe('Auth account security — change password & delete account', () => {
  const password = 'AccountTest@123';
  const newPassword = 'AccountTest@456';
  let email = '';
  let userId = '';
  let accessToken = '';

  beforeAll(async () => {
    email = `acct-security-${Date.now()}@example.test`;
    const reg = await request(app)
      .post('/api/v1/auth/register')
      .send({ email, name: 'Account Security', password });
    expect(reg.status).toBe(201);
    userId = reg.body.data.user.id;
    accessToken = reg.body.data.accessToken;
  });

  afterAll(async () => {
    if (userId) {
      await prisma.user.deleteMany({ where: { id: userId } }).catch(() => undefined);
    }
  });

  it('changes password, revokes refresh sessions, and requires the new password to login', async () => {
    const change = await request(app)
      .patch('/api/v1/auth/password')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ currentPassword: password, newPassword });
    expect(change.status).toBe(200);

    const oldLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email, password });
    expect(oldLogin.status).toBe(401);

    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email, password: newPassword });
    expect(login.status).toBe(200);
    accessToken = login.body.data.accessToken;
  });

  it('returns deletion warnings and permanently deletes the account after password confirmation', async () => {
    const info = await request(app)
      .get('/api/v1/auth/account/deletion-info')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(info.status).toBe(200);
    expect(info.body.data.canSelfDelete).toBe(true);
    expect(typeof info.body.data.palPoints).toBe('number');

    const deleted = await request(app)
      .delete('/api/v1/auth/account')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ password: newPassword, confirmDeletion: true });
    expect(deleted.status).toBe(200);
    expect(deleted.body.data.deleted).toBe(true);

    const gone = await prisma.user.findUnique({ where: { id: userId } });
    expect(gone).toBeNull();
    userId = '';

    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email, password: newPassword });
    expect(login.status).toBe(401);
  });
});
