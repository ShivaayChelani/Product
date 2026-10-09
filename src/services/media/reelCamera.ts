/**
 * Reel capture helper.
 *
 * `react-native-image-picker.launchCamera` does NOT request the Android CAMERA
 * runtime permission for us. Without it the library's
 * `isCameraPermissionFulfilled` returns false and it resolves an error map with
 * no `assets`, which reads as "nothing happened" in the reel screens. It also
 * falls back to a still-photo capture when `mediaType: 'mixed'`, so a "record a
 * reel" tap opened the photo camera instead of the video camera.
 *
 * This module owns both problems in one place: ask for CAMERA first (Android
 * only — iOS prompts natively), then launch the camera in the requested media
 * mode and normalise the result so the screens never have to guess.
 */
import { Alert, Linking, PermissionsAndroid, Platform } from 'react-native';
import { launchCamera, type CameraOptions } from 'react-native-image-picker';

export type ReelMediaType = 'video' | 'photo';

export type ReelCaptureResult =
  | { status: 'captured'; uri: string; type: string | null; fileName: string | null }
  | { status: 'cancelled' }
  | { status: 'permission-denied' }
  | { status: 'error'; message: string };

const PERMISSION_RATIONALE = {
  title: 'Camera permission',
  message: 'PalSafar needs camera access to record your Moment.',
  buttonPositive: 'Allow',
  buttonNegative: 'Cancel',
} as const;

async function ensureCameraPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  const granted = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.CAMERA,
    PERMISSION_RATIONALE,
  );
  return granted === PermissionsAndroid.RESULTS.GRANTED;
}

/**
 * Opens the device camera in `mediaType` mode.
 *
 * On a denied permission it shows an actionable alert (with a shortcut to the
 * system settings) and returns `permission-denied`. The caller only needs to
 * branch on `captured`; every other status is already user-visible.
 */
export async function captureReelMedia(
  mediaType: ReelMediaType = 'video',
): Promise<ReelCaptureResult> {
  const permitted = await ensureCameraPermission();
  if (!permitted) {
    Alert.alert(
      'Camera permission needed',
      'Enable camera access in Settings to record a Moment.',
      [
        { text: 'Not now', style: 'cancel' },
        { text: 'Open settings', onPress: () => void Linking.openSettings() },
      ],
    );
    return { status: 'permission-denied' };
  }

  const options: CameraOptions = {
    mediaType,
    cameraType: 'back',
    ...(mediaType === 'video' ? { durationLimit: 60, videoQuality: 'high' as const } : {}),
  };

  const result = await launchCamera(options);

  if (result.didCancel) return { status: 'cancelled' };
  if (result.errorCode === 'camera_unavailable') {
    return { status: 'error', message: 'The camera is not available on this device.' };
  }
  if (result.errorCode === 'permission') {
    return { status: 'permission-denied' };
  }
  if (result.errorCode) {
    return { status: 'error', message: result.errorMessage || 'Could not open the camera.' };
  }

  const asset = result.assets?.[0];
  if (!asset?.uri) return { status: 'error', message: 'No media was captured.' };

  return {
    status: 'captured',
    uri: asset.uri,
    type: asset.type ?? null,
    fileName: asset.fileName ?? null,
  };
}
