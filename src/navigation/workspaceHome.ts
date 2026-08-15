export function navigateToWorkspaceHome(
  navigation: { navigate: (name: string, params?: object) => void },
  workspace: 'CREATOR' | 'VENDOR' | 'USER' = 'USER',
): void {
  if (workspace === 'VENDOR') {
    navigation.navigate('VendorTabs', { screen: 'Home' });
    return;
  }
  if (workspace === 'CREATOR') {
    navigation.navigate('CreatorTabs', { screen: 'Dashboard' });
    return;
  }
  navigation.navigate('MainTabs', { screen: 'Home' });
}
