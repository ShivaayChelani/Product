jest.mock('@shopify/flash-list', () => {
  const React = require('react');
  const { FlatList } = require('react-native');
  return {
    FlashList: FlatList,
    MasonryFlashList: FlatList,
    AnimatedFlashList: FlatList,
  };
});
