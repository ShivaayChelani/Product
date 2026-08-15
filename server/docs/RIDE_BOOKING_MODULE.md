# Ride Assistant Module (Deeplink-Only)

PalSafar is a **travel assistant**, not a ride-hailing provider. The Ride Assistant opens official provider apps and booking websites via server-generated deep links. No fares, ETAs, distances, routing, or in-app bookings.

## Architecture

```
React Native (Ride Assistant UI)
  → Express (/api/v1/rides)
    → RideProviderRegistry / RideProviderFactory
      → Provider Adapters (Uber, Ola, Rapido, BluSmart)
        → RideLauncher → Official deep links / web URLs
```

Future **API mode** is supported in adapters and DB config; UI unchanged when partner credentials are wired.

## Provider Abstraction (Server)

| Component | File | Role |
|-----------|------|------|
| `IRideProvider` | `interfaces/ride-provider.interface.ts` | Adapter contract |
| `BaseRideProvider` | `providers/base-ride.provider.ts` | Deeplink-only base; API methods throw |
| `RideProviderFactory` | `providers/provider.registry.ts` | Resolves built-in adapters |
| `RideLauncher` | `services/ride-launcher.service.ts` | Generates links, logs open events |
| `RideProviderService` | `services/ride-provider.service.ts` | Lists providers with capabilities |

## Rules

| Allowed | Not allowed |
|---------|-------------|
| Official deep links | Unofficial/scraped APIs |
| Public booking URLs | Fake fares, ETA, distance |
| Device GPS coordinates | In-app booking |
| Partner API (when credentialed) | Reverse-engineered endpoints |

## API

### `GET /api/v1/rides/providers`

Query (optional): `pickupLatitude`, `pickupLongitude` — filters by provider service region.

Response includes: `status`, `capabilities`, `supportsDeepLink`, `supportsWebBooking`.

### `POST /api/v1/rides/open`

Body: `provider`, pickup/destination coordinates and addresses, optional `vehicleType`.

Response: `deepLink`, `webFallbackLink`, `playStore`, `appStore`.

## Mobile

`src/features/rideOptions/` — Ride Assistant sheet, provider cards with **Open App** / **Open Website**.

Provider abstraction: `src/features/rideOptions/providers/` — `RideLauncher`, `RideProviderConfig`, types.

Disclaimer: *"PalSafar is a travel assistant — not a ride-hailing provider. Pricing, ETA, and driver availability are shown inside the provider's app."*

## Database

- `ride_providers` — config (mode, URLs, priority)
- `ride_requests` — open events (**no fare column**)
- `ride_history` — audit trail

## Env

```env
JWT_SECRET=          # required (existing)
REQUEST_TIMEOUT=10000
```

No provider API keys required for deeplink mode.

## Tests

```bash
cd server && npx vitest run src/__tests__/rides
```
