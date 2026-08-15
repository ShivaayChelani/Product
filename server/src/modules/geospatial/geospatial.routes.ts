import { Router } from 'express';
import { geospatialController } from './geospatial.controller';
import { validate } from '../../middleware/validate';
import {
  nearbyQuerySchema, clusterQuerySchema, nearestQuerySchema,
  routeQuerySchema, geofenceQuerySchema, heatmapQuerySchema, trendsQuerySchema,
} from './geospatial.validation';

const router = Router();

router.get('/nearby', validate(nearbyQuerySchema, 'query'), geospatialController.nearby);
router.get('/clusters', validate(clusterQuerySchema, 'query'), geospatialController.clusters);
router.get('/nearest', validate(nearestQuerySchema, 'query'), geospatialController.nearest);
router.get('/route', validate(routeQuerySchema, 'query'), geospatialController.route);
router.get('/geofence', validate(geofenceQuerySchema, 'query'), geospatialController.geofence);
router.get('/heatmap', validate(heatmapQuerySchema, 'query'), geospatialController.heatmap);
router.get('/trends', validate(trendsQuerySchema, 'query'), geospatialController.trends);

export default router;
