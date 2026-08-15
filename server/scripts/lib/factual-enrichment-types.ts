/** Shared types for factual place enrichment (Wikidata / OSM / Nominatim only). */

export type EnrichmentFieldKey =
  | 'name'
  | 'aliases'
  | 'hindiName'
  | 'localLanguageName'
  | 'description'
  | 'shortDescription'
  | 'history'
  | 'highlights'
  | 'visitorInfo'
  | 'tourismContent'
  | 'travelAccess'
  | 'activities'
  | 'bestTimeToVisit'
  | 'thingsToDo'
  | 'openingHours'
  | 'entryFee'
  | 'accessibility'
  | 'parking'
  | 'washrooms'
  | 'foodNearby'
  | 'nearbyAttractions'
  | 'nearbyHotels'
  | 'nearbyRestaurants'
  | 'nearbyParking'
  | 'nearbyHospitals'
  | 'nearbyFuel'
  | 'website'
  | 'contactInformation'
  | 'latitude'
  | 'longitude'
  | 'state'
  | 'district'
  | 'city'
  | 'village'
  | 'postalCode'
  | 'searchKeywords'
  | 'elevation'
  | 'fullAddress'
  | 'heritageStatus'
  | 'unescoStatus'
  | 'naturalCultural'
  | 'religiousType'
  | 'tags';

export type FieldOutcome = 'filled' | 'left_null' | 'skipped_existing';

export type PlaceEnrichmentRecord = {
  placeId: string;
  name: string;
  externalId: string | null;
  source: string;
  outcomes: Partial<Record<EnrichmentFieldKey, FieldOutcome>>;
  wikidataId?: string;
  manualReviewReasons: string[];
  errors: string[];
};

export type EnrichmentReport = {
  generatedAt: string;
  dryRun: boolean;
  limit: number;
  offset: number;
  processed: number;
  enrichedCount: number;
  unchangedCount: number;
  errorCount: number;
  manualReviewCount: number;
  fieldSummary: Record<EnrichmentFieldKey, { filled: number; leftNull: number; skippedExisting: number }>;
  placesRequiringManualReview: Array<{ placeId: string; name: string; reasons: string[]; errors?: string[] }>;
  sampleEnriched: PlaceEnrichmentRecord[];
};

export type WikidataExtract = {
  qid: string;
  labels: Record<string, string>;
  aliases: Record<string, string[]>;
  descriptions: Record<string, string>;
  website?: string;
  phone?: string;
  email?: string;
  elevationMeters?: number;
  postalCode?: string;
  streetAddress?: string;
  heritageQids: string[];
  heritageLabels: string[];
  inceptionYear?: string;
  openingYear?: string;
  adminQids: string[];
  adminEntityLabels: string[];
  architectureQids: string[];
  architectureLabels: string[];
  architectQids: string[];
  architectLabels: string[];
  founderQids: string[];
  founderLabels: string[];
  instanceQids: string[];
  instanceLabels: string[];
  historicalPeriodQids: string[];
  historicalPeriodLabels: string[];
  locatedOnQids: string[];
  transportHubs: { qid: string; distanceM?: number }[];
  osmExternalIds: string[];
  unescoId?: string;
  isUnescoDesignation: boolean;
  asiProtected: boolean;
  asiDesignation?: string;
  religiousType?: string;
  naturalCultural?: string;
  naturalFeatureLabel?: string;
  geologicalFeatureLabel?: string;
  nearestRailwayLabel?: string;
  nearestRailwayDistanceM?: number;
  nearestAirportLabel?: string;
  nearestAirportDistanceM?: number;
  nearestBusLabel?: string;
  nearestBusDistanceM?: number;
  wikipediaTitle?: string;
  coordinates?: { lat: number; lng: number };
};

export type OsmExtract = {
  openingHours?: string;
  openingHoursSigned?: string;
  fee?: string;
  feeConditional?: string;
  charge?: string;
  website?: string;
  bookingUrl?: string;
  phone?: string;
  email?: string;
  emergencyPhone?: string;
  wheelchair?: string;
  parking?: string;
  parkingFee?: string;
  toilets?: string;
  drinkingWater?: string;
  food?: string;
  restaurant?: string;
  cafe?: string;
  guide?: string;
  audioguide?: string;
  guidedTour?: string;
  camera?: string;
  video?: string;
  drone?: string;
  dog?: string;
  petsAllowed?: string;
  locker?: string;
  boat?: string;
  safari?: string;
  campSite?: string;
  aerialway?: string;
  birdHide?: string;
  publicTransport?: string;
  nameHi?: string;
  addrCity?: string;
  addrVillage?: string;
  addrState?: string;
  addrDistrict?: string;
  addrPostcode?: string;
  wikipedia?: string;
  wikidata?: string;
  tourism?: string;
  historic?: string;
  amenity?: string;
  religion?: string;
  denomination?: string;
};

export type NominatimExtract = {
  city?: string;
  village?: string;
  district?: string;
  state?: string;
  country?: string;
  postcode?: string;
  fullAddress?: string;
  sourceUri: string;
};
