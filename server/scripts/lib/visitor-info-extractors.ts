/**
 * Structured visitor / tourism / travel / activity extraction from OSM + Wikidata.
 * Never infers — only maps explicit authoritative tags and properties.
 */
import type { OsmExtract, WikidataExtract } from './factual-enrichment-types';

export type VisitorInfo = {
  openingHoursRaw?: string;
  weeklyClosedNote?: string;
  entryFeeNote?: string;
  indianTicket?: string;
  foreignTicket?: string;
  childrenTicket?: string;
  parkingAvailable?: boolean;
  parkingFee?: string;
  wheelchairAccessible?: string;
  washrooms?: string;
  drinkingWater?: string;
  foodCourt?: boolean;
  restaurant?: boolean;
  cafe?: boolean;
  guideAvailable?: string;
  photographyAllowed?: string;
  videographyAllowed?: string;
  dronePolicy?: string;
  petFriendly?: string;
  lockerFacility?: string;
  ticketBookingUrl?: string;
  officialWebsite?: string;
  officialPhone?: string;
  officialEmail?: string;
  emergencyContact?: string;
  source: string;
};

export type TourismContent = {
  whyFamous?: string;
  architectureStyle?: string;
  builtBy?: string;
  architect?: string;
  constructionYear?: string;
  historicalPeriod?: string;
  unescoStatus?: string;
  asiProtected?: boolean;
  asiDesignation?: string;
  religiousImportance?: string;
  naturalFeature?: string;
  geologicalFeature?: string;
  source: string;
};

export type TravelAccess = {
  nearestRailwayStation?: string;
  nearestRailwayDistanceM?: number;
  nearestAirport?: string;
  nearestAirportDistanceM?: number;
  nearestBusStand?: string;
  nearestBusDistanceM?: number;
  roadAccessibility?: string;
  publicTransport?: string;
  source: string;
};

export type OfficialActivity = {
  activity: string;
  source: string;
  osmTag?: string;
};

function isPresent(v: string | undefined): v is string {
  return v != null && String(v).trim() !== '' && String(v).trim().toLowerCase() !== 'no';
}

function yesNo(v: string | undefined): boolean | undefined {
  if (!v) return undefined;
  const l = v.trim().toLowerCase();
  if (l === 'yes' || l === 'designated' || l === 'permissive') return true;
  if (l === 'no' || l === 'none') return false;
  return undefined;
}

/** Parse OSM fee:conditional for structured ticket hints (explicit tag only). */
function parseFeeConditional(raw: string | undefined): Pick<VisitorInfo, 'indianTicket' | 'foreignTicket' | 'childrenTicket'> {
  if (!raw?.trim()) return {};
  const out: Pick<VisitorInfo, 'indianTicket' | 'foreignTicket' | 'childrenTicket'> = {};
  const parts = raw.split(';').map((p) => p.trim());
  for (const part of parts) {
    const lower = part.toLowerCase();
    if (/foreign|international|non.?indian|nri/.test(lower)) out.foreignTicket = part;
    else if (/child|minor|age\s*<\s*\d+|student/.test(lower)) out.childrenTicket = part;
    else if (/indian|citizen|domestic|default/.test(lower)) out.indianTicket = part;
  }
  return out;
}

export function extractVisitorInfoFromOsm(osm: OsmExtract): Partial<VisitorInfo> {
  const feeParts = parseFeeConditional(osm.feeConditional);
  const info: Partial<VisitorInfo> = {
    source: 'openstreetmap',
  };

  if (isPresent(osm.openingHours)) info.openingHoursRaw = osm.openingHours;
  if (isPresent(osm.openingHoursSigned)) info.weeklyClosedNote = osm.openingHoursSigned;
  if (isPresent(osm.fee)) info.entryFeeNote = osm.fee;
  else if (isPresent(osm.charge)) info.entryFeeNote = osm.charge;
  if (feeParts.indianTicket) info.indianTicket = feeParts.indianTicket;
  if (feeParts.foreignTicket) info.foreignTicket = feeParts.foreignTicket;
  if (feeParts.childrenTicket) info.childrenTicket = feeParts.childrenTicket;

  const parkingYes = yesNo(osm.parking);
  if (parkingYes != null) info.parkingAvailable = parkingYes;
  if (isPresent(osm.parkingFee)) info.parkingFee = osm.parkingFee;

  if (isPresent(osm.wheelchair)) info.wheelchairAccessible = osm.wheelchair;
  if (isPresent(osm.toilets)) info.washrooms = osm.toilets;
  if (isPresent(osm.drinkingWater)) info.drinkingWater = osm.drinkingWater;

  if (yesNo(osm.food)) info.foodCourt = true;
  if (yesNo(osm.restaurant) || osm.amenity === 'restaurant') info.restaurant = true;
  if (osm.amenity === 'cafe' || yesNo(osm.cafe)) info.cafe = true;

  if (isPresent(osm.guide)) info.guideAvailable = osm.guide;
  if (isPresent(osm.audioguide)) info.guideAvailable = info.guideAvailable || `audioguide=${osm.audioguide}`;
  if (isPresent(osm.camera)) info.photographyAllowed = osm.camera;
  if (isPresent(osm.video)) info.videographyAllowed = osm.video;
  if (isPresent(osm.drone)) info.dronePolicy = osm.drone;

  const pet = osm.dog || osm.petsAllowed;
  if (isPresent(pet)) info.petFriendly = pet;

  if (isPresent(osm.locker)) info.lockerFacility = osm.locker;
  if (isPresent(osm.bookingUrl)) info.ticketBookingUrl = osm.bookingUrl;
  if (isPresent(osm.website)) info.officialWebsite = osm.website;
  if (isPresent(osm.phone)) info.officialPhone = osm.phone;
  if (isPresent(osm.email)) info.officialEmail = osm.email;
  if (isPresent(osm.emergencyPhone)) info.emergencyContact = osm.emergencyPhone;

  return Object.keys(info).length > 1 ? info : {};
}

export function extractVisitorInfoFromWikidata(wd: WikidataExtract): Partial<VisitorInfo> {
  const info: Partial<VisitorInfo> = { source: 'wikidata' };
  if (isPresent(wd.website)) info.officialWebsite = wd.website;
  if (isPresent(wd.phone)) info.officialPhone = wd.phone;
  if (isPresent(wd.email)) info.officialEmail = wd.email;
  return Object.keys(info).length > 1 ? info : {};
}

export function extractTourismContentFromWikidata(wd: WikidataExtract): Partial<TourismContent> {
  const content: Partial<TourismContent> = { source: 'wikidata' };

  if (isPresent(wd.descriptions.en) && wd.descriptions.en.length >= 40) {
    content.whyFamous = wd.descriptions.en;
  }
  if (wd.architectureLabels.length) content.architectureStyle = wd.architectureLabels.join('; ');
  if (wd.founderLabels.length) content.builtBy = wd.founderLabels.join('; ');
  if (wd.architectLabels.length) content.architect = wd.architectLabels.join('; ');
  if (isPresent(wd.inceptionYear)) content.constructionYear = wd.inceptionYear;
  if (wd.historicalPeriodLabels.length) content.historicalPeriod = wd.historicalPeriodLabels.join('; ');
  if (wd.isUnescoDesignation || wd.unescoId) {
    content.unescoStatus = wd.unescoId
      ? `UNESCO World Heritage (ID: ${wd.unescoId})`
      : 'UNESCO World Heritage Site';
  }
  if (wd.asiProtected) {
    content.asiProtected = true;
    if (wd.asiDesignation) content.asiDesignation = wd.asiDesignation;
  }
  if (isPresent(wd.religiousType)) content.religiousImportance = wd.religiousType;
  if (isPresent(wd.naturalFeatureLabel)) content.naturalFeature = wd.naturalFeatureLabel;
  if (isPresent(wd.geologicalFeatureLabel)) content.geologicalFeature = wd.geologicalFeatureLabel;

  return Object.keys(content).length > 1 ? content : {};
}

export function extractTravelAccessFromWikidata(wd: WikidataExtract): Partial<TravelAccess> {
  const travel: Partial<TravelAccess> = { source: 'wikidata' };

  if (wd.nearestRailwayLabel) {
    travel.nearestRailwayStation = wd.nearestRailwayLabel;
    if (wd.nearestRailwayDistanceM != null) travel.nearestRailwayDistanceM = wd.nearestRailwayDistanceM;
  }
  if (wd.nearestAirportLabel) {
    travel.nearestAirport = wd.nearestAirportLabel;
    if (wd.nearestAirportDistanceM != null) travel.nearestAirportDistanceM = wd.nearestAirportDistanceM;
  }
  if (wd.nearestBusLabel) {
    travel.nearestBusStand = wd.nearestBusLabel;
    if (wd.nearestBusDistanceM != null) travel.nearestBusDistanceM = wd.nearestBusDistanceM;
  }

  return Object.keys(travel).length > 1 ? travel : {};
}

const OSM_ACTIVITY_MAP: Record<string, string> = {
  boat: 'Boating',
  boats: 'Boating',
  safari: 'Safari',
  camp_site: 'Camping',
  camping: 'Camping',
  aerialway: 'Ropeway',
  bird_hide: 'Bird Watching',
  viewpoint: 'Photography',
  climbing: 'Adventure Sports',
  diving: 'Adventure Sports',
  swimming: 'Adventure Sports',
  meditation: 'Meditation',
  place_of_worship: 'Temple Rituals',
  museum: 'Museum Tour',
};

export function extractActivitiesFromOsm(osm: OsmExtract): OfficialActivity[] {
  const acts: OfficialActivity[] = [];
  const seen = new Set<string>();

  const candidates: [string | undefined, string][] = [
    [osm.boat, 'boat'],
    [osm.safari, 'safari'],
    [osm.campSite, 'camp_site'],
    [osm.aerialway, 'aerialway'],
    [osm.birdHide, 'bird_hide'],
    [osm.tourism, 'tourism'],
    [osm.historic, 'historic'],
    [osm.amenity, 'amenity'],
    [osm.audioguide, 'audioguide'],
    [osm.guidedTour, 'guided_tour'],
  ];

  for (const [val, tag] of candidates) {
    if (!isPresent(val) || val.toLowerCase() === 'no') continue;
    const key = tag === 'audioguide' || tag === 'guided_tour'
      ? 'Audio Guide'
      : OSM_ACTIVITY_MAP[val.toLowerCase()] || OSM_ACTIVITY_MAP[tag];
    if (!key || seen.has(key)) continue;
    if (tag === 'audioguide' && yesNo(val)) {
      seen.add('Audio Guide');
      acts.push({ activity: 'Audio Guide', source: 'openstreetmap', osmTag: `audioguide=${val}` });
    } else if (tag === 'guided_tour' && yesNo(val)) {
      seen.add('Guide Tour');
      acts.push({ activity: 'Guided Tour', source: 'openstreetmap', osmTag: `guided_tour=${val}` });
    } else if (key) {
      seen.add(key);
      acts.push({ activity: key, source: 'openstreetmap', osmTag: `${tag}=${val}` });
    }
  }

  if (isPresent(osm.publicTransport)) {
    acts.push({ activity: 'Public Transport Access', source: 'openstreetmap', osmTag: `public_transport=${osm.publicTransport}` });
  }

  return acts;
}

/** Merge structured sections into highlights without overwriting existing non-empty values. */
export function mergeStructuredHighlights(
  existing: Record<string, unknown> | null,
  sections: {
    visitorInfo?: Partial<VisitorInfo>;
    tourismContent?: Partial<TourismContent>;
    travelAccess?: Partial<TravelAccess>;
    activities?: OfficialActivity[];
  },
): Record<string, unknown> | null {
  const base = existing ? { ...existing } : {};
  let changed = false;

  const mergeSection = <T extends Record<string, unknown>>(key: string, patch: Partial<T> | undefined) => {
    if (!patch || Object.keys(patch).length <= 1) return;
    const current = (base[key] as Record<string, unknown>) || {};
    const next = { ...current };
    for (const [k, v] of Object.entries(patch)) {
      if (k === 'source') continue;
      if (v == null || v === '') continue;
      if (next[k] != null && next[k] !== '') continue;
      next[k] = v;
      changed = true;
    }
    if (Object.keys(next).length) {
      next.source = patch.source || current.source || 'enrichment';
      base[key] = next;
    }
  };

  mergeSection('visitorInfo', sections.visitorInfo);
  mergeSection('tourismContent', sections.tourismContent);
  mergeSection('travelAccess', sections.travelAccess);

  if (sections.activities?.length) {
    const existingActs = Array.isArray(base.officialActivities) ? [...(base.officialActivities as OfficialActivity[])] : [];
    const names = new Set(existingActs.map((a) => a.activity));
    for (const a of sections.activities) {
      if (!names.has(a.activity)) {
        existingActs.push(a);
        names.add(a.activity);
        changed = true;
      }
    }
    if (existingActs.length) base.officialActivities = existingActs;
  }

  return changed ? base : null;
}
