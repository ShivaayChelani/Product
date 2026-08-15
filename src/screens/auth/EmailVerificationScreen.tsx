import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  ScrollView,
  Keyboard,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import { PrimaryButton } from '../../components/auth/PrimaryButton';

const RESEND_SECONDS = 45;

const COLORS = {
  bg: '#FFFFFF',
  title: '#2C1810',
  muted: '#6F6F6F',
  change: '#B9834B',
  privacy: '#8B7355',
  border: '#E8DFD8',
  white: '#FFFFFF',
};

interface EmailVerificationScreenProps {
  email: string;
  onVerify: (code: string) => Promise<boolean>;
  onResend: () => Promise<void>;
  onBack: () => void;
  isLoading?: boolean;
}

function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** Email OTP codes are 8-char alphanumeric (e.g. ABCD2345) — not digits-only. */
export default function EmailVerificationScreen({
  email,
  onVerify,
  onResend,
  onBack,
  isLoading = false,
}: EmailVerificationScreenProps) {
  const insets = useSafeAreaInsets();
  const [otp, setOtp] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(RESEND_SECONDS);
  const [resending, setResending] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    setSecondsLeft(RESEND_SECONDS);
    timerRef.current = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  useEffect(() => {
    startTimer();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [startTimer]);

  const handleVerify = useCallback(async () => {
    Keyboard.dismiss();
    const code = otp.trim().toUpperCase();
    if (code.length !== 8) {
      Alert.alert('Invalid code', 'Enter the full 8-character code from your email (letters and numbers).');
      return;
    }
    try {
      const ok = await onVerify(code);
      if (!ok) {
        Alert.alert('Invalid code', 'The code is incorrect or expired. Please try again.');
        setOtp('');
      }
    } catch (err: unknown) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Verification failed. Please try again.');
    }
  }, [otp, onVerify]);

  const handleResend = useCallback(async () => {
    if (secondsLeft > 0 || resending) return;
    setResending(true);
    try {
      await onResend();
      setOtp('');
      startTimer();
      Alert.alert('Code sent', `A new verification code was sent to ${email}.`);
    } catch (err: unknown) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Could not resend code.');
    } finally {
      setResending(false);
    }
  }, [secondsLeft, resending, onResend, email, startTimer]);

  const canVerify = otp.trim().length === 8 && !isLoading;

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.bg} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: Math.max(insets.bottom, 24) }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <TouchableOpacity
            onPress={onBack}
            style={styles.backBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Icon name="chevron-back" size={26} color={COLORS.title} />
          </TouchableOpacity>

          <View style={styles.header}>
            <Text style={styles.title}>Verify Your Email</Text>
            <Text style={styles.instruction}>Enter the 8-character code emailed to</Text>
            <Text style={styles.email}>{email}</Text>
            <Text style={styles.hint}>Letters and numbers (example: AB7K2M9P)</Text>
          </View>

          <View style={styles.formContainer}>
            <TextInput
              style={styles.codeInput}
              value={otp}
              onChangeText={(t) =>
                setOtp(t.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8).toUpperCase())
              }
              placeholder="AB7K2M9P"
              placeholderTextColor={COLORS.muted}
              keyboardType="default"
              autoCapitalize="characters"
              autoCorrect={false}
              autoComplete="off"
              textContentType="oneTimeCode"
              maxLength={8}
              returnKeyType="done"
              onSubmitEditing={handleVerify}
            />

            <TouchableOpacity
              onPress={handleResend}
              disabled={secondsLeft > 0 || resending}
              style={styles.resendContainer}
              activeOpacity={secondsLeft > 0 ? 1 : 0.7}
            >
              <Text style={[styles.resendText, secondsLeft === 0 && !resending && styles.resendActive]}>
                {secondsLeft > 0
                  ? `Resend code in ${formatCountdown(secondsLeft)}`
                  : resending
                    ? 'Sending…'
                    : 'Resend email code'}
              </Text>
            </TouchableOpacity>

            <PrimaryButton
              title="Verify & Continue"
              onPress={handleVerify}
              loading={isLoading}
              disabled={!canVerify}
              style={styles.verifyBtn}
            />
          </View>

          <View style={styles.privacyContainer}>
            <Icon name="mail-outline" size={18} color={COLORS.privacy} style={styles.privacyIcon} />
            <Text style={styles.privacyText}>Check inbox and spam for the PalSafar email.</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
  },
  backBtn: {
    marginTop: 8,
    marginBottom: 24,
    alignSelf: 'flex-start',
  },
  header: {
    alignItems: 'center',
    marginBottom: 36,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: COLORS.title,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    marginBottom: 16,
    textAlign: 'center',
  },
  instruction: {
    fontSize: 14,
    color: COLORS.muted,
    textAlign: 'center',
    marginBottom: 6,
  },
  email: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.title,
    textAlign: 'center',
    marginBottom: 8,
  },
  hint: {
    fontSize: 12,
    color: COLORS.muted,
    textAlign: 'center',
  },
  formContainer: {
    width: '100%',
  },
  codeInput: {
    height: 56,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
    paddingHorizontal: 16,
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 3,
    textAlign: 'center',
    color: COLORS.title,
    marginBottom: 28,
  },
  resendContainer: {
    alignItems: 'center',
    marginBottom: 28,
  },
  resendText: {
    color: COLORS.muted,
    fontSize: 14,
  },
  resendActive: {
    color: COLORS.change,
    fontWeight: '600',
  },
  verifyBtn: {
    marginBottom: 32,
  },
  privacyContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 'auto',
    paddingTop: 24,
  },
  privacyIcon: {
    marginRight: 8,
  },
  privacyText: {
    color: COLORS.privacy,
    fontSize: 13,
    fontWeight: '500',
    flexShrink: 1,
  },
});
