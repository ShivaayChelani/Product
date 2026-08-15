import React, { useEffect, useState } from 'react';
import { ScrollView, View, StyleSheet, Alert, ActivityIndicator, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { SettingsTheme as T, SANS } from '../../features/settings/theme';
import { SettingsHeroHeader } from '../../features/settings/components/SettingsHeroHeader';
import { SettingsSection, type SettingsRowModel } from '../../features/settings/components/SettingsSection';
import {
  clearAppCaches,
  clearDownloads,
  countOfflineSyncPending,
  formatBytes,
  measureAppStorage,
} from '../../features/settings/utils/storageManager';
import { useBottomSafePadding } from '../../design/responsive';
import { useSettingsStore } from '../../features/settings/store/settingsStore';

export function StorageSettingsScreen() {
  const nav = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const pad = useBottomSafePadding(24);
  const [loading, setLoading] = useState(true);
  const [storage, setStorage] = useState<Awaited<ReturnType<typeof measureAppStorage>> | null>(null);

  const refresh = async () => {
    setLoading(true);
    try {
      setStorage(await measureAppStorage());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const rows: SettingsRowModel[] = [
    {
      key: 'maps',
      icon: 'map-outline',
      title: 'Downloaded Maps',
      rightText: storage ? formatBytes(storage.downloadedMapsBytes) : '—',
    },
    {
      key: 'trips',
      icon: 'briefcase-outline',
      title: 'Offline Trips',
      rightText: storage ? formatBytes(storage.offlineTripsBytes) : '—',
    },
    {
      key: 'images',
      icon: 'image-outline',
      title: 'Image Cache',
      rightText: storage ? formatBytes(storage.imageCacheBytes) : '—',
    },
    {
      key: 'videos',
      icon: 'film-outline',
      title: 'Video Cache',
      rightText: storage ? formatBytes(storage.videoCacheBytes) : '—',
    },
    {
      key: 'total',
      icon: 'pie-chart-outline',
      title: 'Storage Usage',
      rightText: storage ? formatBytes(storage.totalBytes) : '—',
    },
    {
      key: 'clear-cache',
      icon: 'trash-outline',
      title: 'Clear Cache',
      onPress: () => {
        Alert.alert('Clear cache', 'Remove cached images and videos?', [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Clear',
            style: 'destructive',
            onPress: () => {
              void clearAppCaches().then(refresh);
            },
          },
        ]);
      },
    },
    {
      key: 'clear-downloads',
      icon: 'download-outline',
      title: 'Clear Downloads',
      onPress: () => {
        Alert.alert('Clear downloads', 'Remove offline maps and trips?', [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Clear',
            style: 'destructive',
            onPress: () => {
              void clearDownloads().then(refresh);
            },
          },
        ]);
      },
    },
  ];

  return (
    <ScrollView style={styles.root} contentContainerStyle={{ paddingBottom: pad }}>
      <SettingsHeroHeader title="Storage & Cache" subtitle="Manage offline content and cache" onBack={() => nav.goBack()} topInset={insets.top} compact />
      {loading ? (
        <ActivityIndicator style={{ marginTop: 24 }} color={T.primary} />
      ) : (
        <View style={styles.body}>
          <SettingsSection title="Usage" items={rows} />
        </View>
      )}
    </ScrollView>
  );
}

export function OfflineSettingsScreen() {
  const nav = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const pad = useBottomSafePadding(24);
  const setPending = useSettingsStore(s => s.setOfflinePendingCount);
  const pending = useSettingsStore(s => s.offlinePendingCount);

  useEffect(() => {
    void countOfflineSyncPending().then(setPending);
  }, [setPending]);

  const rows: SettingsRowModel[] = [
    {
      key: 'trips',
      icon: 'briefcase-outline',
      title: 'Downloaded Trips',
      onPress: () => nav.navigate('MyTrips'),
    },
    {
      key: 'maps',
      icon: 'map-outline',
      title: 'Offline Maps',
      onPress: () => nav.navigate('MainTabs', { screen: 'Map' }),
    },
    {
      key: 'pending',
      icon: 'sync-outline',
      title: 'Pending Sync',
      rightText: String(pending),
    },
    {
      key: 'retry',
      icon: 'refresh-outline',
      title: 'Retry Failed Sync',
      onPress: () => {
        Alert.alert('Sync', 'Pending items will retry automatically when you reconnect.');
        void countOfflineSyncPending().then(setPending);
      },
    },
  ];

  return (
    <ScrollView style={styles.root} contentContainerStyle={{ paddingBottom: pad }}>
      <SettingsHeroHeader title="Offline Mode" subtitle="Trips and maps without connectivity" onBack={() => nav.goBack()} topInset={insets.top} compact />
      <View style={styles.body}>
        <SettingsSection title="Offline" items={rows} />
        <Text style={styles.note}>Changes sync when you&apos;re back online.</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.bg },
  body: { paddingTop: 16 },
  note: {
    fontFamily: SANS,
    fontSize: 13,
    color: T.textSecondary,
    paddingHorizontal: 24,
    marginTop: 8,
  },
});
