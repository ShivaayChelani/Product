/**
 * ITINERARY HARDENING — Section 9: API error handling.
 *
 * Exercises the real apiClient against HTTP 400/401/403/404/409/500,
 * network failures, malformed JSON, empty responses, and aborts.
 * Errors must surface with status/code attached — never swallowed into
 * generic "route" failures.
 */
const store: Record<string, string> = {};

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn((key: string) => Promise.resolve(store[key] ?? null)),
    setItem: jest.fn((key: string, value: string) => {
      store[key] = value;
      return Promise.resolve();
    }),
    removeItem: jest.fn((key: string) => {
      delete store[key];
      return Promise.resolve();
    }),
    multiSet: jest.fn(),
    multiRemove: jest.fn(),
  },
}));

import { apiClient } from '../services/api/client';

function jsonResponse(status: number, body: any, contentType = 'application/json') {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (h: string) => (h.toLowerCase() === 'content-type' ? contentType : null),
    },
    json: async () => body,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  };
}

describe('apiClient error handling', () => {
  let originalFetch: typeof global.fetch;

  beforeAll(() => {
    originalFetch = global.fetch;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    Object.keys(store).forEach(k => delete store[k]);
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  async function setUpFetch(mock: (url: string, init?: any) => Promise<any>) {
    (global as any).fetch = jest.fn(mock);
  }

  it('400 surfaces status + backend message', async () => {
    await setUpFetch(() => Promise.resolve(jsonResponse(400, { success: false, message: 'Trip name is required' })));
    await expect(apiClient.get('/trips')).rejects.toMatchObject({
      status: 400,
      message: 'Trip name is required',
    });
  });

  it('401 without a session is thrown (not swallowed into a generic route error)', async () => {
    await setUpFetch(() => Promise.resolve(jsonResponse(401, { message: 'Unauthorized' })));
    await expect(apiClient.get('/trips')).rejects.toMatchObject({ status: 401 });
    // No refresh attempt fired: token + refresh token both absent.
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('401 with an expiring session does not crash (refresh unavailable → error)', async () => {
    await apiClient.setToken('expired-token');
    await setUpFetch(() => Promise.resolve(jsonResponse(401, { message: 'Unauthorized' })));
    await expect(apiClient.get('/trips')).rejects.toMatchObject({ status: 401 });
    await apiClient.destroy();
  });

  it('403 surfaces status + backend code', async () => {
    await setUpFetch(() =>
      Promise.resolve(jsonResponse(403, { message: 'You are not in this city', code: 'TREASURE_HUNT_CITY_MISMATCH' })),
    );
    await expect(apiClient.get('/riddles/r1')).rejects.toMatchObject({
      status: 403,
      code: 'TREASURE_HUNT_CITY_MISMATCH',
    });
  });

  it('404 surfaces status', async () => {
    await setUpFetch(() => Promise.resolve(jsonResponse(404, { message: 'Trip not found' })));
    await expect(apiClient.get('/trips/nope')).rejects.toMatchObject({ status: 404 });
  });

  it('409 surfaces status + body', async () => {
    await setUpFetch(() => Promise.resolve(jsonResponse(409, { message: 'Already reviewed', code: 'ALREADY_REVIEWED' })));
    await expect(apiClient.post('/admin/riddles/submissions/s1/approve')).rejects.toMatchObject({
      status: 409,
      code: 'ALREADY_REVIEWED',
      message: 'Already reviewed',
    });
  });

  it('500 surfaces status', async () => {
    await setUpFetch(() => Promise.resolve(jsonResponse(500, { message: 'Internal error' })));
    await expect(apiClient.get('/trips')).rejects.toMatchObject({ status: 500 });
  });

  it('network failure rejects without a crash and without inventing a status', async () => {
    await setUpFetch(() => Promise.reject(new TypeError('Network request failed')));
    await expect(apiClient.get('/trips')).rejects.toThrow('Network request failed');
  });

  it('abort/timeout surfaces an AbortError and never a false "not found"', async () => {
    const abortError = new DOMException('The operation was aborted', 'AbortError');
    abortError.name = 'AbortError';
    abortError.name = 'AbortError';
    await setUpFetch(() => Promise.reject(abortError));
    await expect(apiClient.get('/trips')).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('malformed JSON on an error response still surfaces the status', async () => {
    const res = {
      ok: false,
      status: 500,
      headers: { get: () => 'application/json' },
      json: async () => { throw new SyntaxError('Unexpected token'); },
      text: async () => 'broken',
    };
    await setUpFetch(() => Promise.resolve(res));
    await expect(apiClient.get('/trips')).rejects.toMatchObject({ status: 500 });
  });

  it('empty non-JSON response surfaces a descriptive message', async () => {
    const res = {
      ok: false,
      status: 500,
      headers: { get: () => 'text/html' },
      json: async () => ({}),
      text: async () => '',
    };
    await setUpFetch(() => Promise.resolve(res));
    await expect(apiClient.get('/trips')).rejects.toMatchObject({
      status: 500,
      message: 'Request failed with status 500',
    });
  });

  it('structured field errors are joined into the thrown message', async () => {
    await setUpFetch(() =>
      Promise.resolve(jsonResponse(400, {
        message: 'Validation failed',
        errors: [
          { field: 'startDate', message: 'startDate is invalid' },
          { field: 'endDate', message: 'endDate is invalid' },
        ],
      })),
    );
    await expect(apiClient.post('/trips', {})).rejects.toMatchObject({
      status: 400,
      message: 'startDate is invalid\nendDate is invalid',
    });
  });

  it('successful responses are returned untouched', async () => {
    const body = { success: true, data: { id: 't' } };
    await setUpFetch(() => Promise.resolve(jsonResponse(200, body)));
    const out = await apiClient.get('/trips/t');
    expect(out).toEqual(body);
  });

  it('a body read that stalls after headers still times out (never hangs the caller)', async () => {
    jest.useFakeTimers();
    try {
      const res = {
        ok: true,
        status: 200,
        headers: { get: (h: string) => (h.toLowerCase() === 'content-type' ? 'application/json' : null) },
        json: () => new Promise(() => { /* intentionally never settles */ }),
        text: () => new Promise(() => { /* intentionally never settles */ }),
      };
      await setUpFetch(() => Promise.resolve(res));

      const pending = apiClient.get('/trips');
      const assertion = expect(pending).rejects.toMatchObject({ name: 'AbortError' });

      jest.advanceTimersByTime(60001);
      await assertion;
    } finally {
      jest.useRealTimers();
    }
  });
});
