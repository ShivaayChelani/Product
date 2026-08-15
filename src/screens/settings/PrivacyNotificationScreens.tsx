import React, { useCallback } from 'react';
import { ScrollView, View, Text, StyleSheet, Alert, Share } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { SettingsTheme as T } from '../../features/settings/theme';
import { SettingsHeroHeader } from '../../features/settings/components/SettingsHeroHeader';
import { SettingsSection, type SettingsRowModel } from '../../features/settings/components/SettingsSection';
import { useUserAppSettings, usePatchUserAppSettings } from '../../features/settings/hooks/useUserAppSettings';
import { useUserContext } from '../../context/UserContext';
import { userAppApi } from '../../services/api/userApp';
import { useBottomSafePadding } from '../../design/responsive';

import type { UserAppSettings } from '../../services/api/userApp';

function useToggleSection() {
  const { isAuthenticated } = useUserContext();
  const { data } = useUserAppSettings(isAuthenticated);
  const patch = usePatchUserAppSettings();
  const togglePrivacy = useCallback(
    (key: keyof UserAppSettings['privacy'], value: boolean | string) => {
      if (!data) return;
      patch.mutate({ privacy: { ...data.privacy, [key]: value } });
    },
    [data, patch],
  );
  return { data, patch, togglePrivacy, isAuthenticated };
}

export function PrivacySettingsScreen() {
  const nav = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const pad = useBottomSafePadding(24);
  const { data, patch, togglePrivacy, isAuthenticated } = useToggleSection();

  const exportData = async () => {
    try {
      const payload = await userAppApi.exportPersonalData();
      await Share.share({ message: JSON.stringify(payload, null, 2), title: 'PalSafar Personal Data Export' });
    } catch (err: any) {
      Alert.alert('Export failed', err?.message || 'Try again when online.');
    }
  };

  const deleteData = () => {
    Alert.alert(
      'Delete personal data',
      'This clears reviews and check-ins stored on your account. Your login and trips remain.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            userAppApi
              .deletePersonalData()
              .then(() => Alert.alert('Done', 'Personal activity data was cleared.'))
              .catch((err: unknown) => {
                Alert.alert('Could not delete data', err instanceof Error ? err.message : 'Try again.');
              });
          },
        },
      ],
    );
  };

  if (!isAuthenticated || !data) return null;

  const isPublic = data.privacy.profileVisibility === 'public';
  const visibilityRows: SettingsRowModel[] = [
    {
      key: 'public',
      icon: 'globe-outline',
      title: 'Public Profile',
      switchValue: isPublic,
      onSwitch: v => togglePrivacy('profileVisibility', v ? 'public' : 'private'),
      loading: patch.isPending,
    },
    {
      key: 'tips',
      icon: 'map-outline',
      title: 'Show Tips',
      switchValue: data.privacy.showTrips, // Assuming Tips maps to showTrips in backend
      onSwitch: v => togglePrivacy('showTrips', v),
      loading: patch.isPending,
    },
    {
      key: 'reviews',
      icon: 'star-outline',
      title: 'Show Reviews',
      switchValue: data.privacy.showReviews,
      onSwitch: v => togglePrivacy('showReviews', v),
      loading: patch.isPending,
    },
    {
      key: 'reels',
      icon: 'videocam-outline',
      title: 'Show Reels',
      switchValue: data.privacy.showReels,
      onSwitch: v => togglePrivacy('showReels', v),
      loading: patch.isPending,
    },
    {
      key: 'wishlist',
      icon: 'heart-outline',
      title: 'Show Wishlist',
      switchValue: data.privacy.showWishlist,
      onSwitch: v => togglePrivacy('showWishlist', v),
      loading: patch.isPending,
    },
  ];

  const actionRows: SettingsRowModel[] = [
    {
      key: 'blocks',
      icon: 'ban-outline',
      title: 'Manage Block List',
      subtitle: "View and manage users you've blocked",
      onPress: () => nav.navigate('BlockList'),
    },
    {
      key: 'export',
      icon: 'download-outline',
      title: 'Download Personal Data',
      subtitle: 'Get a copy of your data',
      onPress: () => void exportData(),
    },
    {
      key: 'wipe',
      icon: 'trash-bin-outline',
      title: 'Delete Personal Data',
      subtitle: 'Permanently delete your account and data',
      danger: true,
      onPress: deleteData,
    },
  ];

  return (
    <ScrollView style={styles.root} contentContainerStyle={{ paddingBottom: pad }}>
      <SettingsHeroHeader
        title="Privacy Settings"
        subtitle="Control what others see and manage your data"
        onBack={() => nav.goBack()}
        topInset={insets.top}
        compact
      />
      <View style={styles.body}>
        <SettingsSection title="Visibility" items={visibilityRows} />
        <View style={{ marginTop: -8 }}>
          <SettingsSection items={actionRows} />
        </View>

        <View style={styles.footerContainer}>
          <Icon name="shield-checkmark-outline" size={24} color="#A39990" />
          <View style={styles.footerTextContainer}>
            <Text style={styles.footerText}>Your privacy is important to us.</Text>
            <Text style={styles.footerText}>We never share your data without your permission.</Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

export function NotificationSettingsScreen() {
  const nav = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const pad = useBottomSafePadding(24);
  const { isAuthenticated } = useUserContext();
  const { data } = useUserAppSettings(isAuthenticated);
  const patch = usePatchUserAppSettings();

  if (!data) return null;

  const toggle = (key: keyof typeof data.notifications, value: boolean) => {
    patch.mutate({ notifications: { ...data.notifications, [key]: value } });
  };

  const rows: SettingsRowModel[] = [
    { key: 'push', icon: 'notifications-outline', title: 'Push Notifications', switchValue: data.notifications.pushEnabled, onSwitch: v => toggle('pushEnabled', v), loading: patch.isPending },
    { key: 'email', icon: 'mail-outline', title: 'Email Notifications', switchValue: data.notifications.emailEnabled, onSwitch: v => toggle('emailEnabled', v), loading: patch.isPending },
    { key: 'travel', icon: 'airplane-outline', title: 'Travel Alerts', switchValue: data.notifications.travelAlerts, onSwitch: v => toggle('travelAlerts', v), loading: patch.isPending },
    { key: 'offers', icon: 'pricetag-outline', title: 'Offer Alerts', switchValue: data.notifications.offerAlerts, onSwitch: v => toggle('offerAlerts', v), loading: patch.isPending },
    { key: 'rewards', icon: 'gift-outline', title: 'Reward Notifications', switchValue: data.notifications.rewardNotifications, onSwitch: v => toggle('rewardNotifications', v), loading: patch.isPending },
    { key: 'system', icon: 'settings-outline', title: 'System Notifications', switchValue: data.notifications.systemNotifications, onSwitch: v => toggle('systemNotifications', v), loading: patch.isPending },
  ];

  return (
    <ScrollView style={styles.root} contentContainerStyle={{ paddingBottom: pad }}>
      <SettingsHeroHeader
        title="Notifications"
        subtitle="Choose how PalSafar keeps you informed"
        onBack={() => nav.goBack()}
        topInset={insets.top}
        compact
      />
      <View style={styles.body}>
        <SettingsSection title="Alerts" items={rows} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.bg },
  body: {
    marginTop: 8,
    paddingTop: 8,
  },
  footerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 32,
    marginBottom: 16,
    paddingHorizontal: 20,
  },
  footerTextContainer: {
    marginLeft: 12,
  },
  footerText: {
    fontSize: 12,
    color: '#A39990',
    lineHeight: 18,
  },
});
