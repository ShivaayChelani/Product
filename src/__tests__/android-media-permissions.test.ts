import fs from 'fs';
import path from 'path';

const ROOT = path.join(__dirname, '../..');

function read(rel: string) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

describe('Android photo/video permissions', () => {
  it('does not declare broad media-library permissions in the app manifest', () => {
    const manifest = read('android/app/src/main/AndroidManifest.xml');

    expect(manifest).toMatch(
      /<uses-permission android:name="android\.permission\.READ_MEDIA_IMAGES" tools:node="remove"/,
    );
    expect(manifest).toMatch(
      /<uses-permission android:name="android\.permission\.READ_MEDIA_VIDEO" tools:node="remove"/,
    );
    expect(manifest).toMatch(
      /<uses-permission android:name="android\.permission\.READ_EXTERNAL_STORAGE" tools:node="remove"/,
    );
    expect(manifest).toMatch(
      /<uses-permission android:name="android\.permission\.WRITE_EXTERNAL_STORAGE" tools:node="remove"/,
    );

    expect(manifest).not.toMatch(
      /<uses-permission android:name="android\.permission\.READ_MEDIA_IMAGES"\s*\/>/,
    );
    expect(manifest).not.toMatch(
      /<uses-permission android:name="android\.permission\.READ_MEDIA_VIDEO"\s*\/>/,
    );
  });

  it('keeps camera for vendor reel capture and Photo Picker backport metadata', () => {
    const manifest = read('android/app/src/main/AndroidManifest.xml');
    expect(manifest).toMatch(/android\.permission\.CAMERA/);
    expect(manifest).toMatch(/photopicker_activity:0:required/);
  });

  it('Create Reel gallery pick uses image-picker library (Android Photo Picker)', () => {
    const reel = read('src/screens/CreateReelScreen.tsx');
    expect(reel).toMatch(/from 'react-native-image-picker'/);
    expect(reel).toMatch(/launchImageLibrary\(/);
    expect(reel).toMatch(/mediaType: 'mixed'/);
    expect(reel).not.toMatch(/READ_MEDIA_IMAGES/);
    expect(reel).not.toMatch(/READ_MEDIA_VIDEO/);
    expect(reel).not.toMatch(/PermissionsAndroid/);
  });

  it('react-native-image-picker launches PickVisualMedia, not a storage-permission gallery', () => {
    const impl = read(
      'node_modules/react-native-image-picker/android/src/main/java/com/imagepicker/ImagePickerModuleImpl.java',
    );
    expect(impl).toMatch(/PickVisualMedia/);
    expect(impl).toMatch(/PickVisualMediaRequest/);
    expect(impl).not.toMatch(/READ_MEDIA_IMAGES/);
    expect(impl).not.toMatch(/READ_MEDIA_VIDEO/);

    const libManifest = read(
      'node_modules/react-native-image-picker/android/src/main/AndroidManifest.xml',
    );
    expect(libManifest).not.toMatch(/READ_MEDIA_IMAGES/);
    expect(libManifest).not.toMatch(/READ_MEDIA_VIDEO/);
  });
});
