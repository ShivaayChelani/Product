import React from 'react';
import { StyleSheet, ViewStyle, type StyleProp } from 'react-native';
import { AppleButton, appleAuth } from '@invertase/react-native-apple-authentication';
import { appleSignInButtonAppearance } from './appleSignInButtonAppearance';

/** Matches SocialButton so both providers sit on the same rhythm. */
const BUTTON_HEIGHT = 56;
const BUTTON_CORNER_RADIUS = 16;

interface AppleSignInButtonProps {
  /** "Sign in with Apple" on the login screen, "Sign up with Apple" during registration. */
  mode?: 'signIn' | 'signUp';
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * The official Apple sign-in button.
 *
 * Apple's Human Interface Guidelines (and App Review Guideline 4.8) require the system
 * `ASAuthorizationAppleButton`, not a look-alike. It renders Apple's own artwork, so
 * the label, weight and localization stay correct in every language and the system can
 * apply its accessibility and Dynamic Type behaviour. Callers must only render this on
 * a device where `canUseSignInWithApple()` is true.
 *
 * Black is the only style Apple permits as the default for a primary sign-in action.
 */
export const AppleSignInButton: React.FC<AppleSignInButtonProps> = ({
  mode = 'signIn',
  onPress,
  style,
  testID,
}) => {
  const { buttonType, buttonStyle } = appleSignInButtonAppearance(
    mode,
    AppleButton,
    appleAuth.isSignUpButtonSupported,
  );

  return (
    <AppleButton
      style={[styles.button, style]}
      buttonStyle={buttonStyle}
      buttonType={buttonType}
      cornerRadius={BUTTON_CORNER_RADIUS}
      onPress={onPress}
      testID={testID ?? 'appleSignInButton'}
    />
  );
};

const styles = StyleSheet.create({
  button: {
    height: BUTTON_HEIGHT,
    width: '100%',
  },
});
