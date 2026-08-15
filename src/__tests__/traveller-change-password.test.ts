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
});
