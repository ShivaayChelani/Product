/**
 * Resolves the native Apple button kind and color.
 *
 * The installed package attaches these values to `AppleButton.Type` and
 * `AppleButton.Style`. They are not separate runtime exports.
 */
export function appleSignInButtonAppearance<TType extends string, TStyle extends string>(
  mode: 'signIn' | 'signUp',
  button: {
    Type: { SIGN_IN: TType; SIGN_UP: TType };
    Style: { BLACK: TStyle };
  },
  signUpSupported: boolean,
): { buttonType: TType; buttonStyle: TStyle } {
  return {
    buttonType:
      mode === 'signUp' && signUpSupported ? button.Type.SIGN_UP : button.Type.SIGN_IN,
    buttonStyle: button.Style.BLACK,
  };
}
