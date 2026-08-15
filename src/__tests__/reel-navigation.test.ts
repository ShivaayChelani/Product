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
    expect(src).toMatch(/accessibilityLabel="Close reel"/);
    expect(src).toMatch(/onPress=\{onBack\}/);
  });
});
