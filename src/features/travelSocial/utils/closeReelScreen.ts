type ReelNav = {
  canGoBack: () => boolean;
  goBack: () => void;
  navigate: (name: string, params?: object) => void;
};

/**
 * Close a full-screen reel viewer without resetting unrelated tabs.
 * Hardware back and the explicit close control must use this.
 * `fallback` names the screen to land on when the viewer has no back
 * stack (cold-start deep link). Logged-out shells have no MainTabs.
 */
export function closeReelScreen(navigation: ReelNav, fallback = 'MainTabs'): void {
  if (navigation.canGoBack()) {
    navigation.goBack();
    return;
  }
  navigation.navigate(fallback);
}
