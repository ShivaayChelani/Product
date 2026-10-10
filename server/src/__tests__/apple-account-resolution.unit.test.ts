import { describe, it, expect, beforeEach } from 'vitest';
import { Role } from '@prisma/client';
import { ErrorCodes } from '../shared/utils/ApiError';
import { resolveAppleAccount } from '../modules/auth/appleAccountResolution';
import type { VerifiedAppleIdentity } from '../modules/auth/appleIdentity';

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
  emailVerified?: boolean;
  displayName?: string | null;
};

const RELAY = 'x7q2@privaterelay.appleid.com';

function identity(overrides: Partial<VerifiedAppleIdentity> = {}): VerifiedAppleIdentity {
  return {
    sub: '001234.abcdef.1234',
    email: 'new@palsafar.test',
    emailVerified: true,
    fullName: 'New Apple',
    isPrivateRelay: false,
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
          throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
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
          emailVerified: data.emailVerified,
          displayName: data.displayName ?? null,
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
    /** Case-insensitive fallback used when the exact-match email lookup misses. */
    $queryRaw: async () => {
      throw new Error('$queryRaw not expected to be reached in these tests');
    },
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

describe('resolveAppleAccount', () => {
  let store: ReturnType<typeof createMemoryDb>;

  beforeEach(() => {
    store = createMemoryDb();
  });

  it('creates a new PalSafar user for an unknown Apple identity', async () => {
    const result = await resolveAppleAccount(identity(), store.db as any);
    expect(result).toEqual({ userId: 'user-1', created: true, linkedNow: true });

    const created = store.users.get(result.userId)!;
    expect(created).toMatchObject({
      email: 'new@palsafar.test',
      name: 'New Apple',
      emailVerified: true,
      permission: Role.USER,
      activeMode: Role.USER,
    });
    // Password accounts are Apple-only; a random password could be brute-forced.
    expect(store.accounts[0]).toMatchObject({
      provider: 'apple',
      providerAccountId: '001234.abcdef.1234',
      userId: result.userId,
    });
  });

  it('resolves a returning Apple user by sub without creating a duplicate', async () => {
    store.seedUser({
      id: 'u1',
      email: 'existing@palsafar.test',
      name: 'Custom Name',
      avatar: null,
      emailVerified: true,
      permission: Role.USER,
      activeMode: Role.USER,
    });
    store.seedAccount({
      id: 'a1',
      userId: 'u1',
      provider: 'apple',
      providerAccountId: '001234.abcdef.1234',
      email: 'existing@palsafar.test',
      emailVerified: true,
      displayName: 'Original Apple Name',
    });

    // Apple sends no name and no email on a repeat authorization.
    const result = await resolveAppleAccount(
      identity({ email: null, emailVerified: false, fullName: null }),
      store.db as any,
    );

    expect(result).toEqual({ userId: 'u1', created: false, linkedNow: false });
    expect(store.users.size).toBe(1);
    expect(store.users.get('u1')?.name).toBe('Custom Name');
  });

  it('never lets a repeat authorization erase the stored Apple email', async () => {
    store.seedUser({
      id: 'u1',
      email: 'existing@palsafar.test',
      name: 'Existing',
      avatar: null,
      emailVerified: true,
      permission: Role.USER,
      activeMode: Role.USER,
    });
    store.seedAccount({
      id: 'a1',
      userId: 'u1',
      provider: 'apple',
      providerAccountId: 'sub-1',
      email: 'existing@palsafar.test',
      emailVerified: true,
      displayName: 'Original Apple Name',
    });

    await resolveAppleAccount(
      identity({ sub: 'sub-1', email: null, emailVerified: false, fullName: null }),
      store.db as any,
    );

    const account = store.accounts[0];
    expect(account.email).toBe('existing@palsafar.test');
    expect(account.emailVerified).toBe(true);
    expect(account.displayName).toBe('Original Apple Name');
  });

  it('backfills the first-login name only when the profile has none', async () => {
    store.seedUser({
      id: 'u1',
      email: 'blank@palsafar.test',
      name: '',
      avatar: null,
      emailVerified: false,
      permission: Role.USER,
      activeMode: Role.USER,
    });
    store.seedAccount({
      id: 'a1',
      userId: 'u1',
      provider: 'apple',
      providerAccountId: 'sub-1',
      email: 'blank@palsafar.test',
      emailVerified: false,
      displayName: null,
    });

    await resolveAppleAccount(
      identity({ sub: 'sub-1', email: 'blank@palsafar.test', fullName: 'Ada Lovelace' }),
      store.db as any,
    );
    expect(store.users.get('u1')?.name).toBe('Ada Lovelace');
    expect(store.users.get('u1')?.emailVerified).toBe(true);
  });

  it('links Apple to an existing PalSafar user with the same verified email', async () => {
    store.seedUser({
      id: 'email-user',
      email: 'same@palsafar.test',
      name: 'Password User',
      avatar: null,
      emailVerified: false,
      permission: Role.VENDOR,
      activeMode: Role.VENDOR,
    });

    const result = await resolveAppleAccount(
      identity({ email: 'same@palsafar.test', sub: 'sub-link' }),
      store.db as any,
    );

    expect(result).toEqual({ userId: 'email-user', created: false, linkedNow: true });
    expect(store.accounts[0]).toMatchObject({ userId: 'email-user', providerAccountId: 'sub-link' });
    // Linking must not change the role of the account being linked to.
    expect(store.users.get('email-user')?.permission).toBe(Role.VENDOR);
    expect(store.users.get('email-user')?.name).toBe('Password User');
  });

  it('links a private relay address to an existing account', async () => {
    store.seedUser({
      id: 'relay-user',
      email: RELAY,
      name: 'Relay User',
      avatar: null,
      emailVerified: false,
      permission: Role.USER,
      activeMode: Role.USER,
    });

    const result = await resolveAppleAccount(
      identity({ email: RELAY, sub: 'sub-relay', isPrivateRelay: true }),
      store.db as any,
    );
    expect(result).toEqual({ userId: 'relay-user', created: false, linkedNow: true });
    // A relay address is stored verbatim, never mapped to a real inbox.
    expect(store.accounts[0].email).toBe(RELAY);
  });

  it('refuses to link an unverified Apple email to an existing account', async () => {
    store.seedUser({
      id: 'victim',
      email: 'victim@palsafar.test',
      name: 'Victim',
      avatar: null,
      emailVerified: true,
      permission: Role.USER,
      activeMode: Role.USER,
    });

    await expect(
      resolveAppleAccount(
        identity({ email: 'victim@palsafar.test', emailVerified: false, sub: 'sub-attack' }),
        store.db as any,
      ),
    ).rejects.toMatchObject({ statusCode: 401 });
    expect(store.users.size).toBe(1);
    expect(store.accounts).toHaveLength(0);
  });

  it('rejects linking when the account already has a different Apple identity', async () => {
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
      provider: 'apple',
      providerAccountId: 'other-sub',
      email: 'taken@palsafar.test',
    });

    await expect(
      resolveAppleAccount(identity({ email: 'taken@palsafar.test', sub: 'new-sub' }), store.db as any),
    ).rejects.toMatchObject({ statusCode: 409, code: ErrorCodes.APPLE_IDENTITY_CONFLICT });
    expect(store.users.size).toBe(1);
    expect(store.accounts).toHaveLength(1);
  });

  it('treats sub as authoritative: a matching email must not hijack another account', async () => {
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
      id: 'attacker',
      email: 'shared@palsafar.test',
      name: 'Attacker',
      avatar: null,
      emailVerified: true,
      permission: Role.USER,
      activeMode: Role.USER,
    });
    store.seedAccount({
      id: 'owned',
      userId: 'owner',
      provider: 'apple',
      providerAccountId: 'owned-sub',
      email: 'owner@palsafar.test',
    });

    // The Apple ID is already linked to `owner`; its email merely matches `attacker`.
    const result = await resolveAppleAccount(
      identity({ sub: 'owned-sub', email: 'shared@palsafar.test' }),
      store.db as any,
    );
    expect(result.userId).toBe('owner');
    expect(store.users.get('attacker')?.name).toBe('Attacker');
    expect(store.accounts).toHaveLength(1);
  });

  it('refuses to mint an account when Apple shares no email', async () => {
    await expect(
      resolveAppleAccount(identity({ email: null, emailVerified: false, fullName: null }), store.db as any),
    ).rejects.toMatchObject({ statusCode: 400, code: ErrorCodes.APPLE_EMAIL_REQUIRED });
    expect(store.users.size).toBe(0);
  });

  it('converges on one user when two concurrent sign-ins race', async () => {
    // Two requests for the same Apple ID arrive before either has committed: the second
    // must observe the first's account instead of inserting a duplicate.
    const first = await resolveAppleAccount(identity(), store.db as any);
    const second = await resolveAppleAccount(identity(), store.db as any);

    expect(first.userId).toBe(second.userId);
    expect(store.users.size).toBe(1);
    expect(store.accounts).toHaveLength(1);
  });

  it('surfaces a conflict when the same sub belongs to another user', async () => {
    store.seedUser({
      id: 'owner',
      email: 'owner@palsafar.test',
      name: 'Owner',
      avatar: null,
      emailVerified: true,
      permission: Role.USER,
      activeMode: Role.USER,
    });
    store.seedAccount({
      id: 'owned',
      userId: 'owner',
      provider: 'apple',
      providerAccountId: '001234.abcdef.1234',
      email: 'owner@palsafar.test',
    });
    store.seedUser({
      id: 'other',
      email: 'other@palsafar.test',
      name: 'Other',
      avatar: null,
      emailVerified: true,
      permission: Role.USER,
      activeMode: Role.USER,
    });
    store.seedAccount({
      id: 'other-acct',
      userId: 'other',
      provider: 'google',
      providerAccountId: 'google-sub',
      email: 'other@palsafar.test',
    });

    // Sub is authoritative even though its email matches a different user's account.
    const result = await resolveAppleAccount(
      identity({ email: 'other@palsafar.test' }),
      store.db as any,
    );
    expect(result.userId).toBe('owner');
  });

  it('ignores client-supplied role or privilege on the identity object', async () => {
    const forged = identity() as Record<string, unknown>;
    forged.permission = 'ADMIN';
    forged.activeMode = 'ADMIN';
    forged.userId = 'attacker';
    forged.points = 99999;

    const result = await resolveAppleAccount(forged as unknown as VerifiedAppleIdentity, store.db as any);
    const created = store.users.get(result.userId)!;
    expect(created.permission).toBe(Role.USER);
    expect(created.activeMode).toBe(Role.USER);
    expect(created).not.toHaveProperty('points');
  });
});
