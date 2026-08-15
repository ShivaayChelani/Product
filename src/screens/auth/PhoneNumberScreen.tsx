import React, { useState, useCallback } from 'react';
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
import { InputField } from '../../components/auth/InputField';

const COLORS = {
  bg: '#FFFFFF',
  title: '#2C1810',
  muted: '#6F6F6F',
};

const BETA_PHONE_MESSAGE = 'Phone verification will be available in a future update.';

export interface SignupDraft {
  name: string;
  email: string;
  password: string;
}

interface PhoneNumberScreenProps {
  signupDraft?: SignupDraft;
  initialPhone?: string;
  /** Reserved for a future phone-OTP release. Not invoked during closed beta. */
  onContinue: (phoneNumber: string) => void;
  onBack: () => void;
}

function formatIndianPhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) {
    return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
  }
  if (digits.length === 12 && digits.startsWith('91')) {
    return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`;
  }
  return null;
}

export default function PhoneNumberScreen({
  initialPhone = '',
  onBack,
}: PhoneNumberScreenProps) {
  const insets = useSafeAreaInsets();
  const [phone, setPhone] = useState(() => {
    const digits = initialPhone.replace(/\D/g, '');
    return digits.length >= 10 ? digits.slice(-10) : digits;
  });
  const [error, setError] = useState('');

  const handleContinue = useCallback(() => {
    Keyboard.dismiss();
    // Closed beta: phone OTP postponed — do not send SMS or continue the OTP journey.
    Alert.alert('Coming soon', BETA_PHONE_MESSAGE);
    setError('');
  }, []);

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.bg} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: Math.max(insets.bottom, 24) }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <TouchableOpacity onPress={onBack} style={styles.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Icon name="chevron-back" size={26} color={COLORS.title} />
          </TouchableOpacity>

          <View style={styles.header}>
            <Text style={styles.title}>Your Mobile Number</Text>
            <Text style={styles.subtitle}>{BETA_PHONE_MESSAGE}</Text>
          </View>

          <View style={styles.formContainer}>
            <View style={styles.phoneFieldRow}>
              <View style={styles.prefixBox}>
                <Text style={styles.prefixText}>+91</Text>
              </View>
              <View style={styles.phoneInputWrap}>
                <InputField
                  iconName="call-outline"
                  placeholder="98765 43210"
                  value={phone}
                  onChangeText={(t) => {
                    setPhone(t.replace(/\D/g, '').slice(0, 10));
                    if (error) setError('');
                  }}
                  error={error}
                  keyboardType="phone-pad"
                  maxLength={10}
                  containerStyle={styles.phoneInputContainer}
                />
              </View>
            </View>

            <PrimaryButton title="Send OTP" onPress={handleContinue} style={styles.continueBtn} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export { formatIndianPhone };

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
    marginBottom: 32,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: COLORS.title,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    marginBottom: 12,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.muted,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 12,
  },
  formContainer: {
    width: '100%',
  },
  phoneFieldRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 24,
  },
  prefixBox: {
    height: 56,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E8DFD8',
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    marginTop: 0,
  },
  prefixText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.title,
  },
  phoneInputWrap: {
    flex: 1,
  },
  phoneInputContainer: {
    marginBottom: 0,
  },
  continueBtn: {
    marginTop: 8,
  },
});
