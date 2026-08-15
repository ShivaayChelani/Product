import fs from 'fs';
import path from 'path';
import { env } from '../../../config/env';
import { logger } from '../../../config/logger';

export type BoundaryFeatureProperties = {
  state?: string;
  district?: string;
  stateCode?: string;
  districtCode?: string;
  [key: string]: unknown;
};

export type GeoFeature = {
  type: 'Feature';
  properties: BoundaryFeatureProperties;
  geometry: { type: string; coordinates: unknown };
};

export type BoundaryDatasetStatus = {
  loaded: boolean;
  licenseAcknowledged: boolean;
  dataDir: string | null;
  stateFeatures: number;
  districtFeatures: number;
  sourceNote: string;
};

type Ring = [number, number][];

function pointInRing(lng: number, lat: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersect = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi + 0.0) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointInPolygonCoords(lng: number, lat: number, coords: unknown): boolean {
  if (!Array.isArray(coords)) return false;
  if (coords.length === 0) return false;
  if (typeof coords[0][0] === 'number') {
    return pointInRing(lng, lat, coords as Ring);
  }
  for (const ring of coords as Ring[]) {
    if (pointInRing(lng, lat, ring)) return true;
  }
  return false;
}

function pointInGeometry(lng: number, lat: number, geometry: GeoFeature['geometry']): boolean {
  if (geometry.type === 'Polygon') {
    const rings = geometry.coordinates as Ring[];
    if (!rings?.length) return false;
    if (!pointInRing(lng, lat, rings[0])) return false;
    for (let i = 1; i < rings.length; i++) {
      if (pointInRing(lng, lat, rings[i])) return false;
    }
    return true;
  }
  if (geometry.type === 'MultiPolygon') {
    const polys = geometry.coordinates as Ring[][];
    for (const poly of polys) {
      if (pointInPolygonCoords(lng, lat, poly)) return true;
    }
    return false;
  }
  return false;
}

function loadFeatureCollection(filePath: string): GeoFeature[] {
  if (!fs.existsSync(filePath)) return [];
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (raw.type === 'FeatureCollection' && Array.isArray(raw.features)) {
    return raw.features as GeoFeature[];
  }
  return [];
}

function normalizeAdminName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Loads official boundary polygons when ops provides licensed GeoJSON under BOUNDARY_DATA_DIR.
 * Does NOT ship or fabricate government geometry.
 */
class BoundaryDatasetProvider {
  private stateFeatures: GeoFeature[] = [];
  private districtFeatures: GeoFeature[] = [];
  private loaded = false;

  refresh(): BoundaryDatasetStatus {
    this.stateFeatures = [];
    this.districtFeatures = [];
    this.loaded = false;

    if (!env.boundaryDataLicenseAcknowledged) {
      return this.status('Set BOUNDARY_DATA_LICENSE_ACKNOWLEDGED=true after legal approval to load datasets.');
    }
    if (!env.boundaryDataDir) {
      return this.status('Set BOUNDARY_DATA_DIR to licensed GeoJSON directory (states.geojson, districts.geojson).');
    }

    const dir = path.resolve(env.boundaryDataDir);
    this.stateFeatures = loadFeatureCollection(path.join(dir, 'states.geojson'));
    this.districtFeatures = loadFeatureCollection(path.join(dir, 'districts.geojson'));
    this.loaded = this.stateFeatures.length > 0 || this.districtFeatures.length > 0;

    if (!this.loaded) {
      logger.warn({ dir }, 'Boundary data directory configured but no features loaded');
    }

    return this.status(
      this.loaded
        ? 'Licensed boundary datasets loaded from disk.'
        : 'Directory configured; awaiting states.geojson / districts.geojson files.',
    );
  }

  private status(sourceNote: string): BoundaryDatasetStatus {
    return {
      loaded: this.loaded,
      licenseAcknowledged: env.boundaryDataLicenseAcknowledged,
      dataDir: env.boundaryDataDir ?? null,
      stateFeatures: this.stateFeatures.length,
      districtFeatures: this.districtFeatures.length,
      sourceNote,
    };
  }

  getStatus(): BoundaryDatasetStatus {
    if (!this.loaded && (env.boundaryDataDir || env.boundaryDataLicenseAcknowledged)) {
      return this.refresh();
    }
    return this.status(
      this.loaded ? 'Boundary datasets active.' : 'Bbox-only mode until licensed datasets are configured.',
    );
  }

  resolveAdministrative(lng: number, lat: number, stateHint: string, districtHint: string) {
    const status = this.getStatus();
    if (!status.loaded) {
      return {
        stateValid: null as boolean | null,
        districtValid: null as boolean | null,
        matchedState: null as string | null,
        matchedDistrict: null as string | null,
        method: 'bbox_only_pending_dataset',
        pendingDataset: true,
      };
    }

    let matchedState: string | null = null;
    for (const f of this.stateFeatures) {
      if (pointInGeometry(lng, lat, f.geometry)) {
        matchedState = String(f.properties.state ?? f.properties.name ?? '');
        break;
      }
    }

    let matchedDistrict: string | null = null;
    for (const f of this.districtFeatures) {
      if (pointInGeometry(lng, lat, f.geometry)) {
        matchedDistrict = String(f.properties.district ?? f.properties.name ?? '');
        break;
      }
    }

    const stateValid =
      matchedState && stateHint
        ? normalizeAdminName(matchedState) === normalizeAdminName(stateHint)
        : matchedState
          ? null
          : false;

    const districtValid =
      matchedDistrict && districtHint
        ? normalizeAdminName(matchedDistrict) === normalizeAdminName(districtHint)
        : matchedDistrict
          ? null
          : false;

    return {
      stateValid,
      districtValid,
      matchedState,
      matchedDistrict,
      method: 'licensed_geojson',
      pendingDataset: false,
    };
  }
}

export const boundaryDatasetProvider = new BoundaryDatasetProvider();
