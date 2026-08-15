import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import Icon from 'react-native-vector-icons/Ionicons';
import { SettingsTheme as T, SERIF_REG } from '../features/settings/theme';
import { SettingsHeroHeader } from '../features/settings/components/SettingsHeroHeader';
import { SettingsPasswordField } from '../features/settings/components/SettingsPasswordField';
import { PasswordStrengthMeter } from '../features/settings/components/PasswordStrengthMeter';
import { passwordMeetsPolicy, scorePassword } from '../features/settings/utils/passwordStrength';
import { authApi } from '../services/api/auth';
import { useUserContext } from '../context/UserContext';
import { useBottomSafePadding } from '../design/responsive';
import { PressableScale } from '../components/home/PressableScale';

const schema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password'),
    newPassword: z
      .string()
      .min(8, 'Minimum 8 characters')
      .refine(passwordMeetsPolicy, 'Use upper, lower, number, and special character (@$!%*?&)'),
    confirmPassword: z.string().min(1, 'Confirm your new password'),
  })
  .refine(v => v.newPassword === v.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })
  .refine(v => v.currentPassword !== v.newPassword, {
    message: 'Must differ from current password',
    path: ['newPassword'],
  });

type FormValues = z.infer<typeof schema>;

const LOCK_ART = require('../assets/splash.png');

export default function ChangePasswordScreen({ navigation }: { navigation?: any }) {
  const insets = useSafeAreaInsets();
  const scrollPadBottom = useBottomSafePadding(28);
  const { onLogout } = useUserContext();
  const [submitting, setSubmitting] = useState(false);

  const {
    control,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
    mode: 'onChange',
  });

  const newPassword = watch('newPassword');
  const strength = useMemo(() => scorePassword(newPassword), [newPassword]);

  const onSubmit = handleSubmit(async values => {
    setSubmitting(true);
    try {
      await authApi.changePassword({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });
      Alert.alert(
        'Password updated',
        'Your password was changed successfully. Other devices have been signed out.',
        [{ text: 'OK', onPress: () => void onLogout?.() }],
      );
    } catch (err: any) {
      Alert.alert('Could not update password', err?.message || 'Check your current password and try again.');
    } finally {
      setSubmitting(false);
    }
  });

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: scrollPadBottom }}
      >
        <SettingsHeroHeader
          title="Change Password"
          subtitle="Update your password to keep your account secure"
          onBack={() => navigation?.goBack()}
          topInset={insets.top}
          compact
        />
        <View style={styles.illustrationWrap}>
          <Image source={LOCK_ART} style={styles.illustration} resizeMode="contain" />
        </View>
        <View style={styles.form}>
          <Controller
            control={control}
            name="currentPassword"
            render={({ field: { onChange, value } }) => (
              <SettingsPasswordField
                label="Current Password"
                value={value}
                onChangeText={onChange}
                placeholder="Enter current password"
                error={errors.currentPassword?.message}
              />
            )}
          />
          <Controller
            control={control}
            name="newPassword"
            render={({ field: { onChange, value } }) => (
              <SettingsPasswordField
                label="New Password"
                value={value}
                onChangeText={onChange}
                placeholder="Enter new password"
                hint="Minimum 8 characters with letters and numbers"
                error={errors.newPassword?.message}
              />
            )}
          />
          <PasswordStrengthMeter strength={strength} />
          <Controller
            control={control}
            name="confirmPassword"
            render={({ field: { onChange, value } }) => (
              <SettingsPasswordField
                label="Confirm New Password"
                value={value}
                onChangeText={onChange}
                placeholder="Re-enter new password"
                error={errors.confirmPassword?.message}
              />
            )}
          />
          <View style={styles.tipCard}>
            <Icon name="shield-checkmark" size={22} color={T.secondary} />
            <Text style={styles.tipText}>
              Keep your account secure. Use a strong password that you don&apos;t use on other websites.
            </Text>
          </View>
          <PressableScale onPress={onSubmit} disabled={submitting}>
            <View style={[styles.primaryBtn, submitting && styles.primaryBtnDisabled]}>
              {submitting ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.primaryBtnText}>Update Password</Text>
              )}
            </View>
          </PressableScale>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.bg },
  illustrationWrap: {
    alignItems: 'center',
    marginTop: -8,
    marginBottom: 8,
    height: 120,
  },
  illustration: { width: 160, height: 120, opacity: 0.92 },
  form: {
    paddingHorizontal: 20,
    gap: 18,
  },
  tipCard: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: '#F3EBE0',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: T.border,
  },
  tipText: {
    flex: 1,
    fontFamily: SERIF_REG,
    fontSize: 14,
    lineHeight: 20,
    color: T.textSecondary,
  },
  primaryBtn: {
    marginTop: 4,
    backgroundColor: T.primary,
    borderRadius: T.radius,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryBtnDisabled: { opacity: 0.75 },
  primaryBtnText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 16,
    color: '#FFFFFF',
  },
});
