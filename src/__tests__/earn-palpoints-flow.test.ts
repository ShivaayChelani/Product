import fs from 'fs';
import path from 'path';

describe('Earn PalPoints option wiring', () => {
  const read = (rel: string) =>
    fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

  it('Home opens Wallet as the Earn PalPoints entry', () => {
    const tabs = read('navigation/MainTabs.tsx');
    expect(tabs).toMatch(/onNavigateToWallet=\{\(\) => navigation\.navigate\('Wallet'\)\}/);
  });

  it('Wallet earn cards navigate to real actions and do not credit on tap', () => {
    const wallet = read('screens/WalletScreen.tsx');
    expect(wallet).toMatch(/First creator reel of the day/);
    expect(wallet).toMatch(/navigation\.navigate\("CreateReel"\)/);
    expect(wallet).toMatch(/Earn by submitting hidden gem/);
    expect(wallet).toMatch(/navigation\.navigate\("AddHiddenGem"\)/);
    expect(wallet).toMatch(/Earn by Submitting Business Review/);
    expect(wallet).toMatch(/navigateToVendorReviewMap\(navigation\)/);
    expect(wallet).toMatch(/Earn by watching Ads/);
    expect(wallet).toMatch(/handleWatchAd/);
    expect(wallet).toMatch(/Earn by uploading place photo/);
    expect(wallet).toMatch(/navigation\.navigate\("UploadPlacePhoto"\)/);
    expect(wallet).toMatch(/Earn by completing Itinerary/);
    expect(wallet).toMatch(/navigation\.navigate\("MyTrips"\)/);
    expect(wallet).toMatch(/Earn by daily login/);
    expect(wallet).toMatch(/handleClaimDaily/);
    expect(wallet).toMatch(/useFocusEffect/);
    expect(wallet).toMatch(/initialTab/);
    expect(wallet).not.toMatch(/walletApi\.earn/);
    expect(wallet).not.toMatch(/palPoints\s*\+/);
  });

  it('Wallet ad and daily login guard double taps and only refresh after a server-backed result', () => {
    const wallet = read('screens/WalletScreen.tsx');
    expect(wallet).toMatch(/if \(actionBusy\) return;/);
    expect(wallet).toMatch(/adsService\.showRewarded/);
    expect(wallet).toMatch(/if \(!result\.watched\)/);
    expect(wallet).toMatch(/walletApi\.claimDailyLogin/);
    expect(wallet).toMatch(/alreadyClaimed/);
    expect(wallet).toMatch(/dailyStatus\?\.claimedToday/);
  });

  it('PalPoints ways-to-earn keep Daily Login on the Wallet earn tab', () => {
    const palPoints = read('screens/PalPointsScreen.tsx');
    expect(palPoints).toMatch(/navigateToVendorReviewMap/);
    expect(palPoints).toMatch(/navigation\.navigate\('Wallet', \{ initialTab: 'earn' \}\)/);
    expect(palPoints).toMatch(/useFocusEffect/);
  });

  it('Map consumes explicit vendor tab on first mount and when already mounted', () => {
    const map = read('screens/MapScreen.tsx');
    expect(map).toMatch(/resolveExplicitMapTab/);
    expect(map).toMatch(/shouldRestoreSavedMapTab/);
    expect(map).toMatch(/shouldOpenRoutedPlaceOnMap/);
    expect(map).toMatch(/appliedExplicitTabAfterReadyRef/);
    expect(map).toMatch(/skipSessionTabRestoreRef/);
    const segment = read('features/mapExplore/components/MapSegmentControl.tsx');
    expect(segment).toMatch(/mapSegmentThumbX/);
    expect(segment).toMatch(/setSegmentWidth/);
    expect(segment).toMatch(/from '\.\.\/utils\/mapSegmentThumb'/);
  });
});
