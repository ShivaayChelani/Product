import React, { useState, useCallback, useEffect } from 'react';
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
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import { AuthHeader } from '../../components/auth/AuthHeader';
import { PrimaryButton } from '../../components/auth/PrimaryButton';
import { InputField } from '../../components/auth/InputField';
import { SocialButton } from '../../components/auth/SocialButton';
import { LegalConsentRow } from '../../components/auth/LegalConsentRow';
import { legalApi, type LegalCurrentVersions } from '../../services/api/legal';
import { useBackDismissesKeyboard } from '../../hooks/useBackDismissesKeyboard';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,128}$/;

interface LegalMeta {
  termsVersion: number;
  privacyVersion: number;
  platform: 'ios' | 'android' | 'web';
}

interface SignupScreenProps {
  onSignup: (name: string, email: string, pass: string, legalMeta: LegalMeta) => Promise<boolean>;
  onGoogleLogin: () => Promise<boolean>;
  onLogin: () => void;
  onBack: () => void;
  onGuestContinue: () => void;
  isLoading?: boolean;
  /** Navigate to Terms & Conditions document (from auth stack) */
  onOpenTerms?: () => void;
  /** Navigate to Privacy Policy document (from auth stack) */
  onOpenPrivacy?: () => void;
}

function signupErrorMessage(err: unknown): string {
  if (err && typeof err === 'object') {
    const status = (err as { status?: number }).status;
    if (status === 409) return 'That email is already registered. Try logging in.';
    if (status === 429) return 'Too many attempts. Please try again later.';
  }
  const e = err as Error;
  return e.message || 'Registration failed. Please try again.';
}

export default function SignupScreen({
  onSignup,
  onGoogleLogin,
  onLogin,
  onBack,
  onGuestContinue,
  isLoading = false,
  onOpenTerms,
  onOpenPrivacy,
}: SignupScreenProps) {
  const insets = useSafeAreaInsets();
  const { dismissThenNavigate } = useBackDismissesKeyboard();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Legal consent state
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);

  // Legal versions fetched from backend
  const [legalVersions, setLegalVersions] = useState<LegalCurrentVersions | null>(null);
  const [legalVersionsLoading, setLegalVersionsLoading] = useState(true);
  const [legalVersionsError, setLegalVersionsError] = useState(false);

  // Fetch current legal document versions on mount
  useEffect(() => {
    let cancelled = false;
    setLegalVersionsLoading(true);
    setLegalVersionsError(false);

    legalApi.getCurrentVersions()
      .then((res) => {
        if (cancelled) return;
        setLegalVersions(res.data);
        setLegalVersionsLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setLegalVersionsLoading(false);
        setLegalVersionsError(true);
      });

    return () => { cancelled = true; };
  }, []);

  const retryLegalVersions = useCallback(() => {
    setLegalVersionsLoading(true);
    setLegalVersionsError(false);
    legalApi.getCurrentVersions()
      .then((res) => {
        setLegalVersions(res.data);
        setLegalVersionsLoading(false);
      })
      .catch(() => {
        setLegalVersionsLoading(false);
        setLegalVersionsError(true);
      });
  }, []);

  const bothLegalAccepted = termsAccepted && privacyAccepted;

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

    if (!bothLegalAccepted) {
      Alert.alert(
        'Legal Acceptance Required',
        'Please accept both the Terms & Conditions and Privacy Policy to create an account.',
      );
      return;
    }

    if (!legalVersions) {
      Alert.alert(
        'Cannot Continue',
        'Unable to load legal document versions. Please check your connection and try again.',
      );
      return;
    }

    const legalMeta: LegalMeta = {
      termsVersion: legalVersions.termsVersion,
      privacyVersion: legalVersions.privacyVersion,
      platform: Platform.OS === 'ios' ? 'ios' : 'android',
    };

    try {
      await onSignup(name.trim(), email.trim(), password, legalMeta);
    } catch (err: unknown) {
      const message = signupErrorMessage(err);
      const status = err && typeof err === 'object' ? (err as { status?: number }).status : undefined;
      if (status === 409) {
        setErrors({ email: message });
        return;
      }
      Alert.alert('Error', message);
    }
  }, [name, email, password, onSignup, validate, bothLegalAccepted, legalVersions]);

  const handleGoogle = async () => {
    try {
      await onGoogleLogin();
    } catch (err: any) {
      Alert.alert('Google Sign-Up', err?.message || 'Google Sign-Up failed. Please try again.');
    }
  };

  // "Create Account" is disabled until both checkboxes are checked, legal versions are loaded, and not currently loading
  const canSubmit = bothLegalAccepted && !isLoading && !legalVersionsLoading && !!legalVersions;

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFBF6" />
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
          <View style={styles.headerWrap}>
            <TouchableOpacity onPress={() => dismissThenNavigate(onBack)} style={styles.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
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

            {/* ── Legal consent checkboxes ── */}
            <View style={styles.legalSection}>
              {legalVersionsLoading ? (
                <View style={styles.legalLoadingRow}>
                  <ActivityIndicator size="small" color="#B9834B" />
                  <Text style={styles.legalLoadingText}>Loading agreement…</Text>
                </View>
              ) : legalVersionsError ? (
                <View style={styles.legalErrorRow}>
                  <Text style={styles.legalErrorText}>
                    Could not load legal documents.{' '}
                  </Text>
                  <TouchableOpacity onPress={retryLegalVersions} hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}>
                    <Text style={styles.legalRetryLink}>Retry</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  <LegalConsentRow
                    accepted={termsAccepted}
                    onToggle={() => setTermsAccepted((v) => !v)}
                    onOpenDocument={() => onOpenTerms?.()}
                    label="I agree to the"
                    linkLabel="Terms & Conditions"
                    accessibilityLabel="Accept Terms and Conditions"
                  />
                  <LegalConsentRow
                    accepted={privacyAccepted}
                    onToggle={() => setPrivacyAccepted((v) => !v)}
                    onOpenDocument={() => onOpenPrivacy?.()}
                    label="I have read the"
                    linkLabel="Privacy Policy"
                    accessibilityLabel="Accept Privacy Policy"
                  />
                </>
              )}
            </View>

            <PrimaryButton
              title="Create Account"
              onPress={handleSignup}
              loading={isLoading}
              style={styles.createBtn}
              disabled={!canSubmit}
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
        </ScrollView>
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
  scrollContent: {
    flexGrow: 1,
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
  legalSection: {
    marginTop: 4,
    marginBottom: 8,
  },
  legalLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    paddingVertical: 4,
  },
  legalLoadingText: {
    color: '#AAAAAA',
    fontSize: 13,
    marginLeft: 8,
  },
  legalErrorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    flexWrap: 'wrap',
  },
  legalErrorText: {
    color: '#CC3333',
    fontSize: 13,
    lineHeight: 18,
  },
  legalRetryLink: {
    color: '#B9834B',
    fontSize: 13,
    fontWeight: '700',
    textDecorationLine: 'underline',
    lineHeight: 18,
  },
  createBtn: {
    marginTop: 8,
    marginBottom: 16,
  },
  createBtnDisabled: {
    opacity: 0.55,
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
