import fs from 'fs';
import path from 'path';

describe('Place Card does not show distance or travel time', () => {
  const card = fs.readFileSync(
    path.join(__dirname, '../components/MapPlaceDetailCard.tsx'),
    'utf8',
  );
  const map = fs.readFileSync(
    path.join(__dirname, '../screens/MapScreen.tsx'),
    'utf8',
  );

  it('now renders travel time on the place card via internal hook', () => {
    expect(card).toMatch(/useTravelTime/);
    expect(card).toMatch(/formatTravelTimeLabel/);
    expect(card).toMatch(/formatDriveDistanceMeters/);
  });

  it('does not pass travel time or distance into the place card from outside', () => {
    expect(map).not.toMatch(/travelTimeLabel=\{/);
    expect(map).not.toMatch(/travelTimeLoading=\{/);
    expect(map).not.toMatch(/travelTimeUnavailable=\{/);
    expect(map).not.toMatch(/<MapPlaceDetailCard[\s\S]*distanceLabel=/);
  });

  it('still maps admin ticket price into map card entry fee', () => {
    expect(map).toMatch(/parsePlaceEntryFee/);
    expect(card).toMatch(/Not listed/);
  });
});
