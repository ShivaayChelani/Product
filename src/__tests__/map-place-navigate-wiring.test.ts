import fs from 'fs';
import path from 'path';

describe('Map Place Card Navigate wiring', () => {
  const card = fs.readFileSync(
    path.join(__dirname, '../components/MapPlaceDetailCard.tsx'),
    'utf8',
  );
  const map = fs.readFileSync(
    path.join(__dirname, '../screens/MapScreen.tsx'),
    'utf8',
  );
  const leaflet = fs.readFileSync(
    path.join(__dirname, '../utils/leafletMapHtml.ts'),
    'utf8',
  );

  it('does not let swipe-to-dismiss steal Navigate taps', () => {
    expect(card).toMatch(/style=\{styles\.dragRegion\}/);
    expect(card).toMatch(/\{\.\.\.panResponder\.panHandlers\}/);
    expect(card).toMatch(/collapsable=\{false\}/);
    expect(card).not.toMatch(/onStartShouldSetResponder/);
    expect(card).toMatch(/accessibilityLabel="Navigate"/);
    expect(card).toMatch(/onPress=\{onNavigate\}/);
    expect(card).toMatch(/onPress=\{isVendor && onViewVendor \? onViewVendor : onAddToTrip\}/);
    expect(card).toMatch(/onBookRide/);
  });

  it('starts in-app routing through the navigation-specific GPS planner', () => {
    expect(map).toMatch(/<MapPlaceDetailCard[\s\S]*onNavigate=\{handleNavigate\}/);
    expect(map).toMatch(/planMapPlaceNavigate/);
    expect(map).toMatch(/logMapNavigate/);
    expect(map).toMatch(/isNavigableUserPosition/);
    expect(map).toMatch(/selectedMarkerRef\.current \?\? selectedMarker/);
    expect(map).toMatch(/await calculateRoute/);
    expect(map).toMatch(/type:\s*'drawRoute'/);
    expect(map).toMatch(/coords:\s*leafletGeometry/);
    expect(map).toMatch(/setIsNavigating\(true\)/);
    expect(leaflet).toMatch(/drawRoute:\s*drawRoute/);
    expect(leaflet).toMatch(/clearRoute:\s*clearRoute/);
    expect(map).toMatch(/MAP_NAVIGATE_MESSAGES/);
    expect(map).toMatch(/try \{[\s\S]*await calculateRoute[\s\S]*Alert\.alert\('Routing error'/);
    expect(map).toMatch(/requestFreshPosition/);
    expect(map).toMatch(/Close the card immediately so the map and road path are visible/);
    expect(map).toMatch(/setSelectedMarker\(null\);\s*lockMapView\(\);/);
  });

  it('does not change vendor map Navigate wiring', () => {
    expect(map).toMatch(/MapVendorDetailCard[\s\S]*onNavigate=\{handleNavigate\}/);
  });
});
