export const CREATOR_CAPTION_EMOJIS = [
  '😀', '😍', '🥰', '😂', '😊', '😎', '🤩', '🙏',
  '🔥', '✨', '❤️', '💯', '👍', '🎉', '📸', '🎬',
  '📍', '🗺️', '🏞️', '🏔️', '🌊', '🌅', '✈️', '🚗',
  '🍛', '☕', '🍰', '🍦', '🍜', '🥘', '🛍️', '🏛️',
];

export function insertAtCursor(
  text: string,
  insert: string,
  start: number,
  end: number,
): { text: string; cursor: number } {
  const safeStart = Math.max(0, Math.min(start, text.length));
  const safeEnd = Math.max(safeStart, Math.min(end, text.length));
  return {
    text: `${text.slice(0, safeStart)}${insert}${text.slice(safeEnd)}`,
    cursor: safeStart + insert.length,
  };
}
