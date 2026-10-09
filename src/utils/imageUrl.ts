/** Returns true when a remote/local image URI is present and non-empty. */
export function hasValidImageUrl(url?: string | null): url is string {
  return typeof url === 'string' && url.trim().length > 0;
}

/** RN/Fresco downsample hint for a remote image of known on-screen size. */
export function sizedImageSource(uri: string, width: number, height: number) {
  return {
    uri,
    width: Math.max(1, Math.round(width)),
    height: Math.max(1, Math.round(height)),
  };
}

export const IMAGE_COMING_SOON_LABEL = 'Image coming soon';
