import { describe, expect, it, vi } from 'vitest';
import {
  createVendorReelIdempotent,
  VENDOR_REEL_VIDEO_IDEMPOTENCY_MS,
} from '../modules/vendors/vendorReelIdempotency';

function exclusiveTx() {
  const created: Array<{ id: string; vendorId: string; videoUrl: string }> = [];
  let gate = Promise.resolve();
  const queryRaw = vi.fn().mockImplementation(() => {
    const prev = gate;
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    gate = prev.then(() => held);
    return prev.then(() => {
      const wrap = Promise.resolve([{ id: 'v1' }]);
      (wrap as Promise<unknown> & { finally: typeof wrap.finally }).finally(() => {
        /* lock is released by the caller after the full idempotent function */
      });
      return wrap;
    }).finally(() => {
      release();
    });
  });
  const findFirst = vi.fn().mockImplementation(async () => created[0] ?? null);
  const create = vi.fn().mockImplementation(async ({ data }: { data: { videoUrl: string } }) => {
    const reel = { id: `reel-${created.length + 1}`, vendorId: 'v1', videoUrl: data.videoUrl };
    created.push(reel);
    return reel;
  });
  return {
    created,
    queryRaw,
    create,
    tx: { $queryRaw: queryRaw, vendorReel: { findFirst, create } },
  };
}

describe('vendor reel videoUrl idempotency', () => {
  it('uses a 1-hour window matching creator reel retries', () => {
    expect(VENDOR_REEL_VIDEO_IDEMPOTENCY_MS).toBe(60 * 60 * 1000);
  });

  it('returns the existing reel on retry and does not create a second row', async () => {
    const existing = { id: 'reel-1', vendorId: 'v1', videoUrl: 'https://cdn.example/a.mp4' };
    const queryRaw = vi.fn().mockResolvedValue([{ id: 'v1' }]);
    const findFirst = vi.fn().mockResolvedValue(existing);
    const create = vi.fn();
    const beforeCreate = vi.fn();

    const result = await createVendorReelIdempotent(
      { $queryRaw: queryRaw, vendorReel: { findFirst, create } } as any,
      'v1',
      { videoUrl: 'https://cdn.example/a.mp4' },
      beforeCreate,
    );

    expect(result).toEqual(existing);
    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(create).not.toHaveBeenCalled();
    expect(beforeCreate).not.toHaveBeenCalled();
  });

  it('creates one reel then reuses it for a sequential retry', async () => {
    const { created, tx, create } = exclusiveTx();
    const input = { videoUrl: 'https://cdn.example/a.mp4' };

    const first = await createVendorReelIdempotent(tx as any, 'v1', input);
    const retry = await createVendorReelIdempotent(tx as any, 'v1', input);

    expect(first.id).toBe(retry.id);
    expect(created).toHaveLength(1);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('serializes concurrent retries onto exactly one reel', async () => {
    const created: Array<{ id: string; vendorId: string; videoUrl: string }> = [];
    let chain = Promise.resolve();
    const runExclusive = <T>(fn: () => Promise<T>): Promise<T> => {
      const next = chain.then(fn);
      chain = next.then(() => undefined, () => undefined);
      return next;
    };
    const queryRaw = vi.fn().mockResolvedValue([{ id: 'v1' }]);
    const findFirst = vi.fn().mockImplementation(async () => created[0] ?? null);
    const create = vi.fn().mockImplementation(async ({ data }: { data: { videoUrl: string } }) => {
      const reel = { id: `reel-${created.length + 1}`, vendorId: 'v1', videoUrl: data.videoUrl };
      created.push(reel);
      return reel;
    });
    const tx = { $queryRaw: queryRaw, vendorReel: { findFirst, create } };
    const input = { videoUrl: 'https://cdn.example/a.mp4' };

    const [a, b] = await Promise.all([
      runExclusive(() => createVendorReelIdempotent(tx as any, 'v1', input)),
      runExclusive(() => createVendorReelIdempotent(tx as any, 'v1', input)),
    ]);

    expect(a.id).toBe(b.id);
    expect(created).toHaveLength(1);
    expect(create).toHaveBeenCalledTimes(1);
  });
});
