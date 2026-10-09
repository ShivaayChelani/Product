import fs from 'fs';
import path from 'path';

const settings = fs.readFileSync(
  path.join(__dirname, '../screens/SettingsScreen.tsx'),
  'utf8',
);
const security = fs.readFileSync(
  path.join(__dirname, '../screens/settings/SecurityScreens.tsx'),
  'utf8',
);
const changePassword = fs.readFileSync(
  path.join(__dirname, '../screens/ChangePasswordScreen.tsx'),
  'utf8',
);
const forgotPassword = fs.readFileSync(
  path.join(__dirname, '../screens/auth/ForgotPasswordScreen.tsx'),
  'utf8',
);

describe('Traveller password settings', () => {
  it('lets a traveller open Change Password from Settings', () => {
    expect(settings).toContain("navigate('ChangePassword')");
    expect(settings).toContain('Change Password');
    expect(settings).toContain('isGuest');
  });

  it('also exposes Change Password on the Security screen', () => {
    expect(security).toContain("navigate('ChangePassword')");
    expect(security).toContain('Change Password');
  });

  it('does not render the splash portrait between the header and the password form', () => {
    expect(changePassword).not.toContain('splash.png');
    expect(changePassword).not.toContain('LOCK_ART');
    expect(changePassword).not.toContain('illustrationWrap');
    expect(changePassword).not.toMatch(/<Image[\s>]/);
    expect(changePassword).toContain('title="Change Password"');
    expect(changePassword).toContain('Update your password to keep your account secure');
    expect(changePassword).toContain('name="currentPassword"');
    expect(changePassword).toContain('label="Current Password"');
    expect(changePassword).toContain('name="newPassword"');
    expect(changePassword).toContain('name="confirmPassword"');
    expect(changePassword).toContain('<PasswordStrengthMeter');
    expect(changePassword).toContain('shield-checkmark');
    expect(changePassword).toContain('Update Password');
    expect(changePassword).toContain('authApi.changePassword');
    expect(forgotPassword).not.toContain('splash.png');
  });
});
