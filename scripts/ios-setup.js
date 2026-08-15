#!/usr/bin/env node
/**
 * PalSafar iOS setup helper (run on macOS with Xcode + CocoaPods).
 *
 * Usage: npm run ios:setup
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const iosDir = path.join(root, 'ios');
const plistExample = path.join(iosDir, 'PalSafar', 'GoogleService-Info.plist.example');
const plistDest = path.join(iosDir, 'PalSafar', 'GoogleService-Info.plist');
const workspace = path.join(iosDir, 'PalSafar.xcworkspace');

function run(cmd, opts = {}) {
  console.log(`\n> ${cmd}`);
  execSync(cmd, { stdio: 'inherit', cwd: opts.cwd || root, shell: true });
}

function main() {
  if (process.platform !== 'darwin') {
    console.log('iOS native builds require macOS + Xcode.');
    console.log('On this machine the ios/ project is prepared; run `npm run ios:setup` on a Mac.');
    console.log('\nChecklist before Mac setup:');
    console.log('  1. Copy Firebase iOS plist → ios/PalSafar/GoogleService-Info.plist');
    console.log('  2. Set DEVELOPMENT_TEAM in Xcode (Signing & Capabilities)');
    console.log('  3. Enable Push Notifications capability (entitlements already present)');
    console.log('  4. Upload APNs .p8 key to Firebase Console');
    console.log('  5. Fill sentry.properties auth.token for dSYM upload');
    console.log('  6. Podfile forces Legacy Architecture (matches Android newArchEnabled=false)');
    console.log('\nAfter Mac setup:');
    console.log('  open ios/PalSafar.xcworkspace');
    console.log('  npx react-native run-ios');
    process.exit(0);
  }

  if (!fs.existsSync(plistDest)) {
    if (fs.existsSync(plistExample)) {
      console.warn('WARNING: GoogleService-Info.plist missing.');
      console.warn(`  Add the real file from Firebase Console (see ${plistExample}).`);
      console.warn('  Continuing with pod install — Firebase features will be inactive until plist is added.');
    }
  }

  try {
    run('bundle install');
  } catch {
    console.warn('bundle install failed — ensure Ruby + Bundler are installed.');
  }

  run('bundle exec pod install', { cwd: iosDir });

  if (!fs.existsSync(workspace)) {
    console.error('ERROR: PalSafar.xcworkspace was not created. pod install likely failed.');
    process.exit(1);
  }

  try {
    run('npx react-native-asset');
  } catch {
    console.warn('react-native-asset skipped (optional custom font linking).');
  }

  console.log('\nDone. Next:');
  console.log('  open ios/PalSafar.xcworkspace');
  console.log('  npm run ios');
}

main();
