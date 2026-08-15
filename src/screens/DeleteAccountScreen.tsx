import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SettingsTheme as T, SERIF, SANS, SANS_SEMI } from '../features/settings/theme';
import { SettingsHeroHeader } from '../features/settings/components/SettingsHeroHeader';
import { SettingsPasswordField } from '../features/settings/components/SettingsPasswordField';
import { authApi, type AccountDeletionInfo } from '../services/api/auth';
import { useUserContext } from '../context/UserContext';
import { useBottomSafePadding } from '../design/responsive';
import { PressableScale } from '../components/home/PressableScale';

const REASONS = [
  'I no longer travel',
  'Privacy concerns',
  'Too many notifications',
  'Found a better app',
  'Other',
];

export default function DeleteAccountScreen({ navigation }: { navigation?: any }) {
  const insets = useSafeAreaInsets();
  const scrollPadBottom = useBottomSafePadding(24);
  const { onLogout } = useUserContext();
  const [info, setInfo] = useState<AccountDeletionInfo | null>(null);
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [reason, setReason] = useState<string | null>(null);
  const [loadingInfo, setLoadingInfo] = useState(true);
  const [loading, setLoading] = useState(false);
  const [otpSending, setOtpSending] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await authApi.getDeletionInfo();
        if (!cancelled) setInfo(data);
      } catch (err: any) {
        if (!cancelled) setError(err?.message || 'Could not load account deletion details.');
      } finally {
        if (!cancelled) setLoadingInfo(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const requestOtp = async () => {
    setOtpSending(true);
    try {
      await authApi.requestAccountDeletionCode();
      Alert.alert('Verification code sent', 'Check your email for an 8-character code (valid 15 minutes).');
    } catch (err: any) {
      Alert.alert('Could not send code', err?.message || 'Try again.');
    } finally {
      setOtpSending(false);
    }
  };

  const performDelete = useCallback(async () => {
    if (!reason) {
      setError('Select a reason for leaving');
      return;
    }
    if (!password.trim()) {
      setError('Enter your password to confirm deletion');
      return;
    }
    if (!otp.trim()) {
      setError('Enter the email verification code');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await authApi.deleteAccount({
        password,
        confirmDeletion: true,
        reason,
        otp: otp.trim(),
      });
      Alert.alert('Account deleted', 'Your PalSafar account has been permanently deleted.', [
        { text: 'OK', onPress: () => void onLogout?.() },
      ]);
    } catch (err: any) {
      setError(err?.message || 'Could not delete account. Check your password and code.');
    } finally {
      setLoading(false);
    }
  }, [password, otp, reason, onLogout]);

  const handleDelete = useCallback(() => {
    if (!info?.canSelfDelete) {
      Alert.alert('Not allowed', 'Admin accounts cannot be deleted from the app.');
      return;
    }
    Alert.alert(
      'Final warning',
      'This permanently deletes your account, vendor/creator profiles, and forfeits remaining PalPoints. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete forever', style: 'destructive', onPress: () => void performDelete() },
      ],
    );
  }, [info, performDelete]);

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ paddingBottom: scrollPadBottom }} keyboardShouldPersistTaps="handled">
        <SettingsHeroHeader
          title="Delete Account"
          subtitle="This action is permanent"
          onBack={() => navigation?.goBack()}
          topInset={insets.top}
          compact
        />
        <View style={styles.body}>
          {loadingInfo ? (
            <ActivityIndicator color={T.primary} />
          ) : (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Before you continue</Text>
              <Text style={styles.cardLine}>PalPoints forfeited: {info?.palPoints ?? 0}</Text>
              <Text style={styles.cardLine}>Pending redemptions cancelled: {info?.pendingRedemptions ?? 0}</Text>
            </View>
          )}

          <Text style={styles.label}>Reason for leaving</Text>
          <View style={styles.reasonWrap}>
            {REASONS.map(r => (
              <TouchableOpacity
                key={r}
                style={[styles.reasonChip, reason === r && styles.reasonChipOn]}
                onPress={() => setReason(r)}
              >
                <Text style={[styles.reasonText, reason === r && styles.reasonTextOn]}>{r}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <SettingsPasswordField label="Confirm password" value={password} onChangeText={setPassword} placeholder="Current password" />

          <Text style={styles.label}>Email verification</Text>
          <View style={styles.otpRow}>
            <TextInput
              value={otp}
              onChangeText={setOtp}
              placeholder="8-character code"
              placeholderTextColor={T.textMuted}
              autoCapitalize="characters"
              style={styles.otpInput}
            />
            <PressableScale onPress={requestOtp} disabled={otpSending}>
              <View style={styles.otpBtn}>
                {otpSending ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={styles.otpBtnText}>Send code</Text>}
              </View>
            </PressableScale>
          </View>

          {!!error && <Text style={styles.error}>{error}</Text>}

          <PressableScale onPress={handleDelete} disabled={loading || loadingInfo}>
            <View style={[styles.deleteBtn, (loading || loadingInfo) && styles.deleteBtnDisabled]}>
              {loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.deleteBtnText}>Delete my account</Text>}
            </View>
          </PressableScale>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.bg },
  body: { paddingHorizontal: 20, paddingTop: 16, gap: 14 },
  card: {
    backgroundColor: T.card,
    borderRadius: T.radius,
    borderWidth: 1,
    borderColor: T.border,
    padding: 16,
    gap: 8,
  },
  cardTitle: { fontFamily: SANS_SEMI, fontSize: 15, color: T.primary },
  cardLine: { fontFamily: SANS, fontSize: 14, color: T.textSecondary, lineHeight: 20 },
  label: { fontFamily: SANS_SEMI, fontSize: 14, color: T.primary, marginTop: 4 },
  reasonWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  reasonChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.card,
  },
  reasonChipOn: { borderColor: T.primary, backgroundColor: '#F3EBE0' },
  reasonText: { fontFamily: SANS, fontSize: 13, color: T.textSecondary },
  reasonTextOn: { color: T.primary },
  otpRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  otpInput: {
    flex: 1,
    backgroundColor: T.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: T.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: SANS,
    color: T.text,
  },
  otpBtn: {
    backgroundColor: T.secondary,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minWidth: 96,
    alignItems: 'center',
  },
  otpBtnText: { fontFamily: SANS_SEMI, fontSize: 13, color: '#FFF' },
  error: { fontFamily: SANS, fontSize: 13, color: T.danger },
  deleteBtn: {
    marginTop: 8,
    backgroundColor: T.danger,
    borderRadius: T.radius,
    paddingVertical: 16,
    alignItems: 'center',
  },
  deleteBtnDisabled: { opacity: 0.7 },
  deleteBtnText: { fontFamily: SANS_SEMI, fontSize: 15, color: '#FFF' },
});
