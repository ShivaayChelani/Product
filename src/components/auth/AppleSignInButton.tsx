import React from 'react';
import { StyleSheet, ViewStyle, type StyleProp } from 'react-native';
import { AppleButton, AppleButtonStyle, AppleButtonType } from '@invertase/react-native-apple-authentication';

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
 * `ASAuthorizationAppleButton`, not a look-alike ? it renders Apple's own artwork, so
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
  // "Sign up with Apple" requires iOS 13.2+; fall back to the sign-in wording below it.
  const buttonType =
    mode === 'signUp' && AppleButtonType.SIGN_UP ? AppleButtonType.SIGN_UP : AppleButtonType.SIGN_IN;

  return (
    <AppleButton
      style={[styles.button, style]}
      buttonStyle={AppleButtonStyle.BLACK}
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
