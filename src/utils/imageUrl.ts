/** Returns true when a remote/local image URI is present and non-empty. */
export function hasValidImageUrl(url?: string | null): url is string {
  return typeof url === 'string' && url.trim().length > 0;
}

export const IMAGE_COMING_SOON_LABEL = 'Image coming soon';
