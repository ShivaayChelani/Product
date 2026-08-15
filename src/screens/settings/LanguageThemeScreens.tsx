import React from 'react';
import { ScrollView, View, StyleSheet, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { SettingsTheme as T } from '../../features/settings/theme';
import { SettingsHeroHeader } from '../../features/settings/components/SettingsHeroHeader';
import { SettingsSection, type SettingsRowModel } from '../../features/settings/components/SettingsSection';
import { useUserAppSettings, usePatchUserAppSettings } from '../../features/settings/hooks/useUserAppSettings';
import { useUserContext } from '../../context/UserContext';
import { useSettingsStore } from '../../features/settings/store/settingsStore';
import { useBottomSafePadding } from '../../design/responsive';

export function LanguageSettingsScreen() {
  const nav = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const pad = useBottomSafePadding(24);
  const { isAuthenticated } = useUserContext();
  const { data } = useUserAppSettings(isAuthenticated);
  const patch = usePatchUserAppSettings();
  const setLanguage = useSettingsStore(s => s.setLanguage);

  const pick = (language: 'en' | 'hi' | 'auto') => {
    setLanguage(language);
    patch.mutate({ language });
  };

  const rows: SettingsRowModel[] = [
    {
      key: 'en',
      icon: 'text-outline',
      title: 'English',
      rightText: data?.language === 'en' ? '✓' : undefined,
      onPress: () => pick('en'),
    },
    {
      key: 'hi',
      icon: 'text-outline',
      title: 'Hindi',
      rightText: data?.language === 'hi' ? '✓' : undefined,
      onPress: () => pick('hi'),
    },
    {
      key: 'auto',
      icon: 'phone-portrait-outline',
      title: 'Auto Detect',
      rightText: data?.language === 'auto' ? '✓' : undefined,
      onPress: () => pick('auto'),
    },
  ];

  return (
    <ScrollView style={styles.root} contentContainerStyle={{ paddingBottom: pad }}>
      <SettingsHeroHeader title="Language" subtitle="Switch app language instantly" onBack={() => nav.goBack()} topInset={insets.top} compact />
      <View style={styles.body}>
        <SettingsSection title="Language" items={rows} />
      </View>
    </ScrollView>
  );
}

export function ThemeSettingsScreen() {
  const nav = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const pad = useBottomSafePadding(24);
  const { isAuthenticated } = useUserContext();
  const { data } = useUserAppSettings(isAuthenticated);
  const patch = usePatchUserAppSettings();
  const setTheme = useSettingsStore(s => s.setTheme);

  const pick = (theme: 'light' | 'system') => {
    setTheme(theme);
    patch.mutate({ appearance: { theme } });
    if (theme === 'system') {
      Alert.alert('Theme', 'System default is active. Dark mode will arrive in a future update.');
    }
  };

  const rows: SettingsRowModel[] = [
    {
      key: 'light',
      icon: 'sunny-outline',
      title: 'Light',
      rightText: data?.appearance.theme === 'light' ? '✓' : undefined,
      onPress: () => pick('light'),
    },
    {
      key: 'system',
      icon: 'contrast-outline',
      title: 'System Default',
      rightText: data?.appearance.theme === 'system' ? '✓' : undefined,
      onPress: () => pick('system'),
    },
  ];

  return (
    <ScrollView style={styles.root} contentContainerStyle={{ paddingBottom: pad }}>
      <SettingsHeroHeader title="Theme" subtitle="Light luxury theme (dark mode coming soon)" onBack={() => nav.goBack()} topInset={insets.top} compact />
      <View style={styles.body}>
        <SettingsSection title="Appearance" items={rows} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.bg },
  body: { paddingTop: 16 },
});
