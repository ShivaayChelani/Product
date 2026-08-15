# Licensed India boundary dataset integration

PalSafar does **not** ship government boundary geometry. Polygon validation activates only when operations deploy **licensed** GeoJSON locally.

## Required files

Place under `BOUNDARY_DATA_DIR`:

| File | Feature properties |
|------|-------------------|
| `states.geojson` | `state` (or `name`) |
| `districts.geojson` | `district`, `state` |

## Legal gate

```env
BOUNDARY_DATA_LICENSE_ACKNOWLEDGED=true
BOUNDARY_DATA_DIR=/secure/boundaries/india
```

Set `BOUNDARY_DATA_LICENSE_ACKNOWLEDGED=true` only after legal review of dataset terms (e.g. data.gov.in / LGD redistribution policy).

## Validation behavior

- **Without datasets:** India bbox only; `stateValid` / `districtValid` remain `null`.
- **With datasets:** point-in-polygon checks; compare against place `state` / `district` text (normalized).

## Jobs

```bash
npm run job:boundary-scan -- --limit=500
```

## PostGIS upgrade (optional)

For large polygons, load GeoJSON into PostGIS and replace in-memory checks with `ST_Contains` — integration point reserved in `boundary-dataset.provider.ts`.
