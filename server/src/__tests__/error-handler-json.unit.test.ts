import { describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../middleware/errorHandler';

function mockRes() {
  const res: any = {
    statusCode: 0,
    body: null,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return res;
}

describe('errorHandler', () => {
  it('maps body-parser SyntaxError to 400 instead of 500', () => {
    const err = new SyntaxError('Unexpected token');
    (err as SyntaxError & { body?: string }).body = '{';
    const req: any = { path: '/api/v1/x', correlationId: 'c1' };
    const res = mockRes();
    errorHandler(err, req, res, vi.fn());
    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe('Invalid JSON payload');
  });
});
