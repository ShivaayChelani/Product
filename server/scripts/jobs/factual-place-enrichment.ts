import { PlaceAliasType, Prisma } from '@prisma/client';
import { prisma } from '../../src/config/database';
import { normalizeForMatch } from '../../src/shared/utils/canonicalText';
import type {
  EnrichmentFieldKey,
  EnrichmentReport,
  FieldOutcome,
  PlaceEnrichmentRecord,
  WikidataExtract,
  OsmExtract,
} from '../lib/factual-enrichment-types';
import { fetchOsmTags, reverseGeocodeNominatim } from '../lib/osm-nominatim-client';
import { fetchWikidataEntities, fetchWikipediaLead } from '../lib/wikidata-client';
import {
  extractActivitiesFromOsm,
  extractTourismContentFromWikidata,
  extractTravelAccessFromWikidata,
  extractVisitorInfoFromOsm,
  extractVisitorInfoFromWikidata,
  mergeStructuredHighlights,
} from '../lib/visitor-info-extractors';
import { linkNearbyByCategories } from '../lib/nearby-linker';
import { recalculateCompletenessForPlaces } from '../lib/recalc-place-scores';

const PLACE_ENRICHMENT_SELECT = {
  id: true,
  name: true,
  description: true,
  shortDescription: true,
  history: true,
  latitude: true,
  longitude: true,
  city: true,
  village: true,
  postalCode: true,
  district: true,
  state: true,
  website: true,
  openingHours: true,
  ticketPrice: true,
  highlights: true,
  searchKeywords: true,
  tags: true,
  hasParking: true,
  parkingDetails: true,
  isAccessible: true,
  accessibilityDetails: true,
  hasWashroom: true,
  isPetFriendly: true,
  emergencyContact: true,
  elevationMeters: true,
  fullAddress: true,
  heritageStatus: true,
  unescoStatus: true,
  religiousType: true,
  naturalCultural: true,
  bestTimeToVisit: true,
  externalId: true,
  source: true,
} as const;

const OSM_DESCRIPTION_RE = /^(yes|no|place|building|tourism|historic|amenity|natural|waterway|landuse)/i;
const STATE_FRAGMENT_CITIES = new Set(['pradesh', 'nadu', 'bengal', 'khand', 'garh', 'land']);

function isBlank(v: string | null | undefined): boolean {
  return v == null || String(v).trim() === '';
}

function isLowQualityDescription(desc: string, name: string): boolean {
  const d = desc.trim();
  if (d.length < 25) return true;
  if (d.toLowerCase() === name.trim().toLowerCase()) return true;
  if (OSM_DESCRIPTION_RE.test(d)) return true;
  if (/^wikidata:Q\d+/i.test(d)) return true;
  if (/editorial description pending verification/i.test(d)) return true;
  if (/^A (place|point of interest|tourist attraction)/i.test(d)) return true;
  return false;
}

function isBadCity(city: string, state: string): boolean {
  const c = city.trim().toLowerCase();
  if (!c) return true;
  if (STATE_FRAGMENT_CITIES.has(c)) return true;
  if (state && c === state.trim().toLowerCase()) return true;
  return false;
}

function initFieldSummary(): EnrichmentReport['fieldSummary'] {
  const keys: EnrichmentFieldKey[] = [
    'name', 'aliases', 'hindiName', 'localLanguageName', 'description', 'shortDescription',
    'history', 'highlights', 'visitorInfo', 'tourismContent', 'travelAccess', 'activities',
    'bestTimeToVisit', 'thingsToDo', 'openingHours', 'entryFee',
    'accessibility', 'parking', 'washrooms', 'foodNearby', 'nearbyAttractions',
    'nearbyHotels', 'nearbyRestaurants', 'nearbyParking', 'nearbyHospitals', 'nearbyFuel',
    'website', 'contactInformation', 'latitude', 'longitude', 'state', 'district', 'city', 'village',
    'postalCode', 'searchKeywords', 'elevation', 'fullAddress', 'heritageStatus', 'unescoStatus',
    'naturalCultural', 'religiousType', 'tags',
  ];
  return Object.fromEntries(keys.map((k) => [k, { filled: 0, leftNull: 0, skippedExisting: 0 }])) as EnrichmentReport['fieldSummary'];
}

function bump(
  summary: EnrichmentReport['fieldSummary'],
  field: EnrichmentFieldKey,
  outcome: FieldOutcome,
) {
  summary[field][outcome === 'filled' ? 'filled' : outcome === 'skipped_existing' ? 'skippedExisting' : 'leftNull']++;
}

type ProvenanceRow = {
  placeId: string;
  fieldName: string;
  valueJson: Prisma.InputJsonValue;
  sourceType: string;
  sourceUri: string;
};

function queueProvenance(
  queue: ProvenanceRow[],
  placeId: string,
  fieldName: string,
  valueJson: unknown,
  sourceType: string,
  sourceUri: string,
) {
  queue.push({
    placeId,
    fieldName,
    valueJson: valueJson as Prisma.InputJsonValue,
    sourceType,
    sourceUri,
  });
}

function dedupeAliases(rows: Prisma.PlaceAliasCreateManyInput[]): Prisma.PlaceAliasCreateManyInput[] {
  const seen = new Set<string>();
  return rows.filter((r) => {
    const key = r.normalizedAlias;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dedupeTranslations(rows: Prisma.PlaceTranslationCreateManyInput[]): Prisma.PlaceTranslationCreateManyInput[] {
  const seen = new Set<string>();
  return rows.filter((r) => {
    const key = `${r.locale}:${r.fieldName}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function pickLocalLabel(wd: WikidataExtract): string | undefined {
  for (const lang of ['hi', 'mr', 'bn', 'ta', 'te', 'kn', 'ml', 'gu', 'pa', 'or', 'as', 'ur']) {
    if (wd.labels[lang]) return wd.labels[lang];
  }
  return undefined;
}

function buildTicketPrice(fee: string): Prisma.InputJsonValue | undefined {
  const f = fee.trim().toLowerCase();
  if (!f || f === 'no') return undefined;
  if (f === 'yes') return { note: 'Entry fee applies; amount not specified in OSM', currency: 'INR' };
  const num = parseFloat(f.replace(/[^\d.]/g, ''));
  if (Number.isFinite(num) && num > 0) {
    return { adult: num, currency: 'INR', note: 'From OpenStreetMap fee tag' };
  }
  return { note: fee, currency: 'INR' };
}

function buildOpeningHours(osmHours: string): Prisma.InputJsonValue {
  return { raw: osmHours, source: 'openstreetmap' };
}

function mergeHighlights(
  existing: Prisma.JsonValue | null,
  patch: Record<string, unknown>,
): Prisma.InputJsonValue {
  const base = existing && typeof existing === 'object' && !Array.isArray(existing)
    ? { ...(existing as Record<string, unknown>) }
    : {};
  return { ...base, ...patch } as Prisma.InputJsonValue;
}

export async function enrichPlaceRow(
  place: {
    id: string;
    name: string;
    description: string;
    shortDescription: string | null;
    history: string | null;
    latitude: number | null;
    longitude: number | null;
    city: string;
    village: string;
    postalCode: string;
    district: string;
    state: string;
    website: string | null;
    openingHours: Prisma.JsonValue | null;
    ticketPrice: Prisma.JsonValue | null;
    highlights: Prisma.JsonValue | null;
    searchKeywords: string[];
    tags: string[];
    hasParking: boolean;
    parkingDetails: string | null;
    isAccessible: boolean;
    accessibilityDetails: string | null;
    hasWashroom: boolean;
    isPetFriendly: boolean;
    emergencyContact: string | null;
    elevationMeters: number | null;
    fullAddress: string | null;
    heritageStatus: string | null;
    unescoStatus: string | null;
    religiousType: string | null;
    naturalCultural: string | null;
    bestTimeToVisit: Prisma.JsonValue | null;
    externalId: string | null;
    source: string;
  },
  wd: WikidataExtract | undefined,
  osm: OsmExtract | null,
  opts: { dryRun: boolean; linkNearby: boolean; nominatim: boolean },
): Promise<PlaceEnrichmentRecord> {
  const currentHighlights =
    place.highlights && typeof place.highlights === 'object' && !Array.isArray(place.highlights)
      ? (place.highlights as Record<string, unknown>)
      : null;

  const provenanceQueue: ProvenanceRow[] = [];
  const record: PlaceEnrichmentRecord = {
    placeId: place.id,
    name: place.name,
    externalId: place.externalId,
    source: place.source,
    outcomes: {},
    manualReviewReasons: [],
    errors: [],
  };

  const updates: Prisma.PlaceUpdateInput = {};
  const aliasCreates: Prisma.PlaceAliasCreateManyInput[] = [];
  const translationCreates: Prisma.PlaceTranslationCreateManyInput[] = [];
  const keywordSet = new Set(place.searchKeywords.map((k) => k.toLowerCase()));

  const mark = (field: EnrichmentFieldKey, outcome: FieldOutcome) => {
    record.outcomes[field] = outcome;
  };

  // --- Wikidata description ---
  const wdDesc = wd?.descriptions.en;
  if (wdDesc && wdDesc.length >= 40) {
    if (!isBlank(place.description) && !isLowQualityDescription(place.description, place.name)) {
      mark('description', 'skipped_existing');
    } else {
      updates.description = wdDesc;
      updates.shortDescription = wdDesc.length > 200 ? wdDesc.slice(0, 197) + '…' : wdDesc;
      mark('description', 'filled');
      mark('shortDescription', 'filled');
      queueProvenance(provenanceQueue, place.id, 'description', wdDesc, 'wikidata', `https://www.wikidata.org/wiki/${wd!.qid}`);
    }
  } else if (wd?.wikipediaTitle) {
    try {
      const wiki = await fetchWikipediaLead(wd.wikipediaTitle);
      if (wiki?.extract && (isBlank(place.description) || isLowQualityDescription(place.description, place.name))) {
        updates.description = wiki.extract;
        updates.shortDescription = wiki.extract.length > 200 ? wiki.extract.slice(0, 197) + '…' : wiki.extract;
        mark('description', 'filled');
        mark('shortDescription', 'filled');
        queueProvenance(provenanceQueue, place.id, 'description', wiki.extract, 'wikipedia', wiki.sourceUri);
      } else {
        mark('description', isBlank(place.description) ? 'left_null' : 'skipped_existing');
      }
    } catch (e) {
      record.errors.push(`wikipedia: ${(e as Error).message}`);
      mark('description', 'left_null');
    }
  } else {
    mark('description', isBlank(place.description) ? 'left_null' : 'skipped_existing');
  }

  // --- History (factual Wikidata dates and people only) ---
  if (isBlank(place.history) && wd) {
    const parts: string[] = [];
    if (wd.inceptionYear) parts.push(`Inception (Wikidata P571): ${wd.inceptionYear}.`);
    if (wd.openingYear && wd.openingYear !== wd.inceptionYear) {
      parts.push(`Official opening (Wikidata P1619): ${wd.openingYear}.`);
    }
    if (wd.founderLabels.length) parts.push(`Founded by (Wikidata P112): ${wd.founderLabels.join(', ')}.`);
    if (wd.architectLabels.length) parts.push(`Architect (Wikidata P84): ${wd.architectLabels.join(', ')}.`);
    if (parts.length) {
      const history = parts.join(' ');
      updates.history = history;
      mark('history', 'filled');
      queueProvenance(provenanceQueue, place.id, 'history', history, 'wikidata', `https://www.wikidata.org/wiki/${wd.qid}`);
    } else {
      mark('history', 'left_null');
    }
  } else {
    mark('history', isBlank(place.history) ? 'left_null' : 'skipped_existing');
  }

  // --- Structured visitor / tourism / travel / activities (highlights JSON) ---
  const visitorFromOsm = osm ? extractVisitorInfoFromOsm(osm) : {};
  const visitorFromWd = wd ? extractVisitorInfoFromWikidata(wd) : {};
  const tourismContent = wd ? extractTourismContentFromWikidata(wd) : {};
  const travelAccess = wd ? extractTravelAccessFromWikidata(wd) : {};
  const activities = osm ? extractActivitiesFromOsm(osm) : [];

  const mergedStructured = mergeStructuredHighlights(currentHighlights, {
    visitorInfo: { ...visitorFromWd, ...visitorFromOsm },
    tourismContent,
    travelAccess,
    activities,
  });

  if (mergedStructured) {
    updates.highlights = mergedStructured as Prisma.InputJsonValue;
    if (Object.keys(visitorFromOsm).length > 1 || Object.keys(visitorFromWd).length > 1) {
      mark('visitorInfo', 'filled');
      queueProvenance(provenanceQueue, place.id, 'visitorInfo', mergedStructured.visitorInfo, 'openstreetmap', place.externalId || '');
    } else mark('visitorInfo', currentHighlights?.visitorInfo ? 'skipped_existing' : 'left_null');
    if (Object.keys(tourismContent).length > 1) {
      mark('tourismContent', 'filled');
      queueProvenance(provenanceQueue, place.id, 'tourismContent', mergedStructured.tourismContent, 'wikidata', wd ? `https://www.wikidata.org/wiki/${wd.qid}` : '');
    } else mark('tourismContent', currentHighlights?.tourismContent ? 'skipped_existing' : 'left_null');
    if (Object.keys(travelAccess).length > 1) {
      mark('travelAccess', 'filled');
    } else mark('travelAccess', currentHighlights?.travelAccess ? 'skipped_existing' : 'left_null');
    if (activities.length) mark('activities', 'filled');
    else mark('activities', currentHighlights?.officialActivities ? 'skipped_existing' : 'left_null');
  } else {
    mark('visitorInfo', currentHighlights?.visitorInfo ? 'skipped_existing' : 'left_null');
    mark('tourismContent', currentHighlights?.tourismContent ? 'skipped_existing' : 'left_null');
    mark('travelAccess', currentHighlights?.travelAccess ? 'skipped_existing' : 'left_null');
    mark('activities', currentHighlights?.officialActivities ? 'skipped_existing' : 'left_null');
  }

  // Pet friendly + emergency contact from OSM visitor tags
  const vi = mergedStructured?.visitorInfo as Record<string, string> | undefined;
  if (vi?.petFriendly && !place.isPetFriendly) {
    updates.isPetFriendly = vi.petFriendly === 'yes' || vi.petFriendly === 'designated';
  }
  if (vi?.emergencyContact && isBlank(place.emergencyContact)) {
    updates.emergencyContact = vi.emergencyContact;
  }

  if (activities.length && !currentHighlights?.officialActivities) {
    mark('thingsToDo', 'filled');
  } else {
    mark('thingsToDo', currentHighlights?.officialActivities ? 'skipped_existing' : 'left_null');
  }

  if ((visitorFromOsm.restaurant || visitorFromOsm.cafe || visitorFromOsm.foodCourt) && !currentHighlights?.foodNearby) {
    mark('foodNearby', 'filled');
  } else {
    mark('foodNearby', currentHighlights?.foodNearby ? 'skipped_existing' : 'left_null');
  }

  // --- Structured highlights (architecture, established year — Wikidata only) ---
  const highlightPatch: Record<string, unknown> = {};
  if (wd?.architectureLabels.length) highlightPatch.architectureStyle = wd.architectureLabels.join('; ');
  if (wd?.inceptionYear) highlightPatch.establishedYear = wd.inceptionYear;
  if (wd?.founderLabels.length) highlightPatch.builtBy = wd.founderLabels.join('; ');
  if (wd?.architectLabels.length) highlightPatch.architect = wd.architectLabels.join('; ');
  if (Object.keys(highlightPatch).length) {
    updates.highlights = mergeHighlights((updates.highlights as Prisma.JsonValue) ?? place.highlights, highlightPatch);
    if (!record.outcomes.highlights) mark('highlights', 'filled');
  } else if (!record.outcomes.highlights) {
    mark('highlights', currentHighlights && Object.keys(currentHighlights).length ? 'skipped_existing' : 'left_null');
  }

  // --- Hindi / local names ---
  const hindi = wd?.labels.hi || osm?.nameHi;
  if (hindi) {
    translationCreates.push({ placeId: place.id, locale: 'hi', fieldName: 'name', text: hindi, source: wd?.labels.hi ? 'wikidata' : 'openstreetmap' });
    mark('hindiName', 'filled');
  } else {
    mark('hindiName', 'left_null');
  }

  const local = wd ? pickLocalLabel(wd) : undefined;
  if (local && local !== hindi) {
    translationCreates.push({ placeId: place.id, locale: 'local', fieldName: 'name', text: local, source: 'wikidata' });
    mark('localLanguageName', 'filled');
  } else {
    mark('localLanguageName', 'left_null');
  }

  // --- Aliases ---
  const aliasTexts = new Set<string>();
  if (wd) {
    for (const list of Object.values(wd.aliases)) list.forEach((a) => aliasTexts.add(a));
    for (const label of Object.values(wd.labels)) {
      if (label.toLowerCase() !== place.name.toLowerCase()) aliasTexts.add(label);
    }
  }
  if (aliasTexts.size) {
    for (const alias of aliasTexts) {
      aliasCreates.push({
        placeId: place.id,
        alias,
        normalizedAlias: normalizeForMatch(alias),
        aliasType: PlaceAliasType.SEARCH_KEYWORD,
        source: 'wikidata',
      });
      keywordSet.add(alias.toLowerCase());
    }
    mark('aliases', 'filled');
  } else {
    mark('aliases', 'left_null');
  }

  // --- Website ---
  const website = (!isBlank(place.website) ? null : (wd?.website || osm?.website));
  if (website && /^https?:\/\//i.test(website)) {
    updates.website = website;
    mark('website', 'filled');
    queueProvenance(provenanceQueue, place.id, 'website', website, wd?.website ? 'wikidata' : 'openstreetmap', website);
  } else {
    mark('website', isBlank(place.website) ? 'left_null' : 'skipped_existing');
  }

  // --- Contact ---
  const contact: Record<string, string> = {};
  if (wd?.phone) contact.phone = wd.phone;
  if (wd?.email) contact.email = wd.email;
  if (osm?.phone && !contact.phone) contact.phone = osm.phone;
  if (Object.keys(contact).length) {
    updates.highlights = mergeHighlights((updates.highlights as Prisma.JsonValue) ?? place.highlights, { contact });
    mark('contactInformation', 'filled');
  } else {
    mark('contactInformation', 'left_null');
  }

  // --- Opening hours (OSM only) ---
  if (osm?.openingHours && !place.openingHours) {
    updates.openingHours = buildOpeningHours(osm.openingHours);
    mark('openingHours', 'filled');
    queueProvenance(provenanceQueue, place.id, 'openingHours', osm.openingHours, 'openstreetmap', place.externalId || '');
  } else {
    mark('openingHours', place.openingHours ? 'skipped_existing' : 'left_null');
  }

  // --- Entry fee (OSM only) ---
  if (osm?.fee && !place.ticketPrice) {
    const tp = buildTicketPrice(osm.fee);
    if (tp) {
      updates.ticketPrice = tp;
      mark('entryFee', 'filled');
      queueProvenance(provenanceQueue, place.id, 'ticketPrice', tp, 'openstreetmap', place.externalId || '');
    } else {
      mark('entryFee', 'left_null');
    }
  } else {
    mark('entryFee', place.ticketPrice ? 'skipped_existing' : 'left_null');
  }

  // --- Accessibility / parking (OSM factual tags) ---
  if (osm?.wheelchair && !place.accessibilityDetails) {
    updates.isAccessible = osm.wheelchair === 'yes' || osm.wheelchair === 'limited';
    updates.accessibilityDetails = `wheelchair=${osm.wheelchair} (OpenStreetMap)`;
    mark('accessibility', 'filled');
  } else {
    mark('accessibility', place.accessibilityDetails ? 'skipped_existing' : 'left_null');
  }

  if (osm?.parking && !place.parkingDetails) {
    updates.hasParking = osm.parking !== 'no' && osm.parking !== 'none';
    updates.parkingDetails = `parking=${osm.parking} (OpenStreetMap)`;
    mark('parking', 'filled');
  } else {
    mark('parking', place.parkingDetails ? 'skipped_existing' : 'left_null');
  }

  // --- Washrooms (OSM toilets tag) ---
  if (osm?.toilets && !place.hasWashroom) {
    updates.hasWashroom = osm.toilets === 'yes' || osm.toilets === 'separate';
    mark('washrooms', 'filled');
    queueProvenance(provenanceQueue, place.id, 'hasWashroom', osm.toilets, 'openstreetmap', place.externalId || '');
  } else {
    mark('washrooms', place.hasWashroom ? 'skipped_existing' : 'left_null');
  }

  // --- Elevation ---
  if (wd?.elevationMeters != null && place.elevationMeters == null) {
    updates.elevationMeters = wd.elevationMeters;
    mark('elevation', 'filled');
  } else {
    mark('elevation', place.elevationMeters != null ? 'skipped_existing' : 'left_null');
  }

  // --- Address ---
  if (wd?.streetAddress && isBlank(place.fullAddress)) {
    updates.fullAddress = wd.streetAddress;
    mark('fullAddress', 'filled');
  } else {
    mark('fullAddress', isBlank(place.fullAddress) ? 'left_null' : 'skipped_existing');
  }

  // --- Heritage / UNESCO / ASI / classification ---
  if (wd?.asiProtected && isBlank(place.heritageStatus) && wd.asiDesignation) {
    updates.heritageStatus = wd.asiDesignation;
    mark('heritageStatus', 'filled');
    queueProvenance(provenanceQueue, place.id, 'heritageStatus', wd.asiDesignation, 'wikidata', `https://www.wikidata.org/wiki/${wd.qid}#P1435`);
  } else if (wd?.heritageLabels.length && isBlank(place.heritageStatus)) {
    updates.heritageStatus = wd.heritageLabels.join('; ');
    mark('heritageStatus', 'filled');
    queueProvenance(provenanceQueue, place.id, 'heritageStatus', wd.heritageLabels, 'wikidata', `https://www.wikidata.org/wiki/${wd.qid}#P1435`);
  } else {
    mark('heritageStatus', isBlank(place.heritageStatus) ? 'left_null' : 'skipped_existing');
  }

  if (isBlank(place.unescoStatus) && wd && (wd.isUnescoDesignation || wd.unescoId)) {
    const unesco = wd.unescoId
      ? `UNESCO World Heritage (ID: ${wd.unescoId})`
      : 'UNESCO World Heritage Site';
    updates.unescoStatus = unesco;
    mark('unescoStatus', 'filled');
    queueProvenance(provenanceQueue, place.id, 'unescoStatus', unesco, 'wikidata', `https://www.wikidata.org/wiki/${wd.qid}`);
  } else {
    mark('unescoStatus', isBlank(place.unescoStatus) ? 'left_null' : 'skipped_existing');
  }

  const religious = wd?.religiousType || (osm?.religion ? `${osm.religion}${osm.denomination ? ` (${osm.denomination})` : ''}` : undefined);
  if (religious && isBlank(place.religiousType)) {
    updates.religiousType = religious;
    mark('religiousType', 'filled');
  } else {
    mark('religiousType', isBlank(place.religiousType) ? 'left_null' : 'skipped_existing');
  }

  const natCult = wd?.naturalCultural;
  if (natCult && isBlank(place.naturalCultural)) {
    updates.naturalCultural = natCult;
    mark('naturalCultural', 'filled');
  } else {
    mark('naturalCultural', isBlank(place.naturalCultural) ? 'left_null' : 'skipped_existing');
  }

  // --- Factual tags from OSM + Wikidata instance-of ---
  const tagSet = new Set(place.tags.map((t) => t.toLowerCase()));
  const newTags: string[] = [];
  for (const t of [osm?.tourism, osm?.historic, osm?.amenity, ...(wd?.instanceLabels || [])]) {
    if (t && !tagSet.has(t.toLowerCase())) {
      newTags.push(t);
      tagSet.add(t.toLowerCase());
    }
  }
  if (newTags.length) {
    updates.tags = [...place.tags, ...newTags];
    mark('tags', 'filled');
  } else {
    mark('tags', place.tags.length ? 'skipped_existing' : 'left_null');
  }

  // --- Geo admin: OSM addr tags first, then Nominatim ---
  if (isBadCity(place.city, place.state) && osm?.addrCity) {
    updates.city = osm.addrCity;
    mark('city', 'filled');
  }
  if (isBlank(place.state) && osm?.addrState) {
    updates.state = osm.addrState;
    mark('state', 'filled');
  }
  if (isBlank(place.district) && osm?.addrDistrict) {
    updates.district = osm.addrDistrict;
    mark('district', 'filled');
  }
  if (isBlank(place.village) && osm?.addrVillage) {
    updates.village = osm.addrVillage;
    mark('village', 'filled');
  }
  if (isBlank(place.postalCode) && osm?.addrPostcode) {
    updates.postalCode = osm.addrPostcode;
    mark('postalCode', 'filled');
  }

  if (opts.nominatim && place.latitude != null && place.longitude != null) {
    const needsGeo =
      isBadCity(String(updates.city ?? place.city), String(updates.state ?? place.state))
      || isBlank(String(updates.state ?? place.state))
      || isBlank(String(updates.village ?? place.village))
      || isBlank(String(updates.postalCode ?? place.postalCode));
    if (needsGeo) {
      try {
        const nom = await reverseGeocodeNominatim(place.latitude, place.longitude);
        if (nom) {
          if (isBadCity(String(updates.city ?? place.city), String(updates.state ?? place.state)) && nom.city) {
            updates.city = nom.city;
            mark('city', 'filled');
            queueProvenance(provenanceQueue, place.id, 'city', nom.city, 'nominatim', nom.sourceUri);
          }
          if (isBlank(String(updates.district ?? place.district)) && nom.district) {
            updates.district = nom.district;
            mark('district', 'filled');
          }
          if (isBlank(String(updates.state ?? place.state)) && nom.state) {
            updates.state = nom.state;
            mark('state', 'filled');
          }
          if (isBlank(place.fullAddress) && nom.fullAddress) {
            updates.fullAddress = nom.fullAddress;
            mark('fullAddress', 'filled');
          }
          if (isBlank(String(updates.village ?? place.village)) && nom.village) {
            updates.village = nom.village;
            mark('village', 'filled');
          }
          if (isBlank(String(updates.postalCode ?? place.postalCode)) && nom.postcode) {
            updates.postalCode = nom.postcode;
            mark('postalCode', 'filled');
          }
        }
      } catch (e) {
        record.errors.push(`nominatim: ${(e as Error).message}`);
      }
    }
  }

  if (!record.outcomes.city) mark('city', isBadCity(place.city, place.state) ? 'left_null' : 'skipped_existing');
  if (!record.outcomes.state) mark('state', isBlank(place.state) ? 'left_null' : 'skipped_existing');
  if (!record.outcomes.district) mark('district', isBlank(place.district) ? 'left_null' : 'skipped_existing');
  if (!record.outcomes.village) mark('village', isBlank(place.village) ? 'left_null' : 'skipped_existing');
  if (!record.outcomes.postalCode) mark('postalCode', isBlank(place.postalCode) ? 'left_null' : 'skipped_existing');

  if (isBlank(String(updates.postalCode ?? place.postalCode)) && wd?.postalCode) {
    updates.postalCode = wd.postalCode;
    mark('postalCode', 'filled');
  }

  // --- Coordinates (fill only if missing) ---
  if (place.latitude == null && wd?.coordinates) {
    updates.latitude = wd.coordinates.lat;
    mark('latitude', 'filled');
  } else mark('latitude', place.latitude != null ? 'skipped_existing' : 'left_null');

  if (place.longitude == null && wd?.coordinates) {
    updates.longitude = wd.coordinates.lng;
    mark('longitude', 'filled');
  } else mark('longitude', place.longitude != null ? 'skipped_existing' : 'left_null');

  mark('bestTimeToVisit', place.bestTimeToVisit ? 'skipped_existing' : 'left_null');

  // --- Nearby POIs by category (PostGIS) ---
  if (opts.linkNearby && place.latitude != null && place.longitude != null) {
    const lat = place.latitude;
    const lng = place.longitude;
    const counts = await linkNearbyByCategories(place.id, lat, lng, opts.dryRun);
    const markNearby = (key: EnrichmentFieldKey, n: number) => mark(key, n > 0 ? 'filled' : 'left_null');
    markNearby('nearbyAttractions', counts.attraction ?? 0);
    markNearby('nearbyHotels', counts.hotel ?? 0);
    markNearby('nearbyRestaurants', counts.restaurant ?? 0);
    markNearby('nearbyParking', counts.parking ?? 0);
    markNearby('nearbyHospitals', counts.hospital ?? 0);
    markNearby('nearbyFuel', counts.fuel ?? 0);
  } else {
    mark('nearbyAttractions', 'left_null');
    mark('nearbyHotels', 'left_null');
    mark('nearbyRestaurants', 'left_null');
    mark('nearbyParking', 'left_null');
    mark('nearbyHospitals', 'left_null');
    mark('nearbyFuel', 'left_null');
  }

  // --- Search keywords ---
  if (keywordSet.size > place.searchKeywords.length) {
    updates.searchKeywords = [...keywordSet];
    mark('searchKeywords', 'filled');
  } else {
    mark('searchKeywords', place.searchKeywords.length ? 'skipped_existing' : 'left_null');
  }

  // --- Manual review flags ---
  if (!wd && !osm && place.externalId?.startsWith('osm:')) {
    record.manualReviewReasons.push('OSM fetch failed — verify external_id');
  }
  if (isBadCity(String(updates.city ?? place.city), String(updates.state ?? place.state))) {
    record.manualReviewReasons.push('City still missing or invalid after enrichment');
  }
  if (isBlank(String(updates.state ?? place.state))) {
    record.manualReviewReasons.push('State still missing after enrichment');
  }

  const hasUpdates =
    Object.keys(updates).length > 0 || aliasCreates.length > 0 || translationCreates.length > 0;

  const aliasRows = dedupeAliases(aliasCreates);
  const translationRows = dedupeTranslations(translationCreates);

  if (hasUpdates && !opts.dryRun) {
    await prisma.$transaction(async (tx) => {
      if (Object.keys(updates).length) {
        await tx.place.update({ where: { id: place.id }, data: updates });
      }
      if (aliasRows.length) {
        await tx.placeAlias.createMany({ data: aliasRows, skipDuplicates: true });
      }
      if (translationRows.length) {
        await tx.placeTranslation.createMany({ data: translationRows, skipDuplicates: true });
      }
      if (provenanceQueue.length) {
        await tx.placeFieldProvenance.createMany({ data: provenanceQueue });
      }
    });
  }

  return record;
}

async function loadOsmForPlace(
  externalId: string | null,
  wd: WikidataExtract | undefined,
): Promise<OsmExtract | null> {
  let osm: OsmExtract | null = null;
  if (externalId?.startsWith('osm:')) {
    try {
      osm = await fetchOsmTags(externalId);
    } catch {
      osm = null;
    }
  } else if (wd?.osmExternalIds.length) {
    for (const osmId of wd.osmExternalIds) {
      try {
        osm = await fetchOsmTags(osmId);
        if (osm) break;
      } catch {
        /* try next */
      }
    }
  }
  return osm;
}

/** Process a single place in isolation — used by resilient worker processes. */
export async function enrichSinglePlace(
  placeId: string,
  opts: {
    dryRun: boolean;
    linkNearby: boolean;
    nominatim: boolean;
    recalcScores?: boolean;
  },
): Promise<PlaceEnrichmentRecord | null> {
  const place = await prisma.place.findFirst({
    where: { id: placeId, mergedIntoId: null },
    select: PLACE_ENRICHMENT_SELECT,
  });
  if (!place) return null;

  const qid = place.externalId?.match(/^wikidata:(Q\d+)$/i)?.[1]?.toUpperCase();
  const wdMap = qid ? await fetchWikidataEntities([qid]) : new Map();
  const wd = qid ? wdMap.get(qid) : undefined;
  const osm = await loadOsmForPlace(place.externalId, wd);
  const rec = await enrichPlaceRow(place, wd, osm, opts);

  if (opts.recalcScores && !opts.dryRun) {
    const filledAny = Object.values(rec.outcomes).some((o) => o === 'filled');
    if (filledAny) await recalculateCompletenessForPlaces([place.id]);
  }

  return rec;
}

export async function runFactualEnrichment(opts: {
  limit: number;
  offset: number;
  dryRun: boolean;
  linkNearby: boolean;
  nominatim: boolean;
  sourceFilter?: 'wikidata' | 'osm' | 'all';
  recalcScores?: boolean;
}): Promise<EnrichmentReport> {
  const fieldSummary = initFieldSummary();
  const where: Prisma.PlaceWhereInput = { mergedIntoId: null };
  if (opts.sourceFilter === 'wikidata') {
    where.externalId = { startsWith: 'wikidata:' };
  } else if (opts.sourceFilter === 'osm') {
    where.externalId = { startsWith: 'osm:' };
  }

  const places = await prisma.place.findMany({
    where,
    orderBy: [{ source: 'asc' }, { updatedAt: 'asc' }],
    skip: opts.offset,
    take: opts.limit,
    select: PLACE_ENRICHMENT_SELECT,
  });

  const qids = places
    .map((p) => p.externalId?.match(/^wikidata:(Q\d+)$/i)?.[1]?.toUpperCase())
    .filter(Boolean) as string[];

  const wdMap = await fetchWikidataEntities(qids);

  const records: PlaceEnrichmentRecord[] = [];
  let enrichedCount = 0;
  let errorCount = 0;
  const enrichedPlaceIds: string[] = [];

  for (const place of places) {
    const qid = place.externalId?.match(/^wikidata:(Q\d+)$/i)?.[1]?.toUpperCase();
    const wd = qid ? wdMap.get(qid) : undefined;
    const osm = await loadOsmForPlace(place.externalId, wd);

    try {
      const rec = await enrichPlaceRow(place, wd, osm, opts);
      records.push(rec);
      const filledAny = Object.values(rec.outcomes).some((o) => o === 'filled');
      if (filledAny) enrichedCount++;
      if (rec.errors.length) errorCount++;
      if (filledAny && opts.recalcScores) enrichedPlaceIds.push(place.id);
      for (const [field, outcome] of Object.entries(rec.outcomes)) {
        bump(fieldSummary, field as EnrichmentFieldKey, outcome as FieldOutcome);
      }
    } catch (e) {
      // One retry for transient DB/API failures
      try {
        await new Promise((r) => setTimeout(r, 1500));
        const qidRetry = place.externalId?.match(/^wikidata:(Q\d+)$/i)?.[1]?.toUpperCase();
        const wdRetry = qidRetry ? wdMap.get(qidRetry) : wd;
        let osmRetry = osm;
        if (!osmRetry && place.externalId?.startsWith('osm:')) {
          osmRetry = await loadOsmForPlace(place.externalId, wdRetry);
        }
        const rec = await enrichPlaceRow(place, wdRetry, osmRetry, opts);
        records.push(rec);
        const filledAny = Object.values(rec.outcomes).some((o) => o === 'filled');
        if (filledAny) enrichedCount++;
        if (filledAny && opts.recalcScores) enrichedPlaceIds.push(place.id);
        for (const [field, outcome] of Object.entries(rec.outcomes)) {
          bump(fieldSummary, field as EnrichmentFieldKey, outcome as FieldOutcome);
        }
      } catch (e2) {
        errorCount++;
        records.push({
          placeId: place.id,
          name: place.name,
          externalId: place.externalId,
          source: place.source,
          outcomes: {},
          manualReviewReasons: ['Enrichment threw an exception'],
          errors: [(e2 as Error).message],
        });
      }
    }
  }

  if (opts.recalcScores && enrichedPlaceIds.length && !opts.dryRun) {
    await recalculateCompletenessForPlaces(enrichedPlaceIds);
  }

  const manualReview = records.filter((r) => r.manualReviewReasons.length > 0);

  return {
    generatedAt: new Date().toISOString(),
    dryRun: opts.dryRun,
    limit: opts.limit,
    offset: opts.offset,
    processed: places.length,
    enrichedCount,
    unchangedCount: places.length - enrichedCount,
    errorCount,
    manualReviewCount: manualReview.length,
    fieldSummary,
    placesRequiringManualReview: manualReview.slice(0, 500).map((r) => ({
      placeId: r.placeId,
      name: r.name,
      reasons: r.manualReviewReasons,
      errors: r.errors.length ? r.errors : undefined,
    })),
    sampleEnriched: records.filter((r) => Object.values(r.outcomes).some((o) => o === 'filled')).slice(0, 25),
  };
}
