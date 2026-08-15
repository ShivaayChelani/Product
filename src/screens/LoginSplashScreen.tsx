import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBottomSafePadding } from '../design/responsive';
import { AuthHeader } from '../components/auth/AuthHeader';
import { PrimaryButton } from '../components/auth/PrimaryButton';
import { SecondaryButton } from '../components/auth/SecondaryButton';
import { SocialButton } from '../components/auth/SocialButton';
import { useUserContext } from '../context/UserContext';

export default function LoginSplashScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const contentPadBottom = useBottomSafePadding(28);
  const { onGuestContinue } = useUserContext();

  const handleGoogle = () => {
    Alert.alert('Coming soon', 'Google sign-in will be available in a future update.');
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <View style={[styles.content, { paddingTop: Math.max(insets.top, 16), paddingBottom: contentPadBottom }]}>
        <View style={styles.topSection}>
          <AuthHeader
            title="Welcome Explorer! 👋"
            subtitle="Begin your adventure with PalSafar"
          />
        </View>

        <View style={styles.actionsSection}>
          <PrimaryButton
            title="Create Account"
            iconName="person-add-outline"
            onPress={() => navigation.navigate('Signup')}
            style={styles.actionBtn}
          />
          <SecondaryButton
            title="Sign In"
            iconName="lock-closed-outline"
            onPress={() => navigation.navigate('Login')}
            style={styles.actionBtn}
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
            style={styles.actionBtn}
          />
          <SocialButton
            type="guest"
            title="Continue as Guest"
            onPress={onGuestContinue}
            style={styles.actionBtn}
          />
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            By continuing, you agree to our{' '}
            <Text style={styles.footerLink} onPress={() => navigation.navigate('LegalHub')}>
              Terms & Conditions
            </Text>
            {' '}and{' '}
            <Text style={styles.footerLink} onPress={() => navigation.navigate('LegalHub')}>
              Privacy Policy
            </Text>
          </Text>
        </View>
      </View>
    </View>
  );
}

const COLORS = {
  bg: '#FFFFFF',
  divider: '#ECE3D7',
  muted: '#6F6F6F',
  link: '#202020',
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  content: {
    flex: 1,
    paddingHorizontal: 28,
    justifyContent: 'space-between',
  },
  topSection: {
    alignItems: 'center',
  },
  actionsSection: {
    width: '100%',
    alignItems: 'center',
  },
  actionBtn: {
    marginBottom: 14,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    marginVertical: 10,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.divider,
  },
  dividerText: {
    marginHorizontal: 16,
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  footer: {
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  footerText: {
    color: COLORS.muted,
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
  footerLink: {
    color: COLORS.link,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
});
