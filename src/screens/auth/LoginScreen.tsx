import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  StatusBar,
  ScrollView,
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

interface LoginScreenProps {
  onLogin: (
    email: string,
    pass: string,
  ) => Promise<boolean | { requiresEmailVerification: true; email: string }>;
  onSignup: () => void;
  onBack: () => void;
  onForgotPassword: () => void;
  onGuestContinue: () => void;
  isLoading?: boolean;
}

export default function LoginScreen({ 
  onLogin, 
  onSignup, 
  onBack,
  onForgotPassword, 
  onGuestContinue, 
  isLoading = false 
}: LoginScreenProps) {
  const insets = useSafeAreaInsets();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = useCallback(() => {
    const e: Record<string, string> = {};
    if (!email.trim()) e.email = 'Email is required';
    else if (!EMAIL_REGEX.test(email.trim())) e.email = 'Please enter a valid email';
    if (!password) e.password = 'Password is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  }, [email, password]);

  const handleLogin = useCallback(async () => {
    Keyboard.dismiss();
    if (!validate()) return;
    try {
      const result = await onLogin(email.trim(), password);
      if (result && typeof result === 'object' && result.requiresEmailVerification) {
        // AuthNavigator LoginWrapper handles navigation when result is this shape —
        // keep a no-op success path here if wrapper already navigated.
        return;
      }
      if (!result) {
        setErrors({ email: 'Invalid credentials', password: 'Or incorrect password' });
      }
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Login failed. Please try again.');
    }
  }, [email, password, onLogin, validate]);

  const handleGoogle = () => {
    Alert.alert('Coming soon', 'Google sign-in will be available in a future update.');
  };

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
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
            <TouchableOpacity onPress={onBack} style={styles.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Icon name="chevron-back" size={24} color="#2C1810" />
            </TouchableOpacity>
            <AuthHeader 
              title="Welcome Back" 
              subtitle="Sign in to continue your journey" 
              showLogo={true} 
            />
          </View>

          <View style={styles.formContainer}>
            <InputField
              iconName="mail-outline"
              placeholder="Email Address / Mobile Number"
              value={email}
              onChangeText={(t) => {
                setEmail(t);
                if (errors.email) setErrors({ ...errors, email: '' });
              }}
              error={errors.email}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            
            <InputField
              iconName="lock-closed-outline"
              placeholder="Password"
              value={password}
              onChangeText={(t) => {
                setPassword(t);
                if (errors.password) setErrors({ ...errors, password: '' });
              }}
              error={errors.password}
              isPassword
              returnKeyType="done"
              onSubmitEditing={handleLogin}
            />

            <View style={styles.forgotPasswordRow}>
              <TouchableOpacity onPress={onForgotPassword}>
                <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
              </TouchableOpacity>
            </View>

            <PrimaryButton 
              title="Sign In" 
              onPress={handleLogin} 
              loading={isLoading} 
              style={styles.loginBtn}
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
              <Text style={styles.footerText}>Don't have an account? </Text>
              <TouchableOpacity onPress={onSignup}>
                <Text style={styles.footerLink}>Create Account</Text>
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
    top: 24,
    zIndex: 10,
  },
  formContainer: {
    paddingHorizontal: 24,
    width: '100%',
  },
  forgotPasswordRow: {
    alignItems: 'flex-end',
    marginBottom: 24,
    marginTop: -8,
  },
  forgotPasswordText: {
    color: '#6F6F6F',
    fontSize: 13,
    fontWeight: '600',
  },
  loginBtn: {
    marginBottom: 2,
  },
  socialBtn: {
    marginBottom: 12,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 6,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#ECE3D7',
  },
  dividerText: {
    paddingVertical: 10,
    paddingHorizontal: 4,
    marginTop: 8,
    color: '#6F6F6F',
    fontWeight: '600',
    fontSize: 12,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  footerText: {
    fontSize: 14,
    color: '#6F6F6F',
  },
  footerLink: {
    fontSize: 14,
    fontWeight: '700',
    color: '#202020',
  },
});
