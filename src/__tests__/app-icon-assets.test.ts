import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const root = process.cwd();
const WHITE = { r: 255, g: 255, b: 255 };

const ANDROID_LAUNCHER = {
  'mipmap-mdpi': 48,
  'mipmap-hdpi': 72,
  'mipmap-xhdpi': 96,
  'mipmap-xxhdpi': 144,
  'mipmap-xxxhdpi': 192,
} as const;

const ANDROID_FOREGROUND = {
  'mipmap-mdpi': 108,
  'mipmap-hdpi': 162,
  'mipmap-xhdpi': 216,
  'mipmap-xxhdpi': 324,
  'mipmap-xxxhdpi': 432,
} as const;

const IOS_ICONS = [
  { name: 'Icon-App-20x20@2x.png', size: 40 },
  { name: 'Icon-App-20x20@3x.png', size: 60 },
  { name: 'Icon-App-29x29@2x.png', size: 58 },
  { name: 'Icon-App-29x29@3x.png', size: 87 },
  { name: 'Icon-App-40x40@2x.png', size: 80 },
  { name: 'Icon-App-40x40@3x.png', size: 120 },
  { name: 'Icon-App-60x60@2x.png', size: 120 },
  { name: 'Icon-App-60x60@3x.png', size: 180 },
  { name: 'Icon-App-1024x1024@1x.png', size: 1024 },
];

async function assertOpaqueWhiteSquare(file: string, size: number) {
  expect(fs.existsSync(file)).toBe(true);
  const img = sharp(file);
  const meta = await img.metadata();
  expect(meta.format).toBe('png');
  expect(meta.width).toBe(size);
  expect(meta.height).toBe(size);
  expect(Boolean(meta.hasAlpha)).toBe(false);

  const { data, info } = await sharp(file).raw().toBuffer({ resolveWithObject: true });
  expect(info.channels).toBe(3);
  const last = (info.width * info.height - 1) * info.channels;
  const corners = [0, (info.width - 1) * info.channels, (info.height - 1) * info.width * info.channels, last];
  for (const i of corners) {
    expect(data[i]).toBe(WHITE.r);
    expect(data[i + 1]).toBe(WHITE.g);
    expect(data[i + 2]).toBe(WHITE.b);
  }
}

describe('PalSafar launcher and Play listing icons', () => {
  const colors = fs.readFileSync(path.join(root, 'android/app/src/main/res/values/colors.xml'), 'utf8');
  const generator = fs.readFileSync(path.join(root, 'scripts/generate-app-icons.js'), 'utf8');
  const adaptive = fs.readFileSync(
    path.join(root, 'android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml'),
    'utf8',
  );

  it('uses a solid white adaptive icon background', () => {
    expect(colors).toMatch(/<color name="iconBackground">#FFFFFF<\/color>/);
    expect(adaptive).toContain('@color/iconBackground');
    expect(adaptive).toContain('@mipmap/ic_launcher_foreground');
  });

  it('flattens generated icons onto #FFFFFF and never converts them to JPEG', () => {
    expect(generator).toContain('r: 255, g: 255, b: 255');
    expect(generator).toContain('flatten({ background: WHITE })');
    expect(generator).toContain('removeAlpha()');
    expect(generator).toContain("store', 'google-play'");
    expect(generator).toContain('icon-512.png');
    expect(generator).not.toMatch(/\.jpe?g\(\)/);
    expect(generator).not.toMatch(/transparent = true/);
  });

  it('keeps Android launcher, round, and adaptive foreground sizes consistent', async () => {
    for (const [folder, size] of Object.entries(ANDROID_LAUNCHER)) {
      await assertOpaqueWhiteSquare(
        path.join(root, 'android/app/src/main/res', folder, 'ic_launcher.png'),
        size,
      );
      await assertOpaqueWhiteSquare(
        path.join(root, 'android/app/src/main/res', folder, 'ic_launcher_round.png'),
        size,
      );
    }
    for (const [folder, size] of Object.entries(ANDROID_FOREGROUND)) {
      await assertOpaqueWhiteSquare(
        path.join(root, 'android/app/src/main/res', folder, 'ic_launcher_foreground.png'),
        size,
      );
    }
  });

  it('keeps iOS AppIcon sizes consistent and opaque', async () => {
    for (const icon of IOS_ICONS) {
      await assertOpaqueWhiteSquare(
        path.join(root, 'ios/PalSafar/Images.xcassets/AppIcon.appiconset', icon.name),
        icon.size,
      );
    }
  });

  it('ships an opaque 512×512 PNG Play listing icon', async () => {
    await assertOpaqueWhiteSquare(path.join(root, 'store/google-play/icon-512.png'), 512);
  });
});
