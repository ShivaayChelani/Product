/**
 * Canonical Indian state identity for Treasure Hunt location safety.
 *
 * Used only to disambiguate same-named cities/districts across states.
 * State is NEVER treated as a district or city candidate.
 */

const STATE_ALIASES: Record<string, string> = {
  hp: 'himachal pradesh',
  himachal: 'himachal pradesh',
  cg: 'chhattisgarh',
  chattisgarh: 'chhattisgarh',
  uk: 'uttarakhand',
  ua: 'uttarakhand',
  uttaranchal: 'uttarakhand',
  or: 'odisha',
  orissa: 'odisha',
  wb: 'west bengal',
  tn: 'tamil nadu',
  mp: 'madhya pradesh',
  up: 'uttar pradesh',
  ap: 'andhra pradesh',
  ts: 'telangana',
  gj: 'gujarat',
  mh: 'maharashtra',
  rj: 'rajasthan',
  pb: 'punjab',
  hr: 'haryana',
  ka: 'karnataka',
  kn: 'karnataka',
  kl: 'kerala',
  as: 'assam',
  nl: 'nagaland',
  mn: 'manipur',
  mz: 'mizoram',
  tr: 'tripura',
  sk: 'sikkim',
  ml: 'meghalaya',
  ar: 'arunachal pradesh',
  jh: 'jharkhand',
  br: 'bihar',
  ga: 'goa',
  dl: 'delhi',
  nct: 'delhi',
  'nct of delhi': 'delhi',
  'delhi nct': 'delhi',
  jk: 'jammu and kashmir',
  'jammu & kashmir': 'jammu and kashmir',
};

export function canonicalStateKey(state: string | null | undefined): string {
  if (!state) return '';
  const cleaned = String(state)
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\b(?:state|india)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return STATE_ALIASES[cleaned] || cleaned;
}

export function stateKeyEquals(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = canonicalStateKey(a);
  const right = canonicalStateKey(b);
  return Boolean(left && right && left === right);
}
