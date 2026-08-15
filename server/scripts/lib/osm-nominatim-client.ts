import type { OsmExtract } from './factual-enrichment-types';
import { pipelineFetch } from './pipeline-reliability/http-agent';

const USER_AGENT = 'PalSafar-FactualEnrichment/1.0 (https://palsafar.com; ops@palsafar.local)';

async function fetchJson<T>(url: string, timeoutMs = 90_000): Promise<T | null> {
  const res = await pipelineFetch(url, { headers: { 'User-Agent': USER_AGENT }, timeoutMs });
  try {
    if (!res.ok) return null;
    return (await res.json()) as T;
  } finally {
    await res.body?.cancel?.().catch(() => undefined);
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export function parseOsmExternalId(externalId: string): { type: 'node' | 'way' | 'relation'; id: string } | null {
  const m = externalId.match(/^osm:(node|way|relation)[/:](\d+)$/i)
    || externalId.match(/^osm:(\d+)$/i);
  if (!m) return null;
  if (m.length === 3) return { type: m[1].toLowerCase() as 'node' | 'way' | 'relation', id: m[2] };
  return { type: 'node', id: m[1] };
}

function mapOsmTags(t: Record<string, string>): OsmExtract {
  return {
    openingHours: t.opening_hours || t['opening_hours:covid19'] || undefined,
    openingHoursSigned: t['opening_hours:signed'] || undefined,
    fee: t.fee || undefined,
    feeConditional: t['fee:conditional'] || undefined,
    charge: t.charge || undefined,
    website: t.website || t['contact:website'] || undefined,
    bookingUrl: t.booking || t['contact:booking'] || t['url:booking'] || undefined,
    phone: t.phone || t['contact:phone'] || t['contact:mobile'] || undefined,
    email: t.email || t['contact:email'] || undefined,
    emergencyPhone: t.emergency || t['contact:emergency'] || undefined,
    wheelchair: t.wheelchair || undefined,
    parking: t.parking || undefined,
    parkingFee: t['parking:fee'] || undefined,
    toilets: t.toilets || t['toilets:wheelchair'] || undefined,
    drinkingWater: t.drinking_water || undefined,
    food: t.food || undefined,
    restaurant: t.restaurant || undefined,
    cafe: t.cafe || undefined,
    guide: t.guide || undefined,
    audioguide: t.audioguide || undefined,
    guidedTour: t.guided_tour || undefined,
    camera: t.camera || t.photo || undefined,
    video: t.video || undefined,
    drone: t.drone || undefined,
    dog: t.dog || t.dogs || undefined,
    petsAllowed: t.pets_allowed || undefined,
    locker: t.locker || undefined,
    boat: t.boat || t.boats || undefined,
    safari: t.safari || undefined,
    campSite: t.camp_site || t.camping || undefined,
    aerialway: t.aerialway || undefined,
    birdHide: t.bird_hide || undefined,
    publicTransport: t.public_transport || t.bus || undefined,
    nameHi: t['name:hi'] || undefined,
    addrCity: t['addr:city'] || t['addr:town'] || undefined,
    addrVillage: t['addr:village'] || t['addr:hamlet'] || t['addr:suburb'] || undefined,
    addrState: t['addr:state'] || undefined,
    addrDistrict: t['addr:district'] || undefined,
    addrPostcode: t['addr:postcode'] || undefined,
    wikipedia: t.wikipedia || undefined,
    wikidata: t.wikidata || undefined,
    tourism: t.tourism || undefined,
    historic: t.historic || undefined,
    amenity: t.amenity || undefined,
    religion: t.religion || undefined,
    denomination: t.denomination || undefined,
  };
}

let lastOsmAt = 0;

export async function fetchOsmTags(externalId: string): Promise<OsmExtract | null> {
  const now = Date.now();
  const wait = Math.max(0, 350 - (now - lastOsmAt));
  if (wait > 0) await sleep(wait);
  lastOsmAt = Date.now();

  const parsed = parseOsmExternalId(externalId);
  if (!parsed) return null;

  const url = `https://api.openstreetmap.org/api/0.6/${parsed.type}/${parsed.id}.json`;
  const json = await fetchJson<{ elements?: { tags?: Record<string, string> }[] }>(url);
  if (!json) return null;
  const tags = json.elements?.[0]?.tags;
  if (!tags || typeof tags !== 'object') return null;

  return mapOsmTags(tags as Record<string, string>);
}

let lastNominatimAt = 0;

export async function reverseGeocodeNominatim(
  lat: number,
  lng: number,
  opts?: { timeoutMs?: number },
): Promise<import('./factual-enrichment-types').NominatimExtract | null> {
  const now = Date.now();
  const wait = Math.max(0, 1100 - (now - lastNominatimAt));
  if (wait > 0) await sleep(wait);
  lastNominatimAt = Date.now();

  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lng),
    format: 'jsonv2',
    addressdetails: '1',
    zoom: '10',
  });
  const url = `https://nominatim.openstreetmap.org/reverse?${params}`;
  const json = await fetchJson<{
    display_name?: string;
    address?: Record<string, string>;
  }>(url, opts?.timeoutMs ?? 25_000);
  if (!json) return null;
  const addr = json.address || {};
  const city =
    addr.city || addr.town || addr.village || addr.hamlet || addr.suburb || addr.county || undefined;
  const village = addr.village || addr.hamlet || addr.suburb || undefined;
  const district = addr.state_district || addr.district || addr.county || undefined;
  const state = addr.state || undefined;
  const country = addr.country || undefined;
  const postcode = addr.postcode || undefined;

  return {
    city,
    village,
    district,
    state,
    country,
    postcode,
    fullAddress: json.display_name,
    sourceUri: url,
  };
}
