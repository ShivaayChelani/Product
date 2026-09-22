import { describe, it, expect, beforeEach } from 'vitest';
import { Role } from '@prisma/client';
import { ErrorCodes } from '../shared/utils/ApiError';
import { resolveGoogleAccount } from '../modules/auth/googleAccountResolution';
import type { VerifiedGoogleIdentity } from '../modules/auth/googleIdentity';

type UserRow = {
  id: string;
  email: string;
  name: string;
  avatar: string | null;
  emailVerified: boolean;
  permission: Role;
  activeMode: Role;
};

type AccountRow = {
  id: string;
  userId: string;
  provider: string;
  providerAccountId: string;
  email: string | null;
};

function identity(overrides: Partial<VerifiedGoogleIdentity> = {}): VerifiedGoogleIdentity {
  return {
    sub: 'sub-1',
    email: 'new@palsafar.test',
    emailVerified: true,
    name: 'New Google',
    picture: 'https://example.com/a.png',
    ...overrides,
  };
}

function createMemoryDb() {
  const users = new Map<string, UserRow>();
  const accounts: AccountRow[] = [];
  let userSeq = 0;
  let accountSeq = 0;

  const tx = {
    user: {
      findUnique: async ({ where, select }: any) => {
        const row = where.id
          ? users.get(where.id) ?? null
          : [...users.values()].find((u) => u.email === where.email) ?? null;
        if (!row) return null;
        if (!select) return row;
        const picked: Record<string, unknown> = {};
        for (const key of Object.keys(select)) {
          if (select[key]) picked[key] = (row as any)[key];
        }
        return picked;
      },
      create: async ({ data, select }: any) => {
        if ([...users.values()].some((u) => u.email === data.email)) {
          const err = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
          throw err;
        }
        const row: UserRow = {
          id: data.id ?? `user-${++userSeq}`,
          email: data.email,
          name: data.name,
          avatar: data.avatar ?? null,
          emailVerified: data.emailVerified,
          permission: data.permission,
          activeMode: data.activeMode,
        };
        users.set(row.id, row);
        if (!select) return row;
        const picked: Record<string, unknown> = {};
        for (const key of Object.keys(select)) {
          if (select[key]) picked[key] = (row as any)[key];
        }
        return picked;
      },
      update: async ({ where, data }: any) => {
        const row = users.get(where.id);
        if (!row) throw new Error('missing user');
        Object.assign(row, data);
        return row;
      },
    },
    authAccount: {
      findUnique: async ({ where }: any) => {
        const key = where.provider_providerAccountId;
        return (
          accounts.find(
            (a) => a.provider === key.provider && a.providerAccountId === key.providerAccountId,
          ) ?? null
        );
      },
      findFirst: async ({ where }: any) => {
        return (
          accounts.find((a) => {
            if (where.userId && a.userId !== where.userId) return false;
            if (where.provider && a.provider !== where.provider) return false;
            return true;
          }) ?? null
        );
      },
      create: async ({ data }: any) => {
        if (
          accounts.some(
            (a) => a.provider === data.provider && a.providerAccountId === data.providerAccountId,
          )
        ) {
          throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
        }
        const row: AccountRow = {
          id: `acct-${++accountSeq}`,
          userId: data.userId,
          provider: data.provider,
          providerAccountId: data.providerAccountId,
          email: data.email ?? null,
        };
        accounts.push(row);
        return row;
      },
      update: async ({ where, data }: any) => {
        const row = accounts.find((a) => a.id === where.id);
        if (!row) throw new Error('missing account');
        Object.assign(row, data);
        return row;
      },
    },
    userRole: {
      upsert: async () => ({ id: 'role-user' }),
    },
    $queryRaw: async () => [],
  };

  return {
    users,
    accounts,
    seedUser(row: UserRow) {
      users.set(row.id, row);
    },
    seedAccount(row: AccountRow) {
      accounts.push(row);
    },
    db: {
      $transaction: async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx),
    },
  };
}

describe('resolveGoogleAccount', () => {
  let store: ReturnType<typeof createMemoryDb>;

  beforeEach(() => {
    store = createMemoryDb();
  });

  it('creates a new PalSafar user for an unknown Google identity', async () => {
    const result = await resolveGoogleAccount(identity(), store.db as any);
    expect(result.created).toBe(true);
    const created = [...store.users.values()][0];
    expect(created).toMatchObject({
      email: 'new@palsafar.test',
      name: 'New Google',
      avatar: 'https://example.com/a.png',
      emailVerified: true,
      permission: Role.USER,
      activeMode: Role.USER,
    });
    expect(store.accounts[0]).toMatchObject({
      provider: 'google',
      providerAccountId: 'sub-1',
      userId: created.id,
    });
  });

  it('logs in an existing Google-linked user without creating a duplicate', async () => {
    store.seedUser({
      id: 'u1',
      email: 'existing@palsafar.test',
      name: 'Custom Name',
      avatar: 'https://cdn.palsafar.test/me.png',
      emailVerified: true,
      permission: Role.USER,
      activeMode: Role.USER,
    });
    store.seedAccount({
      id: 'a1',
      userId: 'u1',
      provider: 'google',
      providerAccountId: 'sub-1',
      email: 'existing@palsafar.test',
    });

    const result = await resolveGoogleAccount(
      identity({
        email: 'existing@palsafar.test',
        name: 'Google Name Should Not Overwrite',
        picture: 'https://google/new.png',
      }),
      store.db as any,
    );
    expect(result).toEqual({ userId: 'u1', created: false, linkedNow: false });
    expect(store.users.size).toBe(1);
    expect(store.users.get('u1')?.name).toBe('Custom Name');
    expect(store.users.get('u1')?.avatar).toBe('https://cdn.palsafar.test/me.png');
  });

  it('securely links Google to an existing PalSafar user with the same verified email', async () => {
    store.seedUser({
      id: 'email-user',
      email: 'same@palsafar.test',
      name: 'Password User',
      avatar: null,
      emailVerified: false,
      permission: Role.VENDOR,
      activeMode: Role.VENDOR,
    });

    const result = await resolveGoogleAccount(
      identity({ email: 'same@palsafar.test', sub: 'sub-link' }),
      store.db as any,
    );
    expect(result).toEqual({ userId: 'email-user', created: false, linkedNow: true });
    expect(store.accounts[0]).toMatchObject({
      userId: 'email-user',
      providerAccountId: 'sub-link',
    });
    expect(store.users.get('email-user')?.emailVerified).toBe(true);
    expect(store.users.get('email-user')?.permission).toBe(Role.VENDOR);
    expect(store.users.get('email-user')?.name).toBe('Password User');
    expect(store.users.get('email-user')?.avatar).toBe('https://example.com/a.png');
  });

  it('rejects linking when the PalSafar user already has a different Google identity', async () => {
    store.seedUser({
      id: 'u-b',
      email: 'taken@palsafar.test',
      name: 'B',
      avatar: null,
      emailVerified: true,
      permission: Role.USER,
      activeMode: Role.USER,
    });
    store.seedAccount({
      id: 'a-old',
      userId: 'u-b',
      provider: 'google',
      providerAccountId: 'other-sub',
      email: 'taken@palsafar.test',
    });

    await expect(
      resolveGoogleAccount(identity({ email: 'taken@palsafar.test', sub: 'new-sub' }), store.db as any),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: ErrorCodes.GOOGLE_IDENTITY_CONFLICT,
    });
    expect(store.users.size).toBe(1);
    expect(store.accounts).toHaveLength(1);
  });

  it('retries unique-constraint races instead of creating a second user', async () => {
    store.seedUser({
      id: 'winner',
      email: 'race@palsafar.test',
      name: 'Winner',
      avatar: null,
      emailVerified: true,
      permission: Role.USER,
      activeMode: Role.USER,
    });
    store.seedAccount({
      id: 'a-win',
      userId: 'winner',
      provider: 'google',
      providerAccountId: 'sub-1',
      email: 'race@palsafar.test',
    });

    const first = await resolveGoogleAccount(identity({ email: 'race@palsafar.test' }), store.db as any);
    const second = await resolveGoogleAccount(identity({ email: 'race@palsafar.test' }), store.db as any);
    expect(first.userId).toBe('winner');
    expect(second.userId).toBe('winner');
    expect(store.users.size).toBe(1);
  });

  it('does not apply client-supplied role or points — only Google identity + PalSafar defaults', async () => {
    const forged = identity();
    (forged as any).role = 'ADMIN';
    (forged as any).permission = 'ADMIN';
    (forged as any).userId = 'attacker';
    (forged as any).points = 99999;
    const result = await resolveGoogleAccount(forged, store.db as any);
    const created = store.users.get(result.userId);
    expect(created?.permission).toBe(Role.USER);
    expect(created?.activeMode).toBe(Role.USER);
    expect((created as any).points).toBeUndefined();
  });

  it('surfaces a controlled conflict when a Google sub is already owned by another user during link', async () => {
    store.seedUser({
      id: 'owner',
      email: 'owner@palsafar.test',
      name: 'Owner',
      avatar: null,
      emailVerified: true,
      permission: Role.USER,
      activeMode: Role.USER,
    });
    store.seedUser({
      id: 'email-user',
      email: 'shared@palsafar.test',
      name: 'Email User',
      avatar: null,
      emailVerified: true,
      permission: Role.USER,
      activeMode: Role.USER,
    });
    store.seedAccount({
      id: 'owned',
      userId: 'owner',
      provider: 'google',
      providerAccountId: 'sub-1',
      email: 'owner@palsafar.test',
    });

    const result = await resolveGoogleAccount(
      identity({ email: 'shared@palsafar.test', sub: 'sub-1' }),
      store.db as any,
    );
    expect(result.userId).toBe('owner');
    expect(result.created).toBe(false);
  });
});
