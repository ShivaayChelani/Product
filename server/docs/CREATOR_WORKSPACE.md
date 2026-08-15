# Creator Workspace

Production creator dashboard for PalSafar content creators.

## API (`/api/v1/creator/*`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/dashboard` | Studio overview, today's goal, metrics |
| GET | `/analytics?period=7d\|30d\|90d\|all` | KPIs + daily view series from reel aggregates |
| GET | `/profile` | Authenticated creator profile |
| PATCH | `/profile` | Update profile |
| GET | `/reels?status=` | Paginated reels with optional status filter |
| POST | `/reels` | Publish reel |
| POST | `/drafts` | Save draft |
| POST | `/drafts/:id/publish` | Publish draft |
| DELETE | `/reels/:id` | Delete reel |
| GET | `/reels/:id/analytics` | Per-reel insights |
| GET | `/resources` | Hashtags, tips, events |
| GET | `/collaborations` | Brand collab inbox (extensible) |
| GET | `/challenges` | Creator challenges |
| GET | `/leaderboard` | Top creators |

Legacy social endpoints remain at `/api/v1/social/*`.

## Mobile

Feature module: `src/features/creator/`

- React Query hooks: `useCreatorDashboard`, `useCreatorAnalytics`, `useCreatorReels`, `useCreatorResources`
- Tabs: Studio · Reels · Settings (`CreatorTabs`)
- Theme: `#F8F3EA` / `#7B4A22` / `#2E241C`

## Migrations

- `20260730200000_creator_reel_statuses` — `DRAFT`, `ARCHIVED`, `SCHEDULED` reel statuses
