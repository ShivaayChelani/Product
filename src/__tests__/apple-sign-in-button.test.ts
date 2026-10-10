import fs from 'fs';
import path from 'path';
import { appleSignInButtonAppearance } from '../components/auth/appleSignInButtonAppearance';

const packageRoot = path.join(
  __dirname,
  '../../node_modules/@invertase/react-native-apple-authentication/lib',
);

const installedButton = {
  Type: { SIGN_IN: 'SignIn', SIGN_UP: 'SignUp' },
  Style: { BLACK: 'Black' },
};

describe('Apple sign-in button package exports', () => {
  it('matches the runtime shape of @invertase/react-native-apple-authentication 2.5.1', () => {
    const indexJs = fs.readFileSync(path.join(packageRoot, 'index.js'), 'utf8');
    const sharedJs = fs.readFileSync(path.join(packageRoot, 'AppleButton.shared.js'), 'utf8');
    const iosJs = fs.readFileSync(path.join(packageRoot, 'AppleButton.ios.js'), 'utf8');
    const component = fs.readFileSync(
      path.join(__dirname, '../components/auth/AppleSignInButton.tsx'),
      'utf8',
    );

    expect(indexJs).toContain('export { default as AppleButton }');
    expect(indexJs).not.toContain('AppleButtonType');
    expect(indexJs).not.toContain('AppleButtonStyle');
    expect(sharedJs).toContain("SIGN_IN: 'SignIn'");
    expect(sharedJs).toContain("SIGN_UP: 'SignUp'");
    expect(sharedJs).toContain("BLACK: 'Black'");
    expect(iosJs).toContain('AppleButton.Type = ButtonTypes');
    expect(iosJs).toContain('AppleButton.Style = ButtonVariants');
    expect(component).toContain('appleSignInButtonAppearance');
    expect(component).not.toContain('AppleButtonType');
    expect(component).not.toContain('AppleButtonStyle');
  });

  it('uses the black sign-in button, and sign-up only when iOS supports it', () => {
    expect(appleSignInButtonAppearance('signIn', installedButton, true)).toEqual({
      buttonType: 'SignIn',
      buttonStyle: 'Black',
    });
    expect(appleSignInButtonAppearance('signUp', installedButton, true)).toEqual({
      buttonType: 'SignUp',
      buttonStyle: 'Black',
    });
    expect(appleSignInButtonAppearance('signUp', installedButton, false)).toEqual({
      buttonType: 'SignIn',
      buttonStyle: 'Black',
    });
  });
});
