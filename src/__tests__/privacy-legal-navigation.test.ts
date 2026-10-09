const fs = require('fs');
const path = require('path');

function read(rel: string): string {
  return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
}

describe('Privacy, legal navigation, and support contact', () => {
  it('auth splash and legal hub pass the intended document type', () => {
    const auth = read('navigation/AuthNavigator.tsx');
    const splash = read('screens/LoginSplashScreen.tsx');

    expect(splash).toMatch(/AuthLegalDocument',\s*\{\s*type:\s*'TERMS_CONDITIONS'/);
    expect(splash).toMatch(/AuthLegalDocument',\s*\{\s*type:\s*'PRIVACY_POLICY'/);
    expect(auth).toMatch(/type: 'TERMS_CONDITIONS' as const/);
    expect(auth).toMatch(/type: 'PRIVACY_POLICY' as const/);
    expect(auth).toMatch(/navigate\('AuthLegalDocument', \{ type, title: label \}\)/);
    expect(auth).toMatch(/const \{ type, title \} = route\.params/);
  });

  it('uses the active support email and makes legal emails tappable', () => {
    const settings = read('screens/SettingsScreen.tsx');
    const markdown = read('components/ui/SimpleMarkdown.tsx');

    expect(settings).toMatch(/mailto:\$\{SUPPORT_EMAIL\}/);
    expect(settings).not.toContain('shivaay.chelai@gmail.com');
    expect(markdown).toMatch(/normalizeSupportEmailTypo\(content\)/);
    expect(markdown).toMatch(/Linking\.openURL\(`mailto:\$\{part\}`\)/);
  });

  it('saves one privacy key at a time and does not freeze every switch while saving', () => {
    const privacy = read('screens/settings/PrivacyNotificationScreens.tsx');
    const section = read('features/settings/components/SettingsSection.tsx');
    const hook = read('features/settings/hooks/useUserAppSettings.ts');

    expect(privacy).toMatch(/privacy: \{ \[key\]: value \}/);
    expect(privacy).not.toMatch(/loading: patch\.isPending/);
    expect(section).toMatch(/trackColor=\{\{ false: '#E2E0DB', true: '#111111' \}\}/);
    expect(section).toMatch(/ios_backgroundColor="#E2E0DB"/);
    expect(section).toMatch(/item\.switchValue \? '#FFFFFF' : '#5C574F'/);
    expect(hook).toMatch(/onMutate:/);
    expect(hook).toMatch(/mergeUserAppSettings/);
    expect(hook).toMatch(/applyOwnedServerSettings/);
    expect(hook).toMatch(/rollbackFailedSettingsPatch/);
    expect(hook).toMatch(/Could not save/);
    const profile = read('features/travelSocial/screens/ViewCreatorProfileScreen.tsx');
    const social = read('../server/src/modules/social/social.service.ts');
    expect(social).toMatch(/bio: privacyMask\.hideProfile \? null : profile\.bio/);
    expect(social).toMatch(/const visibleReels = privacyMask\.hideReels \? \[\] : profile\.reels/);
    expect(profile).toMatch(/profile\.bio/);
    expect(profile).toMatch(/profile\.reels/);
  });

  it('keeps Delete Personal Data and omits download/block-list from user-facing settings', () => {
    const settings = read('screens/SettingsScreen.tsx');
    const privacy = read('screens/settings/PrivacyNotificationScreens.tsx');
    const root = read('navigation/RootNavigator.tsx');

    expect(privacy).toMatch(/Delete Personal Data/);
    expect(privacy).toMatch(/deletePersonalData/);
    expect(settings).not.toMatch(/Download Personal Data/);
    expect(privacy).not.toMatch(/Download Personal Data/);
    expect(settings).not.toMatch(/Block List/);
    expect(privacy).not.toMatch(/Block List/);
    expect(root).not.toMatch(/name="BlockList"/);
  });
});
