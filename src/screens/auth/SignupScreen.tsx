import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  StatusBar,
  Keyboard,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import { AuthHeader } from '../../components/auth/AuthHeader';
import { PrimaryButton } from '../../components/auth/PrimaryButton';
import { InputField } from '../../components/auth/InputField';
import { SocialButton } from '../../components/auth/SocialButton';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,128}$/;

interface SignupScreenProps {
  onSignup: (name: string, email: string, pass: string) => Promise<boolean>;
  onLogin: () => void;
  onBack: () => void;
  onGuestContinue: () => void;
  isLoading?: boolean;
}

function signupErrorMessage(err: unknown): string {
  if (err && typeof err === 'object') {
    const status = (err as { status?: number }).status;
    const message = (err as { message?: string }).message?.trim();
    const url = (err as { url?: string }).url;
    if (status === 404) {
      return message && message.includes('POST ')
        ? message
        : `Not Found — registration endpoint missing: POST ${url || '(unknown URL)'}`;
    }
    if (message) return message;
    if (status === 409) return 'An account with this email already exists.';
    if (status === 400) return 'Invalid registration details. Please check and try again.';
    if (status === 500) return 'Something went wrong on our side. Please try again later.';
  }
  if (err instanceof Error && err.message) return err.message;
  return 'Signup failed. Please try again.';
}

export default function SignupScreen({
  onSignup,
  onLogin,
  onBack,
  onGuestContinue,
  isLoading = false,
}: SignupScreenProps) {
  const insets = useSafeAreaInsets();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = useCallback(() => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = 'Name required';
    if (!email.trim()) e.email = 'Email required';
    else if (!EMAIL_REGEX.test(email.trim())) e.email = 'Invalid email';
    if (!password) e.password = 'Password required';
    else if (!PASSWORD_REGEX.test(password)) {
      e.password = 'Min 8 chars with uppercase, lowercase, number & special char';
    }
    if (password !== confirmPassword) e.confirmPassword = 'Passwords mismatch';
    setErrors(e);
    return Object.keys(e).length === 0;
  }, [name, email, password, confirmPassword]);

  const handleSignup = useCallback(async () => {
    Keyboard.dismiss();
    if (!validate()) return;

    try {
      // Email + password only. On success, AuthNavigator opens Email Verification
      // (or authenticates immediately for legacy responses).
      const success = await onSignup(name.trim(), email.trim(), password);
      if (!success) {
        setErrors({
          email: 'An account with this email already exists. Try Sign In, or finish email verification.',
        });
      }
    } catch (err: unknown) {
      const message = signupErrorMessage(err);
      const status = err && typeof err === 'object' ? (err as { status?: number }).status : undefined;
      if (status === 409) {
        setErrors({ email: message });
        return;
      }
      Alert.alert('Error', message);
    }
  }, [name, email, password, onSignup, validate]);

  const handleGoogle = () => {
    Alert.alert('Coming soon', 'Google sign-in will be available in a future update.');
  };

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFBF6" />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <View style={[styles.content, { paddingBottom: Math.max(insets.bottom, 24) }]}>
          <View style={styles.headerWrap}>
            <TouchableOpacity onPress={onBack} style={styles.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Icon name="chevron-back" size={24} color="#202020" />
            </TouchableOpacity>
            <AuthHeader
              title="Create Your Account"
              subtitle="Join PalSafar and start exploring"
              showLogo={false}
            />
          </View>

          <View style={styles.formContainer}>
            <InputField
              iconName="person-outline"
              placeholder="Full Name"
              value={name}
              onChangeText={(t) => {
                setName(t);
                if (errors.name) setErrors({ ...errors, name: '' });
              }}
              error={errors.name}
              autoCapitalize="words"
              containerStyle={styles.fieldCompact}
            />

            <InputField
              iconName="mail-outline"
              placeholder="Email Address"
              value={email}
              onChangeText={(t) => {
                setEmail(t);
                if (errors.email) setErrors({ ...errors, email: '' });
              }}
              error={errors.email}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              containerStyle={styles.fieldCompact}
            />

            <InputField
              iconName="lock-closed-outline"
              placeholder="Create Password"
              value={password}
              onChangeText={(t) => {
                setPassword(t);
                if (errors.password) setErrors({ ...errors, password: '' });
              }}
              error={errors.password}
              isPassword
              containerStyle={styles.fieldCompact}
            />

            <InputField
              iconName="lock-closed-outline"
              placeholder="Confirm Password"
              value={confirmPassword}
              onChangeText={(t) => {
                setConfirmPassword(t);
                if (errors.confirmPassword) setErrors({ ...errors, confirmPassword: '' });
              }}
              error={errors.confirmPassword}
              isPassword
              returnKeyType="done"
              onSubmitEditing={handleSignup}
              containerStyle={styles.fieldCompact}
            />

            <PrimaryButton
              title="Create Account"
              onPress={handleSignup}
              loading={isLoading}
              style={styles.createBtn}
            />

            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>OR</Text>
              <View style={styles.dividerLine} />
            </View>

            <SocialButton
              type="google"
              title="Continue with Google"
              onPress={handleGoogle}
              style={styles.socialBtn}
            />
            <SocialButton
              type="guest"
              title="Continue as Guest"
              onPress={onGuestContinue}
              style={styles.socialBtn}
            />

            <View style={styles.footer}>
              <Text style={styles.footerText}>Already have an account? </Text>
              <TouchableOpacity onPress={onLogin}>
                <Text style={styles.footerLink}>Sign In</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#FFFBF6',
  },
  flex: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  headerWrap: {
    position: 'relative',
    paddingTop: 8,
  },
  backBtn: {
    position: 'absolute',
    left: 20,
    top: 8,
    zIndex: 10,
  },
  formContainer: {
    paddingHorizontal: 24,
    width: '100%',
  },
  fieldCompact: {
    marginBottom: 10,
  },
  createBtn: {
    marginBottom: 16,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 16,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#ECE3D7',
  },
  dividerText: {
    marginHorizontal: 16,
    color: '#6F6F6F',
    fontSize: 12,
    fontWeight: '600',
  },
  socialBtn: {
    marginBottom: 16,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  footerText: {
    color: '#6F6F6F',
    fontSize: 14,
  },
  footerLink: {
    color: '#202020',
    fontSize: 14,
    fontWeight: '700',
  },
});
