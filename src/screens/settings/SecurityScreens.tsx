import React, { useCallback } from 'react';
import { ScrollView, View, StyleSheet, Alert, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SettingsTheme as T } from '../../features/settings/theme';
import { SettingsHeroHeader } from '../../features/settings/components/SettingsHeroHeader';
import { SettingsSection, type SettingsRowModel } from '../../features/settings/components/SettingsSection';
import { useUserAppSettings, usePatchUserAppSettings } from '../../features/settings/hooks/useUserAppSettings';
import { useUserContext } from '../../context/UserContext';
import { userAppApi } from '../../services/api/userApp';
import { settingsKeys } from '../../features/settings/queryKeys';
import { useBottomSafePadding } from '../../design/responsive';

export function SecuritySettingsScreen() {
  const nav = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const pad = useBottomSafePadding(24);
  const { isAuthenticated } = useUserContext();
  const { data } = useUserAppSettings(isAuthenticated);
  const patch = usePatchUserAppSettings();
  const qc = useQueryClient();

  const sessionsQuery = useQuery({
    queryKey: settingsKeys.sessions(),
    queryFn: () => userAppApi.listSessions(),
    enabled: isAuthenticated,
  });

  const revokeOthers = useMutation({
    mutationFn: () => userAppApi.revokeOtherSessions(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: settingsKeys.sessions() });
      Alert.alert('Signed out', 'Other devices have been signed out.');
    },
  });

  const toggleSecurity = useCallback(
    (key: 'biometricLogin' | 'pinLock' | 'twoFactorEnabled', value: boolean) => {
      if (key === 'twoFactorEnabled' && value) {
        Alert.alert(
          'Two-factor authentication',
          'Email verification codes will be required for sensitive actions. Full SMS 2FA is coming soon.',
        );
      }
      if (key === 'biometricLogin' && value) {
        Alert.alert(
          'Biometric login',
          'Biometric unlock preference saved. Enable device biometrics in your phone settings for full support.',
        );
      }
      patch.mutate({ security: { ...data!.security, [key]: value } });
    },
    [data, patch],
  );

  if (!data) return null;

  const rows: SettingsRowModel[] = [
    {
      key: 'bio',
      icon: 'finger-print-outline',
      title: 'Biometric Login',
      switchValue: data.security.biometricLogin,
      onSwitch: v => toggleSecurity('biometricLogin', v),
      loading: patch.isPending,
    },
    {
      key: 'pin',
      icon: 'keypad-outline',
      title: 'PIN Lock',
      switchValue: data.security.pinLock,
      onSwitch: v => toggleSecurity('pinLock', v),
      loading: patch.isPending,
    },
    {
      key: '2fa',
      icon: 'shield-half-outline',
      title: 'Two Factor Authentication',
      switchValue: data.security.twoFactorEnabled,
      onSwitch: v => toggleSecurity('twoFactorEnabled', v),
      loading: patch.isPending,
    },
    {
      key: 'sessions',
      icon: 'phone-portrait-outline',
      title: 'Active Sessions',
      rightText: `${sessionsQuery.data?.length ?? '—'}`,
      onPress: () => nav.navigate('ActiveSessions'),
    },
    {
      key: 'logout-others',
      icon: 'log-out-outline',
      title: 'Logout Other Devices',
      onPress: () => revokeOthers.mutate(),
      loading: revokeOthers.isPending,
    },
  ];

  return (
    <ScrollView style={styles.root} contentContainerStyle={{ paddingBottom: pad }}>
      <SettingsHeroHeader title="Security" subtitle="Protect your account and devices" onBack={() => nav.goBack()} topInset={insets.top} compact />
      <View style={styles.body}>
        <SettingsSection title="Security" items={rows} />
      </View>
    </ScrollView>
  );
}

export function ActiveSessionsScreen() {
  const nav = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const pad = useBottomSafePadding(24);
  const qc = useQueryClient();
  const sessionsQuery = useQuery({
    queryKey: settingsKeys.sessions(),
    queryFn: () => userAppApi.listSessions(),
  });

  const revoke = useMutation({
    mutationFn: (id: string) => userAppApi.revokeSession(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: settingsKeys.sessions() }),
  });

  const rows: SettingsRowModel[] =
    sessionsQuery.data?.map(s => ({
      key: s.id,
      icon: 'time-outline',
      title: `Session ${new Date(s.createdAt).toLocaleDateString()}`,
      subtitle: `Expires ${new Date(s.expiresAt).toLocaleString()}`,
      onPress: () => {
        Alert.alert('Revoke session', 'Sign out this device?', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Revoke', style: 'destructive', onPress: () => revoke.mutate(s.id) },
        ]);
      },
    })) ?? [];

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={{ paddingBottom: pad }}
      refreshControl={<RefreshControl refreshing={sessionsQuery.isFetching} onRefresh={() => sessionsQuery.refetch()} />}
    >
      <SettingsHeroHeader title="Active Sessions" subtitle="Manage signed-in devices" onBack={() => nav.goBack()} topInset={insets.top} compact />
      <View style={styles.body}>
        <SettingsSection title="Devices" items={rows.length ? rows : [{ key: 'empty', icon: 'information-circle-outline', title: 'No other active sessions' }]} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.bg },
  body: { paddingTop: 16 },
});
