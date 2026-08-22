# PalSafar India Tourism Database Quality Report

Generated: 2026-08-21T15:42:48.307Z

## Summary

| Metric | Value |
|--------|------:|
| Canonical active places | 473 |
| Merged (non-deleted) duplicate records | 0 |
| Total merge operations logged | 0 |
| Aliases | 0 |
| VERIFIED places | 0 |
| DRAFT places | 473 |
| PENDING_REVIEW places | 0 |
| Open duplicate candidates | 0 |
| Candidates merged | 0 |
| Candidates dismissed | 0 |
| Manual review band (0.72–0.86) | 2 |
| Missing geohash (has coords) | 0 |
| Missing coordinates | 0 |
| Geohash scan cells (precision 6) | 385 |

## Coverage by state (top 40)

| State | Places |
|-------|-------:|
| Madhya Pradesh | 462 |
| Uttar Pradesh | 11 |

## Coverage by category (top 40)

| Category | Places |
|----------|-------:|
| temple | 103 |
| heritage | 63 |
| waterfall | 35 |
| nature | 34 |
| fort | 19 |
| lake | 14 |
| museum | 14 |
| ghat | 11 |
| wildlife | 11 |
| waterfall_/_nature | 10 |
| historical_places_&_monuments | 10 |
| cave | 9 |
| dam | 9 |
| historical | 9 |
| religious | 8 |
| viewpoint | 7 |
| museums_&_cultural_attractions | 6 |
| palace | 6 |
| park | 5 |
| monument | 4 |
| market | 4 |
| mall | 3 |
| temple_/_religious_/_heritage | 3 |
| river | 3 |
| religious_&_spiritual | 3 |
| garden | 3 |
| hill | 3 |
| adventure | 3 |
| palace_/_heritage | 3 |
| ashram | 3 |
| cultural | 2 |
| heritage_/_unesco_/_hindu | 2 |
| palace_/_heritage_/_religious | 2 |
| wildlife_/_national_park | 2 |
| heritage_building | 2 |
| church | 2 |
| trekking | 2 |
| family_&_recreation | 2 |
| island | 2 |
| spiritual | 2 |

## Open duplicate candidates (sample)

- **100%** — "Bhimbetka Rock Shelters" (Madhya Pradesh) ↔ "Bhimbetka Rock Shelters" (Madhya Pradesh)
- **100%** — "Bhimbetka Rock Shelters" (Madhya Pradesh) ↔ "Bhimbetka Rock Shelters (UNESCO World Heritage Site)" (Madhya Pradesh)
- **100%** — "Bhimbetka Rock Shelters" (Madhya Pradesh) ↔ "Bhimbetka Rock Shelters (UNESCO World Heritage Site)" (Madhya Pradesh)
- **100%** — "Chaman Mahal" (Madhya Pradesh) ↔ "Chaman Mahal & Islamnagar Fort" (Madhya Pradesh)
- **100%** — "Islamnagar Fort" (Madhya Pradesh) ↔ "Chaman Mahal & Islamnagar Fort" (Madhya Pradesh)
- **79%** — "Betwa Ghat" (Madhya Pradesh) ↔ "Triveni Ghat, Betwa" (Madhya Pradesh)
- **79%** — "Khajuraho Southern Group of Temples" (Madhya Pradesh) ↔ "Khajuraho Western Group of Temples" (Madhya Pradesh)

## Production readiness notes

- One canonical row per destination: active count excludes merged_into_id chains.
- Auto-merge only above 0.86 confidence; manual review for 0.72–0.86.
- VERIFIED requires editorial + license checks (promoteToVerified).
- Run: `npm run job:india-corpus-dedupe -- --backfill=25000 --rounds=50 --auto-merge=200`