/**
 * Decide which actions a reel's author card should offer.
 *
 * This is a pure function rather than inline JSX conditionals so the rule is
 * testable without a renderer, and so it cannot drift from the component that
 * consumes it.
 *
 * The rule:
 * - A reel with no vendor gets no business actions, and keeps its Follow button.
 * - A vendor reel gets Like / Share / Directions. A business is not "followable"
 *   like a creator, so Follow is suppressed in favour of the action row.
 * - A vendor without usable coordinates gets Like / Share but no Directions.
 *   Omitting the button beats rendering one that routes nowhere, which is what
 *   happens if `0,0` or a swapped pair reaches the router.
 */
import { isValidLatLng } from '../../services/location/distance';

export type ReelVendorActions = {
  isLiked: boolean;
  onLike: () => void;
  onShare: () => void;
  onDirections?: () => void;
};

type VendorLike = {
  latitude?: number | null;
  longitude?: number | null;
} | null | undefined;

/** True when the vendor's own coordinates could be routed to. */
export function vendorHasRouteableLocation(vendor: VendorLike): boolean {
  return isValidLatLng(vendor?.latitude, vendor?.longitude);
}

export function resolveReelVendorActions(params: {
  vendor: VendorLike;
  isLiked: boolean;
  /** Whether the host screen supplied a directions handler at all. */
  canRoute: boolean;
  onLike: () => void;
  onShare: () => void;
  onDirections: () => void;
}): ReelVendorActions | undefined {
  const { vendor, isLiked, canRoute, onLike, onShare, onDirections } = params;
  if (!vendor) return undefined;

  return {
    isLiked,
    onLike,
    onShare,
    ...(canRoute && vendorHasRouteableLocation(vendor) ? { onDirections } : {}),
  };
}