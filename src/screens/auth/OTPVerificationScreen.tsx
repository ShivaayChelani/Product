import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
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
import { OTPInput } from '../../components/auth/OTPInput';

const RESEND_SECONDS = 45;

const COLORS = {
  bg: '#FFFFFF',
  title: '#2C1810',
  muted: '#6F6F6F',
  change: '#B9834B',
  privacy: '#8B7355',
};

interface SignupDraft {
  name: string;
  email: string;
  password: string;
}

interface OTPVerificationScreenProps {
  phoneNumber: string;
  onVerify: (code: string, draft?: SignupDraft) => Promise<boolean>;
  onChangeNumber: () => void;
  onBack: () => void;
  onResend?: (phoneNumber: string) => Promise<void>;
  signupDraft?: SignupDraft;
  isLoading?: boolean;
}

function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function OTPVerificationScreen({
  phoneNumber,
  onVerify: _onVerify,
  onChangeNumber: _onChangeNumber,
  onBack,
  onResend: _onResend,
  signupDraft: _signupDraft,
  isLoading = false,
}: OTPVerificationScreenProps) {
  const insets = useSafeAreaInsets();
  const [otp, setOtp] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(RESEND_SECONDS);
  const [resending] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Keep countdown UI for future OTP release; beta actions do not send SMS.
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
    // Closed beta: phone OTP postponed — do not verify or continue registration via SMS.
    Alert.alert('Coming soon', 'Phone verification will be available in a future update.');
  }, []);

  const handleResend = useCallback(async () => {
    if (secondsLeft > 0 || resending) return;
    // Closed beta: do not call SMS / resend APIs.
    Alert.alert('Coming soon', 'Phone verification will be available in a future update.');
  }, [secondsLeft, resending]);

  const handleChangeNumber = useCallback(() => {
    Alert.alert('Coming soon', 'Phone verification will be available in a future update.');
  }, []);

  const canVerify = otp.length === 6 && !isLoading;

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
            <Text style={styles.title}>Verify Your Number</Text>
            <Text style={styles.instruction}>
              Phone verification will be available in a future update.
            </Text>
            <View style={styles.phoneRow}>
              <Text style={styles.phoneNumber}>{phoneNumber}</Text>
              <TouchableOpacity onPress={handleChangeNumber} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={styles.changeLink}>Change</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.formContainer}>
            <View style={styles.otpWrapper}>
              <OTPInput length={6} value={otp} onChange={setOtp} />
            </View>

            <TouchableOpacity
              onPress={handleResend}
              disabled={secondsLeft > 0 || resending}
              style={styles.resendContainer}
              activeOpacity={secondsLeft > 0 ? 1 : 0.7}
            >
              <Text style={[styles.resendText, secondsLeft === 0 && !resending && styles.resendActive]}>
                {secondsLeft > 0
                  ? `Resend OTP in ${formatCountdown(secondsLeft)}`
                  : resending
                    ? 'Sending…'
                    : 'Resend OTP'}
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
            <Icon name="shield-checkmark-outline" size={18} color={COLORS.privacy} style={styles.privacyIcon} />
            <Text style={styles.privacyText}>We never share your number with anyone.</Text>
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
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  phoneNumber: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.title,
  },
  changeLink: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.change,
    textDecorationLine: 'underline',
  },
  formContainer: {
    width: '100%',
  },
  otpWrapper: {
    marginBottom: 28,
    paddingHorizontal: 4,
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
  },
});
