# PalSafar

A gamified tourism discovery platform — mobile app for travelers, vendor dashboard for businesses, and web admin panel for platform management. Built with React Native, Express, and Next.js.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Mobile App (React Native)          │
│  src/  →  Navigation  →  Screens  →  Services       │
└──────────────────────┬──────────────────────────────┘
                       │ HTTP/WebSocket
┌──────────────────────▼──────────────────────────────┐
│            API Server (Express + TypeScript)          │
│  Modules  →  Middleware  →  Prisma ORM  →  PostgreSQL│
└─────────────────────────────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────┐
│         Admin Dashboard (Next.js 14)                │
│  App Router  →  Dashboard Pages  →  API Routes      │
└─────────────────────────────────────────────────────┘
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Mobile Framework | React Native 0.81 (CLI) |
| Admin Dashboard | Next.js 14 (App Router) |
| API Server | Express + TypeScript |
| Database | PostgreSQL (Render, Singapore) |
| ORM | Prisma |
| Map | MapLibre GL Native (OpenFreeMap tiles) |
| Navigation | React Navigation 7 |
| Payments | Razorpay |
| Push Notifications | Firebase Cloud Messaging |
| Crash Reporting | Sentry |
| Validation | Zod |
| Logging | Pino |
| CI/CD | GitHub Actions |

## Project Structure

```
PalSafar/
├── src/                    # React Native mobile app
│   ├── navigation/         # Auth guard + role-based routing
│   ├── screens/            # 25+ screens
│   ├── components/         # Reusable UI components
│   ├── context/            # Theme, User, Data, Location
│   ├── features/           # Feature modules (buildTrip, mapExplore, notifications, etc.)
│   ├── services/           # API clients, location, notification services
│   ├── types/              # TypeScript interfaces
│   ├── utils/              # Helpers and utilities
│   ├── hooks/              # Custom hooks
│   └── config/             # App configuration, theme, dev flags
├── server/                 # Express + TypeScript API
│   ├── src/
│   │   ├── app.ts          # Express app setup + route mounting
│   │   ├── config/         # DB, cache, events, rate-limit, Sentry
│   │   ├── middleware/     # Auth, validation, admin guard, error handling
│   │   ├── modules/        # Feature modules (30+ modules)
│   │   ├── shared/         # Pagination, geo utils, errors
│   │   └── __tests__/      # Integration tests
│   ├── prisma/
│   │   ├── schema.prisma   # Full DB schema
│   │   ├── migrations/     # Database migrations
│   │   ├── seeds/          # Organized seed scripts
│   │   └── seed-data/      # Seed data files (large files downloaded separately)
│   └── package.json
├── admin/                  # Next.js 14 admin dashboard
│   ├── src/app/            # App Router pages
│   │   └── dashboard/      # 25+ dashboard management pages
│   └── package.json
├── shared/                 # Shared TypeScript package
├── android/                # Android native project
├── ios/                    # iOS native project
├── assets/                 # Static assets (fonts, images)
├── scripts/                # Build and utility scripts
└── .github/workflows/      # CI/CD pipeline definitions
```

## Installation

### Prerequisites

- Node.js 18+
- npm
- PostgreSQL database (Render PostgreSQL in production; local PostGIS for development/tests)
- React Native CLI setup (Android Studio / Xcode)
- Android SDK / Xcode (for mobile builds)

### Server Setup

```bash
cd server
npm install
cp .env.example .env        # Edit with your credentials (DATABASE_URL = Render Postgres)
npx prisma migrate deploy   # Apply migrations (never use migrate reset / db push on production)
npm run db:seed             # Seed initial data
npm run dev                 # Starts on port 5000
```

**Seed data:** Large data files are not stored in Git. Run the downloader before seeding:
```bash
bash scripts/download-seed-data.sh
```

### Admin Dashboard

```bash
cd admin
npm install
cp .env.example .env.local  # Edit with your API URL
npm run dev                 # Starts on port 3000
```

### Mobile App

```bash
npm install
npx react-native run-android   # or run-ios
```

Set `USE_SERVER_API: true` in `src/config/devFlags.ts` to connect to the API server.

### Firebase Setup

This project uses Firebase for push notifications (FCM) on Android.

1. **Create a Firebase project** at [console.firebase.google.com](https://console.firebase.google.com).
2. **Register your Android app** with package name `com.palsasafar`.
3. **Download the `google-services.json`** file from Firebase Console → Project Settings → General → Your apps.
4. **Copy the file** to the correct location:
   ```bash
   cp ~/Downloads/google-services.json android/app/google-services.json
   ```
5. **Never commit the real file** — it is listed in `.gitignore`. Only `android/app/google-services.json.example` (with placeholder values) is tracked in Git.

> The example file at `android/app/google-services.json.example` is provided as a structural reference. Replace it with your own Firebase configuration before building.

## Environment Variables

### Server (`server/.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | Render PostgreSQL connection string |
| `DIRECT_URL` | Yes | Direct URL for `prisma migrate deploy` (may match `DATABASE_URL` on Render) |
| `JWT_SECRET` | Yes | JWT signing key (min 32 chars) |
| `CLOUDINARY_CLOUD_NAME` | No | Cloudinary cloud name |
| `CLOUDINARY_API_KEY` | No | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | No | Cloudinary API secret |
| `CLIENT_URL` | Yes | Frontend URL for CORS |
| `GEMINI_API_KEY` | No | AI trip planner API key |
| `SENTRY_DSN` | No | Sentry error tracking DSN |
| `FIREBASE_*` | No | Firebase Cloud Messaging config |
| `SMTP_*` | No | Email service configuration |
| `RAZORPAY_*` | No | Payment gateway keys |

### Admin (`admin/.env.local`)

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_API_URL` | Yes | API server base URL |

### Mobile (`src/config/devFlags.ts`)

| Flag | Description |
|------|-------------|
| `USE_SERVER_API` | Toggle between mock data and API server |

## Scripts

| Script | Directory | Description |
|--------|-----------|-------------|
| `npm run dev` | server/ | Start API dev server |
| `npm run build` | server/ | Compile TypeScript |
| `npm test` | server/ | Run integration tests |
| `npm run db:seed` | server/ | Run all seed scripts |
| `npm run lint` | server/ | ESLint |
| `npm run dev` | admin/ | Start admin dashboard |
| `npm run build` | admin/ | Build admin dashboard |
| `npm run lint` | admin/ | Next.js lint |
| `bash scripts/download-seed-data.sh` | root | Download large seed data |
| `npx react-native run-android` | root | Build and run Android app |
| `npx react-native run-ios` | root | Build and run iOS app |

## Development

### Branch Naming

- `feature/description` — New features
- `fix/description` — Bug fixes
- `chore/description` — Maintenance tasks
- `docs/description` — Documentation changes

### Commit Style

Follow conventional commits: `type(scope): description`

### PR Checklist

- [ ] TypeScript compiles (`npx tsc --noEmit`)
- [ ] Tests pass (`cd server && npm test`)
- [ ] Lint passes (`npm run lint` in affected workspace)
- [ ] No new secrets committed
- [ ] Changes are restricted to relevant modules

## Production Deployment

### API Server (Render)

1. Connect GitHub repository to Render
2. Set root directory: `server`
3. Build command: `npm install && npx prisma generate && npm run build`
4. Start command: `npm start`
5. Configure all environment variables in Render dashboard

### Admin Dashboard (Vercel)

1. Import project to Vercel
2. Set root directory: `admin`
3. Configure `NEXT_PUBLIC_API_URL` environment variable
4. Deploy

### Mobile App

1. Generate a new release keystore (do NOT commit)
2. Update version in `app.json`
3. Build with `cd android && ./gradlew bundleRelease`
4. Upload to Google Play Store

## Testing

```bash
# Server API tests
cd server && npm test

# TypeScript checks
npx tsc --noEmit              # Mobile
cd server && npx tsc --noEmit # Server
cd admin && npm run build     # Admin
```

## CI/CD

GitHub Actions workflows:
- `ci.yml` — Lint, typecheck, and test on push/PR to main
- `deploy.yml` — Deploy to Render and Vercel on main
- `server-ci.yml` — Server-specific CI

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Security

See [SECURITY.md](SECURITY.md) for vulnerability reporting and disclosure policy.

## License

MIT — See [LICENSE](LICENSE).
