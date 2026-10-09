#!/usr/bin/env node
/**
 * Generate Android + iOS launcher icons and the Play listing icon
 * from src/assets/logo1.png (gold artwork, transparent source).
 *
 * All shipped icons are flattened onto solid #FFFFFF so the mark stays
 * visible on dark launchers and Play Store dark theme.
 *
 * Usage: node scripts/generate-app-icons.js
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..');
const SOURCE = path.join(ROOT, 'src', 'assets', 'logo1.png');
const ANDROID_RES = path.join(ROOT, 'android', 'app', 'src', 'main', 'res');
const IOS_ICON_DIR = path.join(ROOT, 'ios', 'PalSafar', 'Images.xcassets', 'AppIcon.appiconset');
const PLAY_ICON_DIR = path.join(ROOT, 'store', 'google-play');
const PLAY_ICON = path.join(PLAY_ICON_DIR, 'icon-512.png');

const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };

const ANDROID_LAUNCHER = {
  'mipmap-mdpi': 48,
  'mipmap-hdpi': 72,
  'mipmap-xhdpi': 96,
  'mipmap-xxhdpi': 144,
  'mipmap-xxxhdpi': 192,
};

const ANDROID_FOREGROUND = {
  'mipmap-mdpi': 108,
  'mipmap-hdpi': 162,
  'mipmap-xhdpi': 216,
  'mipmap-xxhdpi': 324,
  'mipmap-xxxhdpi': 432,
};

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

/** Flatten the gold logo onto an opaque white square. padRatio keeps a safe margin. */
async function flattenLogoOnWhite(size, outPath, padRatio = 0.08) {
  const inner = Math.max(1, Math.round(size * (1 - padRatio * 2)));
  const pad = Math.round((size - inner) / 2);

  await sharp({
    create: { width: size, height: size, channels: 4, background: WHITE },
  })
    .composite([
      {
        input: await sharp(SOURCE)
          .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
          .png()
          .toBuffer(),
        top: pad,
        left: pad,
      },
    ])
    .flatten({ background: WHITE })
    .removeAlpha()
    .png()
    .toFile(outPath);
}

async function generateAndroid() {
  for (const [folder, size] of Object.entries(ANDROID_LAUNCHER)) {
    const dir = path.join(ANDROID_RES, folder);
    fs.mkdirSync(dir, { recursive: true });
    await flattenLogoOnWhite(size, path.join(dir, 'ic_launcher.png'), 0.08);
    await flattenLogoOnWhite(size, path.join(dir, 'ic_launcher_round.png'), 0.16);
  }

  for (const [folder, size] of Object.entries(ANDROID_FOREGROUND)) {
    const dir = path.join(ANDROID_RES, folder);
    fs.mkdirSync(dir, { recursive: true });
    // Adaptive safe zone is ~66/108. Keep the mark inside that circle.
    await flattenLogoOnWhite(size, path.join(dir, 'ic_launcher_foreground.png'), 0.2);
  }
}

async function generateIos() {
  fs.mkdirSync(IOS_ICON_DIR, { recursive: true });
  for (const icon of IOS_ICONS) {
    const pad = icon.size >= 1024 ? 0.08 : 0.06;
    await flattenLogoOnWhite(icon.size, path.join(IOS_ICON_DIR, icon.name), pad);
  }

  const contents = {
    images: [
      { size: '20x20', idiom: 'iphone', filename: 'Icon-App-20x20@2x.png', scale: '2x' },
      { size: '20x20', idiom: 'iphone', filename: 'Icon-App-20x20@3x.png', scale: '3x' },
      { size: '29x29', idiom: 'iphone', filename: 'Icon-App-29x29@2x.png', scale: '2x' },
      { size: '29x29', idiom: 'iphone', filename: 'Icon-App-29x29@3x.png', scale: '3x' },
      { size: '40x40', idiom: 'iphone', filename: 'Icon-App-40x40@2x.png', scale: '2x' },
      { size: '40x40', idiom: 'iphone', filename: 'Icon-App-40x40@3x.png', scale: '3x' },
      { size: '60x60', idiom: 'iphone', filename: 'Icon-App-60x60@2x.png', scale: '2x' },
      { size: '60x60', idiom: 'iphone', filename: 'Icon-App-60x60@3x.png', scale: '3x' },
      { size: '1024x1024', idiom: 'ios-marketing', filename: 'Icon-App-1024x1024@1x.png', scale: '1x' },
    ],
    info: { version: 1, author: 'xcode' },
  };

  fs.writeFileSync(path.join(IOS_ICON_DIR, 'Contents.json'), JSON.stringify(contents, null, 2));
}

async function generatePlayListing() {
  fs.mkdirSync(PLAY_ICON_DIR, { recursive: true });
  await flattenLogoOnWhite(512, PLAY_ICON, 0.1);
}

async function main() {
  if (!fs.existsSync(SOURCE)) {
    console.error(`Source icon not found: ${SOURCE}`);
    process.exit(1);
  }

  console.log(`Generating app icons from ${SOURCE} on #FFFFFF`);
  await generateAndroid();
  await generateIos();
  await generatePlayListing();
  console.log(`Done — Android mipmaps, iOS AppIcon, and ${path.relative(ROOT, PLAY_ICON)}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
