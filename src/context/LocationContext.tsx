import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode, useRef } from 'react';
import { Platform, Linking, PermissionsAndroid, AppState } from 'react-native';
import Geolocation from 'react-native-geolocation-service';
import { UserPosition } from '../types';
import { parseLatLng } from '../services/location/distance';

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

  const applyPosition = useCallback((loc: { coords: { latitude: number; longitude: number; accuracy?: number | null }; timestamp: number }, maxAccuracy = 800) => {
    if (cancelledRef.current) return;
    const parsed = parseLatLng(loc.coords.latitude, loc.coords.longitude);
    if (!parsed) return;
    const acc = loc.coords.accuracy ?? 0;
    // Accept first fix generously so Home can load nearby places; refine later via watch
    if (acc > 0 && acc > maxAccuracy) return;
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

    if (Geolocation && typeof Geolocation.getCurrentPosition === 'function') {
      Geolocation.getCurrentPosition(
        (loc) => applyPosition(loc, 1500),
        () => {},
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
      );
      // Faster low-accuracy fallback if high accuracy is slow
      Geolocation.getCurrentPosition(
        (loc) => {
          if (!hasPermissionRef.current) return;
          setPosition((prev) => {
            if (prev) return prev;
            const parsed = parseLatLng(loc.coords.latitude, loc.coords.longitude);
            if (!parsed) return prev;
            return {
              latitude: parsed.latitude,
              longitude: parsed.longitude,
              accuracy: loc.coords.accuracy ?? 0,
              timestamp: loc.timestamp,
            };
          });
          setGpsEnabled(true);
        },
        () => {},
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
        (loc) => applyPosition(loc, 500),
        (error) => {
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
            startTracking();
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
      requestPermission, openLocationSettings,
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
