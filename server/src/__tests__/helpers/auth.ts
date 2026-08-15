import request from 'supertest';
import app from '../../app';

export type SeededAuthRole = 'USER' | 'ADMIN' | 'VENDOR' | 'CONTENT_CREATOR';

export async function getAuthToken(role: SeededAuthRole = 'USER'): Promise<string> {
  const email = role === 'ADMIN'
    ? 'shivaay.chelani@gmail.com'
    : role === 'VENDOR'
      ? 'streetstory@palsafar.com'
      : role === 'CONTENT_CREATOR'
        ? 'rahul.chelani@palsafar.com'
        : 'user@palsafar.com';
  const password = role === 'USER'
    ? 'User@123'
    : role === 'ADMIN'
      ? 'Admin@123'
      : role === 'CONTENT_CREATOR'
        ? 'Creator@123'
        : 'Vendor@123';

  let lastStatus = 0;
  let lastBody: unknown;

  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email, password });

    lastStatus = res.status;
    lastBody = res.body;

    const token = res.body.data?.accessToken as string | undefined;
    if (res.status === 200 && token) {
      return token;
    }

    if (attempt < 4) {
      await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
    }
  }

  throw new Error(
    `Login failed for ${role} after 5 attempts: ${lastStatus} ${JSON.stringify(lastBody)}`,
  );
}
