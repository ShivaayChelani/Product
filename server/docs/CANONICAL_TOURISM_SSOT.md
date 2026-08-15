# PalSafar Canonical Tourism SSOT

Single source of truth for India tourist destinations. **Quality over quantity.**

## Architecture layers

| Layer | Location | Purpose |
|-------|----------|---------|
| Identity | `places.public_place_id` (`PS-IN-{ST}-{DIST}-{seq}`) | Permanent external ID; assigned at verification |
| Canonical row | `places` + `merged_into_id` | One live row per destination |
| Aliases | `place_aliases` | All alternate names → same internal `id` |
| Provenance | `place_field_provenance`, `place_versions`, `place_change_history` | Field sources + rollback |
| Quality | `place_quality_checks`, `data_quality`, scores | Gate before `VERIFIED` |
| Duplicates | `place_duplicate_candidates`, merge logs | Detect → merge, never insert dup |
| Media rights | `place_images.*` license fields + `image-rights.service` | Legal use only |
| GIS | PostGIS `location`, `place_boundary_validation` | Bbox today; LGD polygons pending |
| Search | FTS + pg_trgm + alias table | Typo / alias / Hindi text in aliases |
| Ratings | Reviews → `bayesian_rating` | No synthetic production ratings |

## Admin APIs (`/api/v1/admin/canonical`)

- `GET /status` — platform metrics
- `GET /resolve?q=` — alias → canonical place id
- `GET /duplicates` — open duplicate candidates
- `POST /duplicates/score` — score a pair
- `POST /places/:id/verify` — promote to `VERIFIED` + allocate `public_place_id`

Existing place admin APIs: merge, aliases under `/admin/places/*`.

## Ingestion rules

1. **Never** bulk-import into `VERIFIED`.
2. Raw OSM/Wikidata → `DRAFT` only (`npm run db:import:india`).
3. Human-curated JSON → `npm run db:canonical:ingest -- prisma/seed-data/canonical/<file>.json`.
4. Run duplicate scan → merge → verify.

## Migrations

```bash
cd server
npx prisma migrate deploy
```

## Acceptance criteria — honest status (2026-07-29)

| Criterion | Status | Notes |
|-----------|--------|-------|
| One canonical record per destination | **Partial** | Merge model live; ~113k legacy rows need dedupe job |
| Zero duplicates | **Not met** | Requires `canonical-dedupe` + admin review at scale |
| Alias → same Place ID | **Met (API/search)** | DB aliases + resolve endpoint |
| Permanent public Place ID | **Met (on verify)** | Format `PS-IN-MP-JBP-000001` |
| Coordinates validated (India) | **Met (bbox)** | State/district polygons **blocked on LGD shapefiles** |
| Licensed images only in VERIFIED | **Met (policy + validation)** | Admin review workflow required |
| Factual descriptions only | **Process** | No AI ingest; human curated JSON |
| Authentic ratings | **Met (policy)** | Bayesian from reviews; synthetic backfill disabled |
| Full audit trail | **Partial** | Versions/history on verify; extend to all edits |
| Semantic search | **Not available** | Needs embedding provider + license |
| Image perceptual hash | **Schema only** | Needs image pipeline (e.g. sharp + pHash) |
| Nightly automation jobs | **Not deployed** | Spec in `canonical/jobs` (future cron) |
| Enterprise admin UI | **Not built** | APIs ready; admin UI pending |
| 100% test coverage | **Not met** | Core unit tests in `canonical.test.ts` |
| OpenAPI complete | **Partial** | Extend swagger for `/admin/canonical` |
| Production deployment | **Incremental** | Non-breaking additive migrations |

## Blocked without external authoritative data

- **State/district boundary validation** — requires India LGD / Survey of India / OSM admin polygons with license review.
- **TripAdvisor / Google ratings** — third-party API terms + licensing.
- **Semantic / vector search** — model hosting + compliance review.
- **True perceptual duplicate images** — media processing infrastructure.

Do **not** fabricate any of the above.

## Next engineering phases

1. Run migration + dedupe merge on legacy data (staging first).
2. Quarantine `DRAFT` from public search (`?verifiedOnly=true` or default in prod).
3. Build admin dashboards (merge, alias, image license, verify).
4. Integrate LGD shapefiles for boundary validation.
5. Nightly jobs: duplicate scan, broken image scan, quality report.
