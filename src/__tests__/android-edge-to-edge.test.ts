import fs from 'fs';
import path from 'path';

const root = process.cwd();

function walk(dir: string, acc: string[] = []): string[] {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(full, acc);
    else if (/\.(tsx|ts)$/.test(ent.name)) acc.push(full);
  }
  return acc;
}

describe('Android 15 edge-to-edge compatibility', () => {
  const gradleProps = fs.readFileSync(path.join(root, 'android/gradle.properties'), 'utf8');
  const styles = fs.readFileSync(path.join(root, 'android/app/src/main/res/values/styles.xml'), 'utf8');
  const vendorReels = fs.readFileSync(path.join(root, 'src/screens/VendorReelsScreen.tsx'), 'utf8');

  it('opts into React Native edge-to-edge without AGP 9', () => {
    expect(gradleProps).toMatch(/edgeToEdgeEnabled\s*=\s*true/);
    expect(gradleProps).toMatch(/android\.r8\.optimizedResourceShrinking\s*=\s*true/);
    expect(gradleProps).not.toMatch(/android\.enableR8\.fullMode/);
  });

  it('does not set deprecated system-bar colors in AppTheme', () => {
    expect(styles).not.toMatch(/android:navigationBarColor/);
    expect(styles).not.toMatch(/android:statusBarColor/);
    expect(styles).not.toMatch(/windowLayoutInDisplayCutoutMode/);
  });

  it('keeps StatusBar barStyle only — no backgroundColor or translucent', () => {
    const offenders: string[] = [];
    for (const file of walk(path.join(root, 'src'))) {
      const src = fs.readFileSync(file, 'utf8');
      const matches = src.match(/<StatusBar\b[^>]*\/>/g) || [];
      for (const tag of matches) {
        if (/backgroundColor|translucent/.test(tag)) {
          offenders.push(`${path.relative(root, file)}: ${tag}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('pads the vendor Moments header with the real safe-area inset', () => {
    expect(vendorReels).toContain('useSafeAreaInsets');
    expect(vendorReels).toContain('paddingTop: Math.max(insets.top, 16) + 12');
    expect(vendorReels).not.toMatch(/paddingTop: Platform\.OS === 'ios' \? 54 : 36/);
  });
});
