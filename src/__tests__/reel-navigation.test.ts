import fs from 'fs';
import path from 'path';
import { closeReelScreen } from '../features/travelSocial/utils/closeReelScreen';

describe('reel close / back navigation', () => {
  it('goes back when there is a previous screen and does not reset tabs', () => {
    const navigation = {
      canGoBack: () => true,
      goBack: jest.fn(),
      navigate: jest.fn(),
    };
    closeReelScreen(navigation);
    expect(navigation.goBack).toHaveBeenCalledTimes(1);
    expect(navigation.navigate).not.toHaveBeenCalled();
  });

  it('returns to MainTabs when the reel was opened with an empty stack', () => {
    const navigation = {
      canGoBack: () => false,
      goBack: jest.fn(),
      navigate: jest.fn(),
    };
    closeReelScreen(navigation);
    expect(navigation.goBack).not.toHaveBeenCalled();
    expect(navigation.navigate).toHaveBeenCalledWith('MainTabs');
  });

  it('wires hardware back and an explicit close control on the full-screen viewer', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../screens/ReelDetailScreen.tsx'),
      'utf8',
    );
    expect(src).toMatch(/BackHandler\.addEventListener\('hardwareBackPress'/);
    expect(src).toMatch(/accessibilityLabel="Close Moment"/);
    expect(src).toMatch(/onPress=\{onBack\}/);
  });
});

describe('reel download option', () => {
  it('is permanently removed from reel menus and players', () => {
    const actions = fs.readFileSync(
      path.join(__dirname, '../components/reels/ReelActions.tsx'),
      'utf8',
    );
    const card = fs.readFileSync(
      path.join(__dirname, '../components/reels/ReelCard.tsx'),
      'utf8',
    );
    const feed = fs.readFileSync(
      path.join(__dirname, '../components/reels/ReelFeed.tsx'),
      'utf8',
    );
    expect(actions).not.toMatch(/Download Reel/);
    expect(card).not.toMatch(/onDownload/);
    expect(card).not.toMatch(/Downloading Reel/);
    expect(feed).not.toMatch(/onDownload/);
  });
});

describe('reel seek controls', () => {
  it('claims horizontal seeking without capturing vertical reel paging', () => {
    const progressBar = fs.readFileSync(
      path.join(__dirname, '../components/reels/ReelProgressBar.tsx'),
      'utf8',
    );
    expect(progressBar).toMatch(/onStartShouldSetPanResponderCapture:\s*\(\)\s*=>\s*false/);
    expect(progressBar).toMatch(/shouldClaimHorizontalScrub/);
    expect(progressBar).toMatch(/shouldYieldToVerticalPaging/);
    expect(progressBar).toMatch(/locationX/);
    expect(progressBar).toMatch(/onPanResponderGrant/);
    expect(progressBar).toMatch(/onPanResponderMove/);
    expect(progressBar).toMatch(/onPanResponderRelease/);
    expect(progressBar).toMatch(/emitSeek\(next/);
    expect(progressBar).toMatch(/height:\s*44/);
  });

  it('routes the progress percentage through ReelPlayer to native video seek', () => {
    const card = fs.readFileSync(
      path.join(__dirname, '../components/reels/ReelCard.tsx'),
      'utf8',
    );
    const player = fs.readFileSync(
      path.join(__dirname, '../components/reels/ReelPlayer.tsx'),
      'utf8',
    );
    expect(card).toMatch(/if \(!isActive\) return/);
    expect(card).toMatch(/playerRef\.current\?\.seekToPercent\(pct\)/);
    expect(player).toMatch(/if \(!isActiveRef\.current\) return/);
    expect(player).toMatch(/percentToSeekTime\(durationRef\.current, pct\)/);
    expect(player).toMatch(/seekVideoToPercent\(player, durationRef\.current, pct\)/);
    expect(player).toMatch(/durationRef\.current = data\.duration/);
    expect(player).toMatch(/onProgress\?\.\(clampReelProgress\(progress\)\)/);
    expect(player).toMatch(/durationRef\.current = 0/);
  });

  it('uses canonical PalSafar handles for creator profile navigation', () => {
    const feed = fs.readFileSync(
      path.join(__dirname, '../screens/ReelsFeedScreen.tsx'),
      'utf8',
    );
    const detail = fs.readFileSync(
      path.join(__dirname, '../screens/ReelDetailScreen.tsx'),
      'utf8',
    );
    const card = fs.readFileSync(
      path.join(__dirname, '../components/reels/ReelCard.tsx'),
      'utf8',
    );
    expect(feed).toMatch(/extractCreatorHandle\(creator\?\.username\)/);
    expect(detail).toMatch(/extractCreatorHandle\(creator\?\.username\)/);
    expect(card).toMatch(/authorVerified=\{!!creator\?\.verified\}/);
  });
});
