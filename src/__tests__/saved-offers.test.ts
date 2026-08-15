import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadSavedOfferIds, toggleSavedOfferId } from '../utils/savedOffers';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}));

describe('saved offers', () => {
  beforeEach(() => {
    (AsyncStorage.getItem as jest.Mock).mockReset();
    (AsyncStorage.setItem as jest.Mock).mockReset();
    (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
  });

  it('returns an empty list when nothing is stored', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    await expect(loadSavedOfferIds()).resolves.toEqual([]);
  });

  it('toggles an offer id on and off', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(JSON.stringify([]));
    const added = await toggleSavedOfferId('off_1');
    expect(added).toEqual(['off_1']);
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      'PALSAFAR_SAVED_OFFERS',
      JSON.stringify(['off_1']),
    );

    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(JSON.stringify(['off_1']));
    const removed = await toggleSavedOfferId('off_1');
    expect(removed).toEqual([]);
  });
});
