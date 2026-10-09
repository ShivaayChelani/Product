import React, { useCallback } from 'react';
import { ScrollView, View, Text, StyleSheet, Alert } from 'react-native';
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
      patch.mutate({ privacy: { [key]: value } as UserAppSettings['privacy'] });
    },
    [patch],
  );
  return { data, patch, togglePrivacy, isAuthenticated };
}

export function PrivacySettingsScreen() {
  const nav = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const pad = useBottomSafePadding(24);
  const { data, togglePrivacy, isAuthenticated } = useToggleSection();

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

  if (!isAuthenticated) return null;

  const privacy = data?.privacy;
  const isPublic = (privacy?.profileVisibility ?? 'public') === 'public';
  const visibilityRows: SettingsRowModel[] = [
    {
      key: 'public',
      icon: 'globe-outline',
      title: 'Public Profile',
      switchValue: isPublic,
      onSwitch: v => togglePrivacy('profileVisibility', v ? 'public' : 'private'),
    },
    {
      key: 'tips',
      icon: 'map-outline',
      title: 'Show Tips',
      switchValue: privacy?.showTrips !== false,
      onSwitch: v => togglePrivacy('showTrips', v),
    },
    {
      key: 'reviews',
      icon: 'star-outline',
      title: 'Show Reviews',
      switchValue: privacy?.showReviews !== false,
      onSwitch: v => togglePrivacy('showReviews', v),
    },
    {
      key: 'reels',
      icon: 'videocam-outline',
      title: 'Show Moments',
      switchValue: privacy?.showReels !== false,
      onSwitch: v => togglePrivacy('showReels', v),
    },
    {
      key: 'wishlist',
      icon: 'heart-outline',
      title: 'Show Wishlist',
      switchValue: privacy?.showWishlist !== false,
      onSwitch: v => togglePrivacy('showWishlist', v),
    },
  ];

  const actionRows: SettingsRowModel[] = [
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
          <Icon name="shield-checkmark-outline" size={24} color="#6B6B6B" />
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

  const notifications = data?.notifications;
  const toggle = (key: keyof NonNullable<typeof notifications>, value: boolean) => {
    patch.mutate({ notifications: { [key]: value } as NonNullable<typeof notifications> });
  };

  const rows: SettingsRowModel[] = [
    { key: 'push', icon: 'notifications-outline', title: 'Push Notifications', switchValue: notifications?.pushEnabled !== false, onSwitch: v => toggle('pushEnabled', v) },
    { key: 'email', icon: 'mail-outline', title: 'Email Notifications', switchValue: notifications?.emailEnabled !== false, onSwitch: v => toggle('emailEnabled', v) },
    { key: 'travel', icon: 'airplane-outline', title: 'Travel Alerts', switchValue: notifications?.travelAlerts !== false, onSwitch: v => toggle('travelAlerts', v) },
    { key: 'offers', icon: 'pricetag-outline', title: 'Offer Alerts', switchValue: notifications?.offerAlerts !== false, onSwitch: v => toggle('offerAlerts', v) },
    { key: 'rewards', icon: 'gift-outline', title: 'Reward Notifications', switchValue: notifications?.rewardNotifications !== false, onSwitch: v => toggle('rewardNotifications', v) },
    { key: 'system', icon: 'settings-outline', title: 'System Notifications', switchValue: notifications?.systemNotifications !== false, onSwitch: v => toggle('systemNotifications', v) },
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
    color: '#6B6B6B',
    lineHeight: 18,
  },
});
