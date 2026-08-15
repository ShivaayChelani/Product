import React from 'react';
import { Alert } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AuthStackParamList } from './types';
import { useTheme } from '../context/ThemeContext';
import { useUserContext } from '../context/UserContext';
import { useLazyScreen } from '../utils/useLazyScreen';

const Stack = createNativeStackNavigator<AuthStackParamList>();

const BETA_PHONE_MESSAGE = 'Phone verification will be available in a future update.';

function LoginSplashWrapper({ navigation }: any) {
  const Screen = useLazyScreen(() => require('../screens/LoginSplashScreen'));
  return <Screen navigation={navigation} />;
}

function LoginWrapper({ navigation }: any) {
  const { onLogin, onGuestContinue, authLoading } = useUserContext();
  const Screen = useLazyScreen(() => require('../screens/auth/LoginScreen'));

  return (
    <Screen
      onLogin={async (email: string, password: string) => {
        const result = await onLogin(email, password);
        if (result && typeof result === 'object' && result.requiresEmailVerification) {
          navigation.replace('EmailVerification', {
            email: result.email,
            from: 'login' as const,
          });
          return result;
        }
        return result === true;
      }}
      onSignup={() => navigation.navigate('Signup')}
      onBack={() => navigation.goBack()}
      onForgotPassword={() => navigation.navigate('ForgotPassword')}
      onGuestContinue={onGuestContinue}
      isLoading={authLoading}
    />
  );
}

/**
 * Create Account → email OTP verification → Home.
 * Phone OTP is not part of closed beta.
 */
function SignupWrapper({ navigation }: any) {
  const { onSignup, onGuestContinue, authLoading } = useUserContext();
  const Screen = useLazyScreen(() => require('../screens/auth/SignupScreen'));
  return (
    <Screen
      onSignup={async (name: string, email: string, password: string) => {
        const result = await onSignup(name, email, password);
        if (result && typeof result === 'object' && result.requiresEmailVerification) {
          navigation.replace('EmailVerification', {
            email: result.email,
            from: 'signup' as const,
          });
          return true;
        }
        return result === true;
      }}
      onLogin={() => navigation.navigate('Login')}
      onBack={() => navigation.goBack()}
      onGuestContinue={onGuestContinue}
      isLoading={authLoading}
    />
  );
}

function EmailVerificationWrapper({ navigation, route }: any) {
  const { onVerifyRegisterEmail, onResendRegisterOtp, authLoading } = useUserContext();
  const Screen = useLazyScreen(() => require('../screens/auth/EmailVerificationScreen'));
  const email = route.params?.email || '';
  const from = route.params?.from === 'login' ? 'login' : 'signup';

  return (
    <Screen
      email={email}
      isLoading={authLoading}
      onVerify={async (code: string) => onVerifyRegisterEmail(email, code)}
      onResend={async () => onResendRegisterOtp(email)}
      onBack={() => navigation.replace(from === 'login' ? 'Login' : 'Signup')}
    />
  );
}

/** Kept for a future release. Not linked from signup; actions show a beta notice. */
function PhoneNumberWrapper({ navigation, route }: any) {
  const Screen = useLazyScreen(() => require('../screens/auth/PhoneNumberScreen'));
  const { initialPhone } = route.params ?? {};
  return (
    <Screen
      initialPhone={initialPhone}
      onContinue={() => {
        Alert.alert('Coming soon', BETA_PHONE_MESSAGE);
      }}
      onBack={() => navigation.goBack()}
    />
  );
}

function ForgotPasswordWrapper({ navigation }: any) {
  const { onForgotPassword } = useUserContext();
  const Screen = useLazyScreen(() => require('../screens/auth/ForgotPasswordScreen'));
  return (
    <Screen
      onBack={() => navigation.goBack()}
      onResetPassword={onForgotPassword}
    />
  );
}

/** Kept for a future release. Not linked from signup; actions show a beta notice. */
function OTPVerificationWrapper({ navigation, route }: any) {
  const Screen = useLazyScreen(() => require('../screens/auth/OTPVerificationScreen'));
  const { phoneNumber = '+91 98765 43210' } = route.params ?? {};

  return (
    <Screen
      phoneNumber={phoneNumber}
      isLoading={false}
      onVerify={async () => {
        Alert.alert('Coming soon', BETA_PHONE_MESSAGE);
        return false;
      }}
      onChangeNumber={() => {
        Alert.alert('Coming soon', BETA_PHONE_MESSAGE);
      }}
      onBack={() => navigation.goBack()}
      onResend={async () => {
        Alert.alert('Coming soon', BETA_PHONE_MESSAGE);
      }}
    />
  );
}

export default function AuthNavigator({ initialRoute }: { initialRoute?: string }) {
  const { theme } = useTheme();

  return (
    <Stack.Navigator
      initialRouteName={(initialRoute || 'LoginSplash') as keyof AuthStackParamList}
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.background },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="LoginSplash" component={LoginSplashWrapper} />
      <Stack.Screen name="Login" component={LoginWrapper} />
      <Stack.Screen name="Signup" component={SignupWrapper} />
      <Stack.Screen name="EmailVerification" component={EmailVerificationWrapper} />
      <Stack.Screen name="PhoneNumber" component={PhoneNumberWrapper} />
      <Stack.Screen name="ForgotPassword" component={ForgotPasswordWrapper} />
      <Stack.Screen name="OTPVerification" component={OTPVerificationWrapper} />
    </Stack.Navigator>
  );
}
