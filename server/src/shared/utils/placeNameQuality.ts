/**
 * Reject Wikidata/OSM junk that is NOT a visitable tourist destination.
 * e.g. "108 Shiva Temples", "(I) Jain Tirthankara Image (Ii) Remains..."
 */

const ROMAN_INVENTORY = /\(\s*[ivxlc]+\s*\)/i;

/** Real UNESCO / ASI site names that look like groups but are one destination. */
const GENUINE_GROUP_NAMES = [
  /^group of monuments at\b/i,
  /^group of temples at\b/i,
  /^group of temples,?\s+\w/i,
];

const JUNK_NAME_PATTERNS = [
  // Archaeological inventory lists
  /^\(\s*[ivxlc]+\s*\)/i,
  /\(\s*i{1,3}\s*\).*\(\s*i{1,3}\s*\)/i,
  /\bremains of the (temple|fort|palace|building)\b/i,
  /\btirthankara image\b/i,
  /\bganesa image\b/i,
  /\bnandi with inscriptions\b/i,
  /\bimage \(ii\)\b/i,
  /\bsculpture of\b/i,
  /\bfragment of\b/i,
  /\brubble of\b/i,
  /\bfoundation of\b/i,
  /\bportion of\b/i,
  /\bportion of (the )?wall\b/i,

  // Numbered temple/place collections — not one destination
  /^\d+\s+(shiva\s+)?temples?\b/i,
  /^\d+\s+divya\s+desams?\b/i,
  /^\d+\s+jyotirlinga\b/i,
  /^\d+\s+shakti\s+peethas?\b/i,
  /^\d+\s+(jain\s+)?temples?\b/i,
  /^\d+\s+(mosques?|churches?|forts?|palaces?|ghats?|caves?|waterfalls?)\b/i,
  /^\d+\s+\w[\w\s-]{0,30}\s+temples?\b/i,

  // Generic plural groups (not UNESCO "Group of monuments at X")
  /^group of (temples|structures)\b/i,
  /^collection of\b/i,
  /^list of\b/i,
  /^series of\b/i,

  // Unnamed / placeholder
  /^unnamed\b/i,
  /^unknown (temple|monument|fort)\b/i,
  /^temple$/i,
  /^mosque$/i,
  /^church$/i,
  /^fort$/i,
  /^monument$/i,
  /^mandir$/i,
  /^masjid$/i,
];

/** Names too long with multiple inventory markers = archaeological report, not place name. */
function isInventoryReportName(name: string): boolean {
  if (name.length < 80) return false;
  const romanHits = (name.match(/\(\s*[ivxlc]+\s*\)/gi) || []).length;
  return romanHits >= 2 || (romanHits >= 1 && name.length > 100);
}

export function isJunkPlaceName(name: string): boolean {
  const n = String(name || '').trim();
  if (n.length < 2) return true;

  if (GENUINE_GROUP_NAMES.some((re) => re.test(n))) return false;

  if (JUNK_NAME_PATTERNS.some((re) => re.test(n))) return true;
  if (isInventoryReportName(n)) return true;

  if (/^\d+\s+shiva\s+temples?\b/i.test(n)) return true;

  if (ROMAN_INVENTORY.test(n) && (n.match(/\(\s*[ivxlc]+\s*\)/gi) || []).length >= 2) {
    return true;
  }

  return false;
}

export function hasProperPlaceName(name: string): boolean {
  const n = String(name || '').trim();
  if (isJunkPlaceName(n)) return false;
  // Real places usually have a proper noun, not just category words
  if (n.length < 3) return false;
  return true;
}
