import { prisma } from '../../../config/database';

/** ISO-like state codes for public Place IDs (PS-IN-{ST}-{DIST}-{seq}). */
const STATE_CODES: Record<string, string> = {
  'andhra pradesh': 'AP',
  'arunachal pradesh': 'AR',
  assam: 'AS',
  bihar: 'BR',
  chhattisgarh: 'CG',
  goa: 'GA',
  gujarat: 'GJ',
  haryana: 'HR',
  'himachal pradesh': 'HP',
  jharkhand: 'JH',
  karnataka: 'KA',
  kerala: 'KL',
  'madhya pradesh': 'MP',
  maharashtra: 'MH',
  manipur: 'MN',
  meghalaya: 'ML',
  mizoram: 'MZ',
  nagaland: 'NL',
  odisha: 'OD',
  punjab: 'PB',
  rajasthan: 'RJ',
  sikkim: 'SK',
  'tamil nadu': 'TN',
  telangana: 'TS',
  tripura: 'TR',
  'uttar pradesh': 'UP',
  uttarakhand: 'UK',
  'west bengal': 'WB',
  delhi: 'DL',
  'jammu and kashmir': 'JK',
  ladakh: 'LA',
};

function districtCode(district: string, city: string): string {
  const base = (district || city || 'GEN').toUpperCase().replace(/[^A-Z0-9]+/g, '');
  return (base.slice(0, 3) || 'GEN').padEnd(3, 'X');
}

export function buildPublicIdPrefix(state: string, district: string, city: string): string {
  const st = STATE_CODES[state.trim().toLowerCase()] || 'IN';
  const dist = districtCode(district, city);
  return `PS-IN-${st}-${dist}`;
}

/** Permanent public ID — assigned once at verification; never reused. */
export async function allocatePublicPlaceId(state: string, district: string, city: string): Promise<string> {
  const prefix = buildPublicIdPrefix(state, district, city);

  const row = await prisma.$transaction(async (tx) => {
    const seq = await tx.placePublicIdSequence.upsert({
      where: { prefix },
      create: { prefix, lastValue: 1 },
      update: { lastValue: { increment: 1 } },
    });
    return seq;
  });

  const seqStr = String(row.lastValue).padStart(6, '0');
  return `${prefix}-${seqStr}`;
}
