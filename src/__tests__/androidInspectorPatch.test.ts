import fs from 'fs';
import path from 'path';

/**
 * Regression guards for the RN 0.81 Android Fusebox HostTarget SIGABRT mitigation.
 *
 * 1) patch-package restores HostTarget::registerInstance lifecycle recovery (defense
 *    in depth when react-android is built from source).
 * 2) debug APKs embed the JS bundle so Metro-down startups do not hit the
 *    Unable-to-load-script → reload → double registerInstance crash path.
 */
describe('android inspector HostTarget mitigation', () => {
  const patchPath = path.join(
    process.cwd(),
    'patches',
    'react-native+0.81.5.patch',
  );
  const appGradlePath = path.join(process.cwd(), 'android', 'app', 'build.gradle');

  it('includes the HostTarget registerInstance lifecycle recovery patch', () => {
    expect(fs.existsSync(patchPath)).toBe(true);
    const patch = fs.readFileSync(patchPath, 'utf8');
    expect(patch).toContain('HostTarget.cpp');
    expect(patch).toContain('if (currentInstance_)');
    expect(patch).toContain('currentInstance_.reset()');
  });

  it('embeds the JS bundle in debug via empty debuggableVariants', () => {
    const gradle = fs.readFileSync(appGradlePath, 'utf8');
    expect(gradle).toMatch(/debuggableVariants\s*=\s*\[\s*\]/);
  });
});
