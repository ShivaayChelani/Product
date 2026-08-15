import fs from 'fs';
import path from 'path';
import { countAllStops } from '../features/buildTrip/utils/itineraryHelpers';

const root = path.join(__dirname, '..');

function read(rel: string) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

describe('countAllStops', () => {
  it('counts every place across days, including truncated list payloads', () => {
    expect(
      countAllStops({
        tripDays: [
          { stops: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }] },
          { stops: [{ id: 'e' }] },
        ],
      } as any),
    ).toBe(5);
    expect(
      countAllStops({
        stopsCount: 9,
        tripDays: [{ stops: [{ id: 'a' }], _count: { stops: 4 } }],
      } as any),
    ).toBe(9);
  });
});

describe('itinerary hardening wiring', () => {
  it('SearchWrapper adds without requiring tripId and seeds cache after success', () => {
    const src = read('navigation/RootNavigator.tsx');
    const fn = src.slice(src.indexOf('const handleAddToItinerary'), src.indexOf('return (', src.indexOf('const handleAddToItinerary')));
    expect(fn).not.toMatch(/if\s*\(\s*!tripId\s*\)\s*return/);
    expect(fn).toMatch(/quickAddPlaceToTrip/);
    expect(fn).toMatch(/alreadyExists/);
    expect(fn).toMatch(/Could not add place/);
    expect(fn).toMatch(/TripBuilder/);
  });

  it('TripBuilder focus fetches the stored draft id from the server', () => {
    const src = read('screens/TripBuilderScreen.tsx');
    expect(src).toMatch(/DRAFT_TRIP_ID_KEY/);
    expect(src).toMatch(/loadBestDraftTrip/);
    expect(src).toMatch(/forceServer:\s*true/);
    expect(src).toMatch(/tripsApi\.getById/);
    expect(src).toMatch(/serverFetchGen/);
    expect(src).not.toMatch(/setTimeout\(/);
  });

  it('quickAdd invalidates memory, drops the stale snapshot, refetches by id, and seeds the draft cache', () => {
    const src = read('utils/quickAddPlace.ts');
    expect(src).toMatch(/invalidateDraftTripCache\(\)/);
    expect(src).toMatch(/DRAFT_TRIP_SNAPSHOT_KEY/);
    expect(src).toMatch(/removeItem\(DRAFT_TRIP_SNAPSHOT_KEY\)/);
    expect(src).toMatch(/tripsApi\.getById\(result\.tripId\)/);
    expect(src).toMatch(/seedDraftTripCache/);
    expect(src).toMatch(/clearDraftTripCache/);
    expect(src).toMatch(/isCityMismatchError/);
    expect(src).toMatch(/DRAFT_TRIP_IDS_BY_CITY_KEY/);
    expect(src).toMatch(/invalidateMyTripsList/);
    expect(src).not.toMatch(/Math\.random/);
  });

  it('Explore Places on completed empty state navigates to Map, not Explore/Reels', () => {
    const src = read('screens/MyTripsScreen.tsx');
    expect(src).toMatch(/screen:\s*'Map'/);
    expect(src).not.toMatch(/screen:\s*'Explore'/);
    expect(src).toMatch(/clearDraftTripCache/);
    expect(src).toMatch(/resolveContinueNavigation/);
    expect(src).toMatch(/resolveItineraryNavigation/);
    expect(src).not.toMatch(/setTimeout\(\s*\(\)\s*=>\s*handleDelete/);
  });

  it('ItineraryScreen empty explore action already goes to Map', () => {
    const src = read('screens/ItineraryScreen.tsx');
    expect(src).toMatch(/screen:\s*'Map'/);
    expect(src).not.toMatch(/screen:\s*'Explore'/);
  });

  it('Regenerate is wired separately from Refine with AI', () => {
    const src = read('screens/TripDetailScreen.tsx');
    expect(src).toMatch(/onRegenerateItinerary=\{handleRegenerateFullItinerary\}/);
    expect(src).toMatch(/onViewInsights=\{openRefineModal\}/);
    expect(src).toMatch(/setRegenerating\(true\)/);
    expect(src).toMatch(/setRefining\(true\)/);
    expect(src).toMatch(/resume\?: boolean/);
    expect(src).toMatch(/trip\.status === 'UPCOMING'/);
    expect(src).toMatch(/handleStartTrip/);
  });

  it('does not invent itinerary places or fake success delays in itinerary utils', () => {
    const files = [
      'utils/quickAddPlace.ts',
      'utils/tripNavigation.ts',
      'screens/MyTripsScreen.tsx',
      'screens/TripBuilderScreen.tsx',
      'features/buildTrip/components/TripBuilderEmptyRoute.tsx',
    ];
    for (const file of files) {
      const src = read(file);
      expect(src).not.toMatch(/Math\.random\s*\(/);
      expect(src).not.toMatch(/fakeSuccess|mockPlaces|dummyItinerary/);
      expect(src).not.toMatch(/withTimeout/);
    }
  });

  it('Build Manually add-all does not chain mixed-city places onto one tripId', () => {
    const src = read('features/buildTrip/components/TripBuilderEmptyRoute.tsx');
    expect(src).toMatch(/quickAddPlaceToTrip\(place\.id/);
    expect(src).toMatch(/refreshTrip\(preferredTripId\)|refreshTrip\(result\.tripId\)/);
    expect(src).not.toMatch(/tripId,\s*$/m);
  });

  it('loaded TripBuilder Add More Places opens the Map screen', () => {
    const loaded = read('features/buildTrip/components/TripBuilderLoadedView.tsx');
    expect(loaded).toMatch(/navigation\.navigate\('MainTabs',\s*\{\s*screen:\s*'Map'\s*\}\)/);
    expect(loaded).toMatch(/onPress=\{handleSelectPlaces\}/);
    expect(loaded).not.toMatch(/mode:\s*'itinerary'/);
    expect(loaded).not.toMatch(/Optimize Route/);
  });

  it('itinerary place cards long-press to drag and persist the new order', () => {
    const list = read('features/buildTrip/components/ItineraryTimelineList.tsx');
    expect(list).toMatch(/from 'react-native-gesture-handler'/);
    expect(list).toMatch(/onLongPress=\{drag\}/);
    expect(list).toMatch(/delayLongPress=\{180\}/);
    const loaded = read('features/buildTrip/components/TripBuilderLoadedView.tsx');
    expect(loaded).toMatch(/tripsApi\.reorderStops/);
    expect(loaded).toMatch(/seedDraftTripCache\(nextTrip\)/);
    expect(loaded).not.toMatch(/await fetchTrip\(\);\s*\n\s*\} catch \(err: unknown\) \{\s*\n\s*showError\(\(err as \{ message\?: string \}\)\?\.message \|\| 'Reorder failed'\)/);
  });

  it('Build Your Itinerary has no Map tab and lists every day of added places', () => {
    const loaded = read('features/buildTrip/components/TripBuilderLoadedView.tsx');
    expect(loaded).not.toMatch(/BuildTripSegmentControl/);
    expect(loaded).not.toMatch(/onMapPress/);
    expect(loaded).not.toMatch(/Switch to map view/);
    expect(loaded).toMatch(/DayItinerarySection/);
    expect(loaded).toMatch(/showDayHeader=\{daysWithStops\.length > 1\}/);
    expect(loaded).toMatch(/days\.map\(\(day, dayIndex\)/);
  });

  it('itinerary Search allows a different city so a separate draft can be created', () => {
    const src = read('screens/SearchScreen.tsx');
    expect(src).toMatch(/isReplaceMode && cityFilterActive/);
    expect(src).not.toMatch(/if \(cityFilterActive && !placeMatchesKnownCity/);
  });
});
