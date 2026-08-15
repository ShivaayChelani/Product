import AsyncStorage from '@react-native-async-storage/async-storage';
import { UserActiveMode, UserPermission, UserProfile } from '../types';
import { DEV_FLAGS } from '../config/devFlags';
import { apiClient, authApi } from './api';

const AUTH_SESSION_KEY = '@palsasafar_session';
const AUTH_USER_KEY = '@palsasafar_auth_user';

interface Session {
  userId: string;
  email: string;
  role: 'tourist' | 'vendor' | 'creator' | 'admin';
  expiresAt: number;
}

function defaultUserProfile(uid: string, displayName: string, email: string, role: 'tourist' | 'vendor' | 'creator' | 'admin'): UserProfile {
  return {
    uid,
    email,
    phoneNumber: '',
    displayName,
    avatarStyle: 0,
    role,
    totalPoints: 0,
    visitedSpots: [],
    currentItinerary: [],
    completedItineraryStops: [],
    completedActivities: [],
    redemptions: [],
    createdAt: Date.now(),
    lastActive: Date.now(),
  };
}

function mapApiRole(role: string): 'tourist' | 'vendor' | 'creator' | 'admin' {
  if (role === 'ADMIN') return 'admin';
  if (role === 'VENDOR') return 'vendor';
  if (role === 'CONTENT_CREATOR') return 'creator';
  return 'tourist';
}

function normalizeRoles(apiUser: any): string[] {
  const fromApproved = Array.isArray(apiUser?.approvedRoles) ? apiUser.approvedRoles : null;
  const fromRoles = Array.isArray(apiUser?.roles) ? apiUser.roles : null;
  const fromAssignments = Array.isArray(apiUser?.roleAssignments)
    ? apiUser.roleAssignments
        .filter((a: any) => a?.status === 'ACTIVE' || a?.status === 'APPROVED')
        .map((a: any) => a.role)
    : null;
  const roles: unknown[] = fromApproved || fromRoles || fromAssignments || [apiUser?.role || 'USER'];
  const normalized = [...new Set(roles.filter(Boolean).map((value) => String(value).toUpperCase()))];
  if (!normalized.includes('USER') && !normalized.includes('ADMIN')) {
    normalized.unshift('USER');
  }
  return normalized;
}

function normalizePermission(apiUser: any, roles: string[]): UserPermission {
  if (apiUser?.permission) return String(apiUser.permission) as UserPermission;
  if (roles.includes('ADMIN')) return 'ADMIN';
  if (roles.includes('VENDOR')) return 'VENDOR';
  if (roles.includes('CONTENT_CREATOR')) return 'CONTENT_CREATOR';
  return 'USER';
}

function normalizeActiveMode(apiUser: any, _permission: UserPermission, _roles: string[]): UserActiveMode {
  const explicit = String(apiUser?.activeMode || apiUser?.activeRole || '').toUpperCase();
  if (explicit === 'CREATOR' || explicit === 'CONTENT_CREATOR') return 'CONTENT_CREATOR';
  if (explicit === 'VENDOR' || explicit === 'ADMIN' || explicit === 'USER') return explicit as UserActiveMode;
  // Legacy sessions: never infer creator/vendor shell from permission alone
  return 'USER';
}

function mapCreatorProfile(raw: any): UserProfile['creatorProfile'] | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  return {
    id: raw.id,
    username: raw.username,
    fullName: raw.fullName ?? null,
    bio: raw.bio || undefined,
    travelCategories: raw.travelCategories || [],
    instagramUrl: raw.instagramUrl ?? null,
    youtubeUrl: raw.youtubeUrl ?? null,
    sampleReelUrl: raw.sampleReelUrl ?? null,
    applicationReason: raw.applicationReason ?? null,
    rejectionReason: raw.rejectionReason ?? null,
    status: raw.status || 'PENDING',
    followerCount: raw.followerCount || 0,
    totalViews: raw.totalViews || 0,
    verified: !!raw.verified,
  };
}

function buildProfileFromApiUser(apiUser: any): UserProfile {
  let visitedSpots: string[] = [];
  if (Array.isArray(apiUser?.checkIns)) {
    visitedSpots = apiUser.checkIns.map((c: any) => c.placeId).filter(Boolean);
  }
  const roles = normalizeRoles(apiUser);
  const permission = normalizePermission(apiUser, roles);
  const activeMode = normalizeActiveMode(apiUser, permission, roles);
  const role = mapApiRole(activeMode);
  return {
    ...defaultUserProfile(apiUser.id, apiUser.name, apiUser.email, role),
    visitedSpots,
    reviewsCount: apiUser?._count?.reviews || 0,
    bio: apiUser?.bio || undefined,
    avatar: apiUser?.avatar || undefined,
    avatarStyle: apiUser?.avatarStyle ?? 0,
    interests: apiUser?.interests || [],
    roles,
    permission,
    activeMode,
    // Temporary compatibility for unconverted screens and persisted sessions.
    activeRole: activeMode,
    creatorProfile: mapCreatorProfile(apiUser?.creatorProfile),
    vendor: apiUser?.vendor
      ? {
          id: apiUser.vendor.id,
          businessName: apiUser.vendor.businessName,
          status: apiUser.vendor.status,
          vendorCode: apiUser.vendor.vendorCode || undefined,
        }
      : undefined,
  };
}

export async function persistAuthUser(profile: UserProfile, sessionRole?: Session['role']): Promise<void> {
  const session: Session = {
    userId: profile.uid,
    email: profile.email || '',
    role: sessionRole || profile.role,
    expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
  };
  await AsyncStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session));
  await AsyncStorage.setItem(AUTH_USER_KEY, JSON.stringify(profile));
}

export async function login(
  email: string,
  password: string
): Promise<{ user: UserProfile; session: Session } | null> {
  if (!DEV_FLAGS.USE_SERVER_API) {
    throw new Error('Server API is required. Set USE_SERVER_API=true in devFlags.');
  }

  try {
    const result = await authApi.login({ email, password });
    await apiClient.setToken(result.accessToken);

    const profile = buildProfileFromApiUser(result.user);
    await persistAuthUser(profile);
    return { user: profile, session: {
      userId: profile.uid,
      email: result.user.email,
      role: profile.role,
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
    }};
  } catch (e: any) {
    if (e.status === 401) return null;
    // Let UserContext redirect unverified accounts to EmailVerification.
    if (e.status === 403 && (e.code === 'EMAIL_NOT_VERIFIED' || e.details?.requiresEmailVerification)) {
      throw e;
    }
    const msg = e?.message || '';
    if (e.status === 429 || msg.toLowerCase().includes('too many login')) {
      const rateLimitError = new Error('Please try again in a moment.') as Error & { status: number };
      rateLimitError.status = 429;
      throw rateLimitError;
    }
    if (e.name === 'AbortError' || msg.includes('timed out') || msg.includes('Network request failed')) {
      const networkError = new Error('Cannot reach the server. Make sure the API is running and your device can connect to it.') as Error & { cause?: unknown };
      networkError.cause = e;
      throw networkError;
    }
    throw e;
  }
}

export async function signup(
  name: string,
  email: string,
  password: string
): Promise<
  | { requiresEmailVerification: true; email: string; name: string }
  | { requiresEmailVerification: false; user: UserProfile; session: Session }
  | null
> {
  if (!DEV_FLAGS.USE_SERVER_API) {
    throw new Error('Server API is required. Set USE_SERVER_API=true in devFlags.');
  }

  try {
    const result = await authApi.register({ name, email, password });
    if (result.requiresEmailVerification) {
      return {
        requiresEmailVerification: true,
        email: result.email,
        name: result.name,
      };
    }

    const sessionPayload = result.session;
    const profile = buildProfileFromApiUser({ ...sessionPayload.user, name, email });
    const role = profile.role;
    const session: Session = {
      userId: profile.uid,
      email,
      role,
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
    };
    await AsyncStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session));
    await AsyncStorage.setItem(AUTH_USER_KEY, JSON.stringify(profile));
    return { requiresEmailVerification: false, user: profile, session };
  } catch (e: any) {
    if (e.status === 409) return null;
    throw e;
  }
}

export async function verifyRegisterEmail(
  email: string,
  token: string,
): Promise<{ user: UserProfile; session: Session } | null> {
  try {
    const result = await authApi.verifyRegisterEmail(email, token);
    const profile = buildProfileFromApiUser(result.user);
    await persistAuthUser(profile);
    return {
      user: profile,
      session: {
        userId: profile.uid,
        email: result.user.email,
        role: profile.role,
        expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
      },
    };
  } catch (e: any) {
    if (e.status === 400 || e.status === 401) return null;
    throw e;
  }
}

export async function resendRegisterOtp(email: string): Promise<boolean> {
  await authApi.resendRegisterOtp(email);
  return true;
}

export async function logout(): Promise<void> {
  await authApi.logout();
  await AsyncStorage.removeItem(AUTH_SESSION_KEY);
  await AsyncStorage.removeItem(AUTH_USER_KEY);
}

export async function restoreSession(): Promise<UserProfile | null> {
  try {
    await apiClient.init();
    const token = apiClient.getToken();
    if (!token) {
      return null;
    }
    try {
      // Force JWT role refresh so post-approval UserRole matches the access token.
      await apiClient.forceRefreshAccessToken();
      const resultUser = await authApi.getProfile();
      const profile = buildProfileFromApiUser(resultUser);
      await persistAuthUser(profile);
      return profile;
    } catch (err) {
      await apiClient.setToken(null);
      await AsyncStorage.removeItem(AUTH_SESSION_KEY);
      await AsyncStorage.removeItem(AUTH_USER_KEY);
      return null;
    }
  } catch (err) {
    return null;
  }
}

export async function forgotPassword(email: string): Promise<boolean> {
  try {
    await authApi.forgotPassword(email);
    // Backend always soft-succeeds for unknown emails (anti-enumeration).
    return true;
  } catch (err) {
    // Network / server failure — not "account missing".
    throw err instanceof Error ? err : new Error('Unable to send verification code. Please try again.');
  }
}

export async function verifyResetOtp(email: string, token: string): Promise<string | null> {
  try {
    const data = await authApi.verifyResetOtp(email, token);
    return data?.resetSessionToken ?? null;
  } catch (err) {
    return null;
  }
}

export async function resetPassword(input: { email: string; token: string; passwordStr: string }): Promise<boolean> {
  try {
    await authApi.resetPassword({
      email: input.email,
      token: input.token,
      password: input.passwordStr,
    });
    return true;
  } catch (err) {
    return false;
  }
}

export async function updateUserProfile(uid: string, updates: Partial<UserProfile>): Promise<void> {
  if (DEV_FLAGS.USE_SERVER_API && uid !== 'guest-user') {
    try {
      const serverUpdates: any = {};
      if (updates.displayName !== undefined) serverUpdates.name = updates.displayName;
      if (updates.bio !== undefined) serverUpdates.bio = updates.bio;
      if (updates.interests !== undefined) serverUpdates.interests = updates.interests;
      if (updates.travelInterests !== undefined) serverUpdates.interests = updates.travelInterests;
      if (updates.avatarStyle !== undefined) serverUpdates.avatarStyle = updates.avatarStyle;
      if (updates.avatar !== undefined) serverUpdates.avatar = updates.avatar;

      await authApi.updateProfile(serverUpdates);
    } catch (err) {
    }
  }

  const userRaw = await AsyncStorage.getItem(AUTH_USER_KEY);
  if (userRaw) {
    const existing = JSON.parse(userRaw);
    await AsyncStorage.setItem(AUTH_USER_KEY, JSON.stringify({ ...existing, ...updates }));
  }
}

export async function setActiveMode(activeMode: UserActiveMode): Promise<UserProfile> {
  // Server JWT + roles are authoritative. Never persist a local-only mode/role.
  const apiUser = await authApi.setActiveMode(activeMode);
  const raw = await AsyncStorage.getItem(AUTH_USER_KEY);
  const existing = raw ? JSON.parse(raw) : {};
  const profile = buildProfileFromApiUser({ ...apiUser, activeMode });
  const merged: UserProfile = {
    ...existing,
    ...profile,
    creatorProfile: profile.creatorProfile ?? existing.creatorProfile,
    vendor: profile.vendor ?? existing.vendor,
    activeMode: (profile.activeMode || activeMode) as UserActiveMode,
    activeRole: (profile.activeMode || activeMode) as UserActiveMode,
    roles: profile.roles?.length ? profile.roles : existing.roles,
  };
  await persistAuthUser(merged);
  return merged;
}

/**
 * Re-issue access token (roles refreshed from DB) + reload profile.
 * Call after specialty approval so JWT matches server UserRole assignments.
 */
export async function refreshSessionRoles(): Promise<UserProfile | null> {
  try {
    await apiClient.init();
    const ok = await apiClient.forceRefreshAccessToken();
    if (!ok) return null;
    const resultUser = await authApi.getProfile();
    const profile = buildProfileFromApiUser(resultUser);
    await persistAuthUser(profile);
    return profile;
  } catch (err) {
    return null;
  }
}

/** Temporary mobile compatibility alias. */
export const setActiveRole = setActiveMode;

export function convertToUserProfile(data: { uid: string; displayName?: string; email?: string; role?: string }): UserProfile {
  return defaultUserProfile(data.uid, data.displayName || 'User', data.email || '', (data.role as any) || 'tourist');
}