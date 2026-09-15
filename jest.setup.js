jest.mock('@shopify/flash-list', () => {
  const React = require('react');
  const { FlatList } = require('react-native');
  return {
    FlashList: FlatList,
    MasonryFlashList: FlatList,
    AnimatedFlashList: FlatList,
  };
});

jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {
    configure: jest.fn(),
    hasPlayServices: jest.fn(async () => true),
    signIn: jest.fn(async () => ({ type: 'cancelled' })),
    signOut: jest.fn(async () => undefined),
  },
  statusCodes: {
    SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED',
    IN_PROGRESS: 'IN_PROGRESS',
    PLAY_SERVICES_NOT_AVAILABLE: 'PLAY_SERVICES_NOT_AVAILABLE',
    SIGN_IN_REQUIRED: 'SIGN_IN_REQUIRED',
  },
  isSuccessResponse: (response) => response && response.type === 'success',
  isErrorWithCode: () => false,
}));
