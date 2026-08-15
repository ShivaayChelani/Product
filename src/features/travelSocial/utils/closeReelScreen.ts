type ReelNav = {
  canGoBack: () => boolean;
  goBack: () => void;
  navigate: (name: string, params?: object) => void;
};

/**
 * Close a full-screen reel viewer without resetting unrelated tabs.
 * Hardware back and the explicit close control must use this.
 */
export function closeReelScreen(navigation: ReelNav): void {
  if (navigation.canGoBack()) {
    navigation.goBack();
    return;
  }
  navigation.navigate('MainTabs');
}
