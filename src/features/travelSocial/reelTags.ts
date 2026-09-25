export const REEL_TAGS: ReadonlyArray<{ label: string; icon: string }> = [
  { label: 'Travel', icon: 'briefcase-outline' },
  { label: 'Food', icon: 'restaurant-outline' },
  { label: 'Adventure', icon: 'triangle-outline' },
  { label: 'History', icon: 'library-outline' },
  { label: 'Hidden Gems', icon: 'diamond-outline' },
  { label: 'Events', icon: 'calendar-outline' },
  { label: 'Shopping', icon: 'bag-handle-outline' },
  { label: 'Temple', icon: 'business-outline' },
  { label: 'Nature', icon: 'leaf-outline' },
  { label: 'Culture', icon: 'color-palette-outline' },
];

export const REEL_TAG_LABELS: ReadonlyArray<string> = REEL_TAGS.map((t) => t.label);