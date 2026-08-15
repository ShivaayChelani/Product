import type { UserActiveMode, UserProfile } from '../types';

export function isCreatorApproved(user?: UserProfile | null): boolean {
  if (!user) return false;
  const roles = user.roles || [];
  return (
    roles.includes('CONTENT_CREATOR')
    || user.permission === 'CONTENT_CREATOR'
    || user.creatorProfile?.status === 'APPROVED'
  );
}

export function isVendorApproved(
  user?: UserProfile | null,
  vendorVerificationStatus?: string | null,
): boolean {
  if (!user) return false;
  const roles = user.roles || [];
  const authStatus = String((user as any).vendor?.status || '').toUpperCase();
  const extStatus = String(vendorVerificationStatus || '').toUpperCase();
  return (
    roles.includes('VENDOR')
    || user.permission === 'VENDOR'
    || authStatus === 'APPROVED'
    || extStatus === 'APPROVED'
  );
}

export function getSwitchableModes(
  user?: UserProfile | null,
  vendorVerificationStatus?: string | null,
): UserActiveMode[] {
  const modes: UserActiveMode[] = ['USER'];
  const creatorApproved = isCreatorApproved(user);
  const vendorApproved = isVendorApproved(user, vendorVerificationStatus);

  if (creatorApproved) {
    modes.push('CONTENT_CREATOR');
  } else if (vendorApproved) {
    modes.push('VENDOR');
  }
  return modes;
}

export function isCreatorPending(user?: UserProfile | null): boolean {
  return user?.creatorProfile?.status === 'PENDING';
}

export function isVendorPending(
  user?: UserProfile | null,
  vendorVerificationStatus?: string | null,
): boolean {
  if (!user) return false;
  const authStatus = String((user as { vendor?: { status?: string } }).vendor?.status || '').toUpperCase();
  const extStatus = String(vendorVerificationStatus || '').toUpperCase();
  return authStatus === 'PENDING' || extStatus === 'PENDING';
}

function isCreatorHeld(user?: UserProfile | null): boolean {
  if (!user) return false;
  const status = user.creatorProfile?.status;
  return (
    isCreatorApproved(user)
    || status === 'PENDING'
    || status === 'CHANGES_REQUESTED'
    || status === 'SUSPENDED'
    || status === 'PAUSED'
  );
}

function isVendorHeld(
  user?: UserProfile | null,
  vendorVerificationStatus?: string | null,
): boolean {
  if (!user) return false;
  const authStatus = String((user as { vendor?: { status?: string } }).vendor?.status || '').toUpperCase();
  const extStatus = String(vendorVerificationStatus || '').toUpperCase();
  const vendorStatus = extStatus || authStatus;
  return (
    isVendorApproved(user, vendorVerificationStatus)
    || authStatus === 'PENDING'
    || extStatus === 'PENDING'
    || ['CHANGES_REQUESTED', 'SUSPENDED', 'PAUSED'].includes(vendorStatus)
  );
}

/** Show "Become a Creator" — not when any workspace is already approved or an application is in flight. */
export function canShowCreatorApply(
  user?: UserProfile | null,
  vendorVerificationStatus?: string | null,
): boolean {
  if (!user) return false;
  if (isCreatorApproved(user) || isVendorApproved(user, vendorVerificationStatus)) return false;
  return !isCreatorHeld(user) && !isVendorHeld(user, vendorVerificationStatus);
}

/** Show "Become a Vendor" — same exclusivity rules as creator apply. */
export function canShowVendorApply(
  user?: UserProfile | null,
  vendorVerificationStatus?: string | null,
): boolean {
  if (!user) return false;
  if (isCreatorApproved(user) || isVendorApproved(user, vendorVerificationStatus)) return false;
  return !isVendorHeld(user, vendorVerificationStatus) && !isCreatorHeld(user);
}
