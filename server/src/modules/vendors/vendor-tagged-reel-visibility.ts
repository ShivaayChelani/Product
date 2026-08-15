/** Whether a creator reel tagged to a business may appear on that vendor's public map / profile card. */
export function isTaggedReelPublicOnVendorCard(input: {
  vendorId?: string | null;
  status?: string | null;
  vendorListingStatus?: string | null;
}): boolean {
  if (!input.vendorId) return false;
  if (input.status && input.status !== 'APPROVED') return false;
  return input.vendorListingStatus === 'APPROVED';
}
