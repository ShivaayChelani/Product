import { placesCrudService } from './services/places.crud.service';
import { placesGeoService } from './services/places.geo.service';
import { placesStatsService } from './services/places.stats.service';
import { placesAuditService } from './services/places.audit.service';
import { placesRecommendationService } from './services/places.recommendation.service';
import { placesBulkService } from './services/places.bulk.service';
import { placesCanonicalService } from './services/places.canonical.service';

export const placesService = {
  ...placesCrudService,
  ...placesGeoService,
  ...placesStatsService,
  ...placesAuditService,
  ...placesRecommendationService,
  ...placesBulkService,
  ...placesCanonicalService,
};
