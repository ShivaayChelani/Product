#!/usr/bin/env node
/**
 * Generate Android + iOS launcher icons from src/assets/logo1.png
 * Usage: node scripts/generate-app-icons.js
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..');
const SOURCE = path.join(ROOT, 'src', 'assets', 'logo1.png');
const ANDROID_RES = path.join(ROOT, 'android', 'app', 'src', 'main', 'res');
const IOS_ICON_DIR = path.join(ROOT, 'ios', 'PalSafar', 'Images.xcassets', 'AppIcon.appiconset');

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

async function resizeIcon(size, outPath, transparent = false) {
  const bg = transparent 
    ? { r: 0, g: 0, b: 0, alpha: 0 }
    : { r: 248, g: 244, b: 236, alpha: 1 };

  await sharp(SOURCE)
    .resize(size, size, { fit: 'contain', background: bg })
    .png()
    .toFile(outPath);
}

async function resizeAdaptiveForeground(size, outPath) {
  // Adaptive icons safe zone is roughly 66/108 (61%). We pad it so the logo fits inside.
  const innerSize = Math.round(size * 0.6);
  const pad = Math.round((size - innerSize) / 2);
  
  await sharp(SOURCE)
    .resize(innerSize, innerSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .extend({
      top: pad, bottom: pad, left: pad, right: pad,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .resize(size, size) // Ensure exact target size
    .png()
    .toFile(outPath);
}

async function generateAndroid() {
  for (const [folder, size] of Object.entries(ANDROID_LAUNCHER)) {
    const dir = path.join(ANDROID_RES, folder);
    fs.mkdirSync(dir, { recursive: true });
    // Legacy icons: transparent background
    await resizeIcon(size, path.join(dir, 'ic_launcher.png'), true);
    // Round icons: we can use padded adaptive foreground style but with a cream background circle
    const pad = Math.round(size * 0.15); // Add some padding so it's not cropped by the circle
    const inner = size - pad * 2;
    await sharp(SOURCE)
      .resize(inner, inner, { fit: 'contain', background: { r: 248, g: 244, b: 236, alpha: 1 } })
      .extend({ top: pad, bottom: pad, left: pad, right: pad, background: { r: 248, g: 244, b: 236, alpha: 1 } })
      .png()
      .toFile(path.join(dir, 'ic_launcher_round.png'));
  }

  for (const [folder, size] of Object.entries(ANDROID_FOREGROUND)) {
    const dir = path.join(ANDROID_RES, folder);
    fs.mkdirSync(dir, { recursive: true });
    await resizeAdaptiveForeground(size, path.join(dir, 'ic_launcher_foreground.png'));
  }
}

async function generateIos() {
  fs.mkdirSync(IOS_ICON_DIR, { recursive: true });
  for (const icon of IOS_ICONS) {
    await resizeIcon(icon.size, path.join(IOS_ICON_DIR, icon.name));
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

async function main() {
  if (!fs.existsSync(SOURCE)) {
    console.error(`Source icon not found: ${SOURCE}`);
    process.exit(1);
  }

  console.log(`Generating app icons from ${SOURCE}`);
  await generateAndroid();
  await generateIos();
  console.log('Done — Android mipmaps + iOS AppIcon.appiconset updated.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
