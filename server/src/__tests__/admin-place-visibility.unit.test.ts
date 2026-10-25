import { describe, expect, it } from 'vitest';
import {
  TOURIST_CATEGORIES,
  isCommercialBusinessPlace,
  isMarketArea,
  isTouristWorthyPlace,
  isVendorPlace,
  nonCommercialPlaceSqlText,
  nonCommercialPlaceWhere,
} from '../shared/utils/touristPlaceFilter';
import { vendorBusinessTypeToPlaceCategory } from '../modules/trips/vendorItineraryPlace.helpers';

/**
 * Vendor businesses (shops, restaurants, hotels) are managed in the Vendors tab
 * and must never surface as Places. Malls and market areas are destinations
 * and stay visible. These helpers back the admin list, public feeds and search.
 */
describe('vendor-materialised places', () => {
  it('detects rows created by the vendor itinerary bridge', () => {
    expect(isVendorPlace({ source: 'VENDOR', externalId: null })).toBe(true);
    expect(isVendorPlace({ source: 'ADMIN', externalId: 'vendor:abc123' })).toBe(true);
    expect(isVendorPlace({ source: 'CURATED', externalId: 'osm:way/1' })).toBe(false);
    expect(isVendorPlace({ source: null, externalId: null })).toBe(false);
  });

  it('every vendor business type maps to a category the Places tab hides', () => {
    for (const type of ['restaurant', 'cafe', 'hotel', 'homestay', 'shop', 'boutique', 'guide', 'other']) {
      const category = vendorBusinessTypeToPlaceCategory(type);
      expect(
        isCommercialBusinessPlace({ name: 'Acme Cafe', category, source: 'VENDOR', externalId: 'vendor:1' }),
      ).toBe(true);
    }
  });
});

describe('isMarketArea / isCommercialBusinessPlace', () => {
  it('hides single shops, restaurants and hotels', () => {
    expect(isCommercialBusinessPlace({ name: 'Cafe Coffee Day', category: 'RESTAURANT' })).toBe(true);
    expect(isCommercialBusinessPlace({ name: 'Taj Palace', category: 'HOTEL' })).toBe(true);
    expect(isCommercialBusinessPlace({ name: 'Ravi Electronics', category: 'SHOPPING' })).toBe(true);
    expect(isCommercialBusinessPlace({ name: 'Ravi Electronics', category: 'shopping' })).toBe(true);
  });

  it('keeps malls and market areas as tourist destinations', () => {
    expect(isMarketArea({ name: 'Sarojini Nagar Market', category: 'SHOPPING' })).toBe(true);
    expect(isMarketArea({ name: 'Johari Bazaar', category: 'SHOPPING' })).toBe(true);
    expect(isMarketArea({ name: 'DLF Mall of India', category: 'SHOPPING' })).toBe(true);
    expect(isMarketArea({ name: 'Dilli Haat', category: 'SHOPPING' })).toBe(true);
    expect(isMarketArea({ name: 'Chandni Chowk', category: 'market' })).toBe(true);
    expect(isMarketArea({ name: 'Phoenix', category: 'mall' })).toBe(true);
    expect(isMarketArea({ name: 'Local Store', category: 'SHOPPING', subcategory: 'flea market' })).toBe(true);
    expect(isMarketArea({ name: 'Local Store', category: 'SHOPPING', tags: ['night-market'] })).toBe(true);

    expect(isCommercialBusinessPlace({ name: 'Sarojini Nagar Market', category: 'SHOPPING' })).toBe(false);
    expect(isCommercialBusinessPlace({ name: 'DLF Mall of India', category: 'SHOPPING' })).toBe(false);
    expect(isCommercialBusinessPlace({ name: 'Chandni Chowk', category: 'market' })).toBe(false);
  });

  it('does not treat "Smallwood" style substrings as a mall', () => {
    expect(isMarketArea({ name: 'Smallwood Boutique', category: 'SHOPPING' })).toBe(false);
    expect(isMarketArea({ name: 'Supermarket Express', category: 'SHOPPING' })).toBe(false);
  });

  it('a vendor-materialised mall still belongs to the Vendors tab', () => {
    expect(
      isCommercialBusinessPlace({ name: 'City Mall', category: 'SHOPPING', source: 'VENDOR', externalId: 'vendor:9' }),
    ).toBe(true);
  });

  it('never hides non-commercial categories', () => {
    expect(isCommercialBusinessPlace({ name: 'Taj Mahal', category: 'MONUMENT' })).toBe(false);
    expect(isCommercialBusinessPlace({ name: 'Marine Drive', category: 'other' })).toBe(false);
    expect(isCommercialBusinessPlace({ name: 'X', category: null })).toBe(false);
  });
});

describe('isTouristWorthyPlace integrates the rule', () => {
  it('includes mall as a tourist category', () => {
    expect(TOURIST_CATEGORIES).toContain('mall');
    expect(TOURIST_CATEGORIES).toContain('market');
  });

  it('keeps market areas and drops vendor businesses', () => {
    expect(isTouristWorthyPlace({ name: 'Sarojini Nagar Market', category: 'SHOPPING', source: 'OSM' })).toBe(true);
    expect(isTouristWorthyPlace({ name: 'Select Citywalk Mall', category: 'mall', source: 'OSM' })).toBe(true);
    expect(isTouristWorthyPlace({ name: 'Ravi Electronics', category: 'SHOPPING', source: 'OSM' })).toBe(false);
    expect(
      isTouristWorthyPlace({ name: 'Grand Hotel', category: 'HOTEL', source: 'VENDOR', externalId: 'vendor:1' }),
    ).toBe(false);
  });
});

describe('nonCommercialPlaceWhere (Prisma)', () => {
  it('excludes vendor source and vendor external ids null-safely', () => {
    const json = JSON.stringify(nonCommercialPlaceWhere());
    expect(json).toContain('"source":"VENDOR"');
    expect(json).toContain('"externalId":null');
    expect(json).toContain('"startsWith":"vendor:"');
  });

  it('excludes commercial categories but re-admits SHOPPING market areas by name', () => {
    const where = nonCommercialPlaceWhere();
    const json = JSON.stringify(where);
    expect(json).toContain('"in":["SHOPPING","RESTAURANT","HOTEL"]');
    expect(json).toContain('"equals":"shopping"');
    expect(json).toContain('"contains":"mall"');
    expect(json).toContain('"contains":"market"');
    expect(json).toContain('"contains":"bazaar"');
    // Only an AND at the top level so it can be merged with any other where.
    expect(Object.keys(where)).toEqual(['AND']);
  });
});

describe('nonCommercialPlaceSqlText (raw SQL)', () => {
  it('mirrors the Prisma rule for the given alias', () => {
    const sql = nonCommercialPlaceSqlText('p');
    expect(sql).toContain("p.source::text <> 'VENDOR'");
    expect(sql).toContain("COALESCE(p.external_id, '') NOT LIKE 'vendor:%'");
    expect(sql).toContain("UPPER(p.category::text) NOT IN ('SHOPPING', 'RESTAURANT', 'HOTEL')");
    expect(sql).toContain("UPPER(p.category::text) = 'SHOPPING'");
    expect(sql).toMatch(/p\.name ~\* '.*mall\|market\|bazaar/);
    expect(sql).not.toContain('\\');
  });

  it('supports other aliases and rejects unsafe ones', () => {
    expect(nonCommercialPlaceSqlText('places')).toContain('places.category');
    expect(nonCommercialPlaceSqlText('ps_other')).toContain('ps_other.external_id');
    expect(() => nonCommercialPlaceSqlText('p; DROP TABLE places')).toThrow();
  });
});
