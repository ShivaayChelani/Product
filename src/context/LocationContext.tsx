import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode, useRef } from 'react';
import { Platform, Linking, PermissionsAndroid, AppState } from 'react-native';
import Geolocation from 'react-native-geolocation-service';
import { UserPosition } from '../types';
import { parseLatLng, describeUserPositionRejection } from '../services/location/distance';

const COARSE_LOCATION = 'android.permission.ACCESS_COARSE_LOCATION' as const;

/** TEMPORARY RMX3511 GPS investigation — never logs lat/lng. Filter logcat: PalSafarGPS */
function logGps(event: string, extra: Record<string, unknown> = {}) {
  console.warn(`[PalSafarGPS] ${event}`, extra);
}

async function androidPermissionState(): Promise<{ fine: boolean; coarse: boolean }> {
  if (Platform.OS !== 'android') return { fine: true, coarse: true };
  try {
    const [fine, coarse] = await Promise.all([
      PermissionsAndroid.check(FINE_LOCATION),
      PermissionsAndroid.check(COARSE_LOCATION),
    ]);
    return { fine, coarse };
  } catch {
    return { fine: false, coarse: false };
  }
}

interface LocationContextType {
  position: UserPosition | null;
  devMockPosition: UserPosition | null;
  effectivePosition: UserPosition | null;
  hasPermission: boolean;
  gpsEnabled: boolean;
  isTracking: boolean;
  setPosition: React.Dispatch<React.SetStateAction<UserPosition | null>>;
  setDevMockPosition: React.Dispatch<React.SetStateAction<UserPosition | null>>;
  requestPermission: () => Promise<boolean>;
  requestFreshPosition: () => Promise<UserPosition | null>;
  openLocationSettings: () => void;
}

const LocationContext = createContext<LocationContextType | null>(null);

const FINE_LOCATION = 'android.permission.ACCESS_FINE_LOCATION' as const;

export function LocationProvider({ children }: { children: ReactNode }) {
  const [position, setPosition] = useState<UserPosition | null>(null);
  const [devMockPosition, setDevMockPosition] = useState<UserPosition | null>(null);
  const [hasPermission, setHasPermission] = useState(false);
  const [gpsEnabled, setGpsEnabled] = useState(false);
  const [isTracking, setIsTracking] = useState(false);
  const watchIdRef = useRef<number | null>(null);
  const cancelledRef = useRef(false);
  const hasPermissionRef = useRef(false);
  const requestPromiseRef = useRef<Promise<boolean> | null>(null);

  useEffect(() => {
    hasPermissionRef.current = hasPermission;
  }, [hasPermission]);

  const stopTracking = useCallback(() => {
    cancelledRef.current = true;
    if (watchIdRef.current !== null) {
      if (Geolocation && typeof Geolocation.clearWatch === 'function') {
        Geolocation.clearWatch(watchIdRef.current);
      }
      watchIdRef.current = null;
    }
    setIsTracking(false);
  }, []);

  const applyPosition = useCallback((loc: {
    coords: { latitude: number; longitude: number; accuracy?: number | null };
    timestamp: number;
    mocked?: boolean;
  }, maxAccuracy = 800, source = 'unknown') => {
    if (cancelledRef.current) return;
    const acc = loc.coords.accuracy ?? 0;
    const ageMs = loc.timestamp != null ? Date.now() - loc.timestamp : null;
    const mocked = loc.mocked === true;
    const parsed = parseLatLng(loc.coords.latitude, loc.coords.longitude);
    if (!parsed) {
      logGps('apply_rejected', {
        source,
        reason: 'invalid_coords',
        accuracyM: acc,
        ageMs,
        maxAccuracyM: maxAccuracy,
        mocked,
        permission: hasPermissionRef.current,
      });
      return;
    }
    // Accept first fix generously so Home can load nearby places; refine later via watch
    if (acc > 0 && acc > maxAccuracy) {
      logGps('apply_rejected', {
        source,
        reason: 'coarse_accuracy',
        accuracyM: acc,
        ageMs,
        maxAccuracyM: maxAccuracy,
        mocked,
        permission: hasPermissionRef.current,
      });
      return;
    }
    logGps('apply_accepted', {
      source,
      reason: 'accepted',
      accuracyM: acc,
      ageMs,
      maxAccuracyM: maxAccuracy,
      mocked,
      permission: hasPermissionRef.current,
    });
    setPosition((prev) => {
      if (prev?.timestamp != null && loc.timestamp < prev.timestamp) return prev;
      return {
        latitude: parsed.latitude,
        longitude: parsed.longitude,
        accuracy: acc,
        timestamp: loc.timestamp,
      };
    });
    setGpsEnabled(true);
  }, []);

  const startTracking = useCallback(() => {
    if (watchIdRef.current !== null) return;
    cancelledRef.current = false;
    setIsTracking(true);

    logGps('start_tracking', {
      permission: hasPermissionRef.current,
      requestedAccuracy: 'enableHighAccuracy=true fused, fallback network',
      provider: Platform.OS === 'android' ? 'fused/network (react-native-geolocation-service)' : 'ios',
    });

    if (Geolocation && typeof Geolocation.getCurrentPosition === 'function') {
      Geolocation.getCurrentPosition(
        (loc) => applyPosition(loc, 1500, 'getCurrent_high'),
        (error) => {
          logGps('getCurrent_high_error', { code: error.code, message: error.message, permission: hasPermissionRef.current });
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
      );
      // Faster low-accuracy fallback if high accuracy is slow
      Geolocation.getCurrentPosition(
        (loc) => {
          if (!hasPermissionRef.current) return;
          const acc = loc.coords.accuracy ?? 0;
          const ageMs = loc.timestamp != null ? Date.now() - loc.timestamp : null;
          setPosition((prev) => {
            if (prev) return prev;
            const parsed = parseLatLng(loc.coords.latitude, loc.coords.longitude);
            if (!parsed) {
              logGps('apply_rejected', {
                source: 'getCurrent_low_fallback',
                reason: 'invalid_coords',
                accuracyM: acc,
                ageMs,
                mocked: loc.mocked === true,
                permission: hasPermissionRef.current,
              });
              return prev;
            }
            logGps('apply_accepted', {
              source: 'getCurrent_low_fallback',
              reason: 'accepted_uncapped_first_fix',
              accuracyM: acc,
              ageMs,
              mocked: loc.mocked === true,
              permission: hasPermissionRef.current,
            });
            return {
              latitude: parsed.latitude,
              longitude: parsed.longitude,
              accuracy: acc,
              timestamp: loc.timestamp,
            };
          });
          setGpsEnabled(true);
        },
        (error) => {
          logGps('getCurrent_low_error', { code: error.code, message: error.message, permission: hasPermissionRef.current });
        },
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 },
      );
    }

    if (Geolocation && typeof Geolocation.watchPosition === 'function') {
      // interval / fastestInterval are Android-only; omit on iOS.
      const watchOptions =
        Platform.OS === 'android'
          ? { enableHighAccuracy: true, distanceFilter: 15, interval: 5000, fastestInterval: 2000 }
          : { enableHighAccuracy: true, distanceFilter: 15 };
      watchIdRef.current = Geolocation.watchPosition(
        (loc) => applyPosition(loc, 500, 'watch_high'),
        (error) => {
          logGps('watch_error', { code: error.code, message: error.message, permission: hasPermissionRef.current });
          if (error.code === 2) setGpsEnabled(false);
        },
        watchOptions,
      );
    }
  }, [applyPosition]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextAppState => {
      if (nextAppState === 'active' && hasPermissionRef.current) {
        stopTracking();
        startTracking();
      }
    });
    return () => subscription.remove();
  }, [startTracking, stopTracking]);

  const requestPermissionAndroid = useCallback(async (): Promise<boolean> => {
    try {
      const already = await PermissionsAndroid.check(FINE_LOCATION);
      const perm = await androidPermissionState();
      logGps('permission_check', { ...perm, alreadyFine: already });
      if (already) {
        setHasPermission(true);
        hasPermissionRef.current = true;
        startTracking();
        return true;
      }

      const granted = await PermissionsAndroid.request(FINE_LOCATION, {
        title: 'Location Permission',
        message: 'PalSafar needs your location to show tourist places near you.',
        buttonPositive: 'Allow',
        buttonNegative: 'Deny',
        buttonNeutral: 'Ask Later',
      });
      const isGranted = granted === PermissionsAndroid.RESULTS.GRANTED;
      setHasPermission(isGranted);
      hasPermissionRef.current = isGranted;
      logGps('permission_request_result', { granted: isGranted, raw: granted, ...(await androidPermissionState()) });
      if (isGranted) startTracking();
      return isGranted;
    } catch (error) {
      setHasPermission(false);
      hasPermissionRef.current = false;
      return false;
    }
  }, [startTracking]);

  const requestPermissionIOS = useCallback(async (): Promise<boolean> => {
    try {
      if (Geolocation && typeof Geolocation.requestAuthorization === 'function') {
        const granted = await Geolocation.requestAuthorization('whenInUse');
        const isGranted = granted === 'granted';
        setHasPermission(isGranted);
        hasPermissionRef.current = isGranted;
        if (isGranted) startTracking();
        return isGranted;
      }
      return false;
    } catch (error) {
      setHasPermission(false);
      hasPermissionRef.current = false;
      return false;
    }
  }, [startTracking]);

  /** Shared promise so concurrent callers wait on one dialog instead of short-circuiting to false */
  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (hasPermissionRef.current) {
      startTracking();
      return true;
    }
    if (requestPromiseRef.current) return requestPromiseRef.current;

    requestPromiseRef.current = (async () => {
      try {
        if (Platform.OS === 'android') return await requestPermissionAndroid();
        return await requestPermissionIOS();
      } finally {
        requestPromiseRef.current = null;
      }
    })();

    return requestPromiseRef.current;
  }, [requestPermissionAndroid, requestPermissionIOS, startTracking]);

  const requestFreshPosition = useCallback((): Promise<UserPosition | null> => {
    return new Promise((resolve) => {
      if (!Geolocation || typeof Geolocation.getCurrentPosition !== 'function') {
        logGps('fresh_unavailable', { permission: hasPermissionRef.current });
        resolve(null);
        return;
      }
      logGps('fresh_requested', {
        permission: hasPermissionRef.current,
        requestedAccuracy: 'enableHighAccuracy=true',
        timeoutMs: 15000,
        maximumAgeMs: 0,
        provider: Platform.OS === 'android' ? 'fused' : 'ios',
      });
      Geolocation.getCurrentPosition(
        (loc) => {
          applyPosition(loc, 1500, 'fresh_navigate');
          const parsed = parseLatLng(loc.coords.latitude, loc.coords.longitude);
          const next = parsed
            ? {
                latitude: parsed.latitude,
                longitude: parsed.longitude,
                accuracy: loc.coords.accuracy ?? 0,
                timestamp: loc.timestamp,
              }
            : null;
          logGps('fresh_result', {
            ...describeUserPositionRejection(next, 500),
            mocked: loc.mocked === true,
            permission: hasPermissionRef.current,
          });
          resolve(next);
        },
        (error) => {
          logGps('fresh_error', { code: error.code, message: error.message, permission: hasPermissionRef.current });
          resolve(null);
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
      );
    });
  }, [applyPosition]);

  const openLocationSettings = useCallback(() => {
    if (Platform.OS === 'android') {
      Linking.sendIntent('android.settings.LOCATION_SOURCE_SETTINGS').catch(() => {
        Linking.openSettings();
      });
    } else {
      // App-Prefs URLs are fragile / rejected — use system Settings.
      Linking.openSettings();
    }
  }, []);

  // On mount: only CHECK existing permission — never prompt during Splash
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (Platform.OS === 'android') {
          const ok = await PermissionsAndroid.check(FINE_LOCATION);
          if (!cancelled && ok) {
            setHasPermission(true);
            hasPermissionRef.current = true;
            void androidPermissionState().then((perm) => logGps('mount_permission', perm));
            startTracking();
          } else if (!cancelled) {
            void androidPermissionState().then((perm) => logGps('mount_permission', { ...perm, tracking: false }));
          }
        } else if (Platform.OS === 'ios') {
          // Non-prompting status check via react-native-permissions (already a dependency).
          try {
            const { check, PERMISSIONS, RESULTS } = require('react-native-permissions');
            const status = await check(PERMISSIONS.IOS.LOCATION_WHEN_IN_USE);
            if (!cancelled && (status === RESULTS.GRANTED || status === RESULTS.LIMITED)) {
              setHasPermission(true);
              hasPermissionRef.current = true;
              startTracking();
            }
          } catch {
          }
        }
      } catch {
      }
    })();
    return () => {
      cancelled = true;
      cancelledRef.current = true;
      stopTracking();
    };
  }, [startTracking, stopTracking]);

  const effectivePosition = devMockPosition ?? position;

  return (
    <LocationContext.Provider value={{
      position, devMockPosition, effectivePosition,
      hasPermission, gpsEnabled, isTracking,
      setPosition, setDevMockPosition,
      requestPermission, requestFreshPosition, openLocationSettings,
    }}>
      {children}
    </LocationContext.Provider>
  );
}

export function useLocationContext(): LocationContextType {
  const ctx = useContext(LocationContext);
  if (!ctx) throw new Error('useLocationContext must be used within LocationProvider');
  return ctx;
}
