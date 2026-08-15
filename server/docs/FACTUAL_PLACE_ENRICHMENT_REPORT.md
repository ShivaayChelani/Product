# Factual Place Enrichment Report

**Generated:** 2026-08-01  
**Policy:** Wikidata, OpenStreetMap, Nominatim, and PostGIS proximity only. No AI-generated or invented content. Empty fields remain NULL.

---

## Enterprise pipeline (new)

| Command | Purpose |
|---------|---------|
| `npm run job:enterprise-pipeline` | Full phased pipeline (dedupe → boundary → wikidata → osm → scores → report) |
| `npm run job:completeness-scores` | Recalculate weighted completeness % (`qualityScore`) |
| `npm run job:enterprise-report` | Coverage, gaps, quality distribution report |

Extended enrichment now fills structured sections in `highlights` JSON (never overwrites existing verified values):

| Section | Fields | Sources |
|---------|--------|---------|
| `visitorInfo` | Opening hours, fees, parking, wheelchair, washrooms, food, photography, pets, booking URL, contact | OSM tags, Wikidata P856/P1329 |
| `tourismContent` | Why famous, architecture, built-by, ASI/UNESCO, historical period, natural features | Wikidata P1435/P757/P921/P706 |
| `travelAccess` | Nearest railway/airport/bus + distance (when in Wikidata qualifiers) | Wikidata P931 |
| `officialActivities` | Boating, safari, ropeway, museum tour, etc. | OSM explicit tags only |

**Nearby linking** (PostGIS, `--link-nearby`): attractions, hotels, restaurants, parking, hospitals, fuel — stored as `NEARBY` relationships with `metadata.nearbyCategory`.

**Wikidata places** also fetch OSM tags via Wikidata P402 when available.

Completeness scores recalculate automatically after each batch (`recalcScores: true`).

---

## Corpus overview

| Segment | Count | Enrichment source |
|---------|------:|-------------------|
| Total canonical places | 113,423 | — |
| Wikidata-linked (`wikidata:Q…`) | 5,202 | Wikidata API + optional Nominatim |
| OSM-linked (`osm:…`) | 79,983 | OSM tags + optional Nominatim |
| Other (no Wikidata/OSM external ID) | ~28,238 | Manual review / ID matching required |

---

## Pipeline

| Script | Purpose |
|--------|---------|
| `npm run job:factual-enrichment` | Single batch (`--limit`, `--offset`, `--source`, `--nominatim`, `--link-nearby`, `--dry-run`) |
| `npm run job:factual-enrichment:all` | Full corpus in batches with checkpoint resume |

**Deprecated (do not run):** `scripts/enrich-places.ts` — previously generated synthetic descriptions.

Provenance for every filled field is stored in `place_field_provenance` with `sourceType` and `sourceUri`.

---

## Pilot batch — 50 Wikidata places (LIVE)

**Report files:**
- `server/reports/ops/enrichment/factual-enrichment-2026-08-01T04-03-33-001Z.json`
- `server/reports/ops/enrichment/factual-enrichment-2026-08-01T04-03-33-001Z.md`

### Summary

| Metric | Count |
|--------|------:|
| Places processed | 50 |
| Places enriched (≥1 field filled) | 48 |
| Unchanged | 2 |
| Errors | 2 (transient; re-run succeeded) |
| Requiring manual review | 7 |

### Fields completed (pilot)

| Field | Filled | Left NULL | Skipped (existing) |
|-------|-------:|----------:|-------------------:|
| aliases | 47 | 1 | 0 |
| hindiName | 26 | 22 | 0 |
| localLanguageName | 21 | 27 | 0 |
| description | 15 | 0 | 33 |
| shortDescription | 15 | 0 | 0 |
| history | 29 | 19 | 0 |
| website | 22 | 26 | 0 |
| contactInformation | 5 | 43 | 0 |
| state | 48 | 0 | 0 |
| district | 48 | 0 | 0 |
| city | 44 | 4 | 0 |
| fullAddress | 48 | 0 | 0 |
| searchKeywords | 47 | 1 | 0 |
| elevation | 5 | 43 | 0 |
| latitude / longitude | 0 | 0 | 48 (already present) |

### Fields intentionally left NULL (no authoritative source)

| Field | Reason |
|-------|--------|
| bestTimeToVisit | Not inferrable from Wikidata/OSM without fabrication |
| thingsToDo | Not inferrable without curated sources |
| foodNearby | Not inferrable without curated sources |
| openingHours | Wikidata batch — OSM tag required (`--source=osm`) |
| entryFee | OSM `fee` tag required |
| accessibility / parking | OSM `wheelchair` / `parking` tags required |
| nearbyAttractions | Requires `--link-nearby` (PostGIS proximity) |
| heritageStatus | Only when Wikidata heritage claims exist |

---

## Places requiring manual review (pilot)

| Place | Reason |
|-------|--------|
| Government Museum and Art Gallery, Chandigarh | City still invalid after Nominatim |
| Sir Cowasji Jehangir Public Hall | City still invalid after Nominatim |
| Taraporewala Aquarium | City still invalid after Nominatim |
| Mani Bhavan | City still invalid after Nominatim |
| Jijamata Udyaan | City still invalid after Nominatim |
| Bengaluru Aquarium | Transient DB error on first run (enriched on retry) |
| Asiatic Society of Mumbai | Transient DB error on first run (enriched on retry) |

---

## Full corpus run (in progress)

```bash
cd server
npm run job:factual-enrichment:all -- --source=wikidata --nominatim --batch-size=100
```

**Estimated duration:** ~2–3 hours for 5,202 Wikidata places (Nominatim rate limit ~1 req/sec).

**After Wikidata completes, run OSM batch:**

```bash
npm run job:factual-enrichment:all -- --source=osm --nominatim --link-nearby --batch-size=100
```

**Estimated duration:** ~12–24 hours for 79,983 OSM places (OSM API + Nominatim).

Checkpoint file: `server/reports/ops/enrichment/checkpoint-{source}.json`  
Final report: `server/reports/ops/enrichment/factual-enrichment-full-{source}-*.json`

---

## ~28,238 places without Wikidata/OSM IDs

These cannot be enriched automatically. Recommended actions:

1. Match to Wikidata QIDs via name + coordinates search
2. Match to OSM nodes/ways via Overpass
3. Admin curation for high-priority destinations

---

## Field mapping reference

| User field | DB / mechanism | Source |
|------------|----------------|--------|
| Canonical Name | `places.name` | Existing ingest (not overwritten) |
| Aliases | `place_aliases` | Wikidata labels/aliases |
| Hindi Name | `place_translations` (locale `hi`) | Wikidata `labels.hi` or OSM `name:hi` |
| Local Language Name | `place_translations` (locale `local`) | Wikidata regional labels |
| Description | `places.description` | Wikidata description or Wikipedia lead |
| History | `places.history` | Wikidata P571 inception year only |
| Highlights | `places.highlights` | Contact info from Wikidata P1329/P968 |
| Opening Hours | `places.openingHours` | OSM `opening_hours` |
| Entry Fee | `places.ticketPrice` | OSM `fee` / `charge` |
| Accessibility | `places.isAccessible`, `accessibilityDetails` | OSM `wheelchair` |
| Parking | `places.hasParking`, `parkingDetails` | OSM `parking` |
| Nearby Attractions | `place_relationships` (NEARBY) | PostGIS 15 km proximity |
| Official Website | `places.website` | Wikidata P856 or OSM `website` |
| Contact Information | `places.highlights.contact` | Wikidata phone/email or OSM `contact:*` |
| Latitude / Longitude | `places.latitude/longitude` | Wikidata P625 (fill if missing) |
| State / District / City | `places.state/district/city` | OSM addr tags or Nominatim reverse geocode |
| Search Keywords | `places.searchKeywords` | Derived from aliases |

---

*Sources: [Wikidata API](https://www.wikidata.org/wiki/Wikidata:Data_access), [OpenStreetMap API](https://wiki.openstreetmap.org/wiki/API), [Nominatim](https://nominatim.org/release-docs/develop/api/Reverse/), PostGIS `ST_DWithin`.*
