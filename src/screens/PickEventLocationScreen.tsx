/**
 * Map-based location picker for the Add Event form.
 *
 * Reuses the same Leaflet bundle as the main map, but generated with
 * `pickMode: true`: a fixed pin sits at the viewport centre, dragging the map
 * moves the point under it, tapping the map drops it there, and every camera
 * settle reports the centre coordinate back here as a `pickCenter` message.
 *
 * The result is handed to AddEvent through merged route params (serialisable)
 * rather than a callback, and the address/city/state are filled by reverse
 * geocoding — always editable afterwards, never required to succeed.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Geolocation from 'react-native-geolocation-service';
import { SafeWebView, type SafeWebViewRef } from '../components/SafeWebView';
import { generateLeafletHtml } from '../utils/leafletMapHtml';
import { EVENT_COLORS } from '../features/events/EventCard';
import { reverseGeocodeEventAddress } from '../services/location/reverseGeocodeAddress';
import { isValidLatLng } from '../services/location/distance';
import type { PickedEventLocation, RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Props = RouteProp<RootStackParamList, 'PickEventLocation'>;

/** Built once: the map HTML is static and identical for every pick. */
const PICK_MAP_HTML = generateLeafletHtml({ pickMode: true });

const BOOT_JS =
  '(function(){try{window.ReactNativeWebView.postMessage(JSON.stringify({type:"mapReady"}));}catch(e){}true;})();';

const INITIAL_ZOOM = 15;
const GEOCODE_DEBOUNCE_MS = 700;

type Center = { latitude: number; longitude: number };

type MapMessage =
  | { type: 'pickCenter'; lat?: number; lng?: number; zoom?: number }
  | { type: 'mapReady' }
  | { type: 'mapError'; message?: string };

/** Same send pattern as MapScreen: postMessage, plus injectJavaScript for flights. */
function post(webRef: React.RefObject<SafeWebViewRef | null>, data: Record<string, unknown>) {
  webRef.current?.postMessage(JSON.stringify(data));
  if (data.type === 'flyTo' && typeof data.lat === 'number' && typeof data.lng === 'number') {
    const zoom = typeof data.zoom === 'number' ? data.zoom : INITIAL_ZOOM;
    webRef.current?.injectJavaScript(
      `(function(){try{if(window.__palMap)window.__palMap.flyTo(${data.lat},${data.lng},${zoom});}catch(e){}true;})();`,
    );
  }
}

export default function PickEventLocationScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Props>();
  const webRef = useRef<SafeWebViewRef>(null);

  const initial = useMemo<Center | null>(() => {
    const { latitude, longitude } = route.params ?? {};
    return isValidLatLng(latitude, longitude)
      ? { latitude: latitude as number, longitude: longitude as number }
      : null;
  }, [route.params]);

  const [center, setCenter] = useState<Center | null>(initial);
  const [ready, setReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [geocoding, setGeocoding] = useState(false);
  const [place, setPlace] = useState({ address: '', city: '', state: '' });

  const readyRef = useRef(false);
  /** Center reported before `mapReady` — the map's boot position. */
  const pendingCenterRef = useRef<Center | null>(null);

  const applyCenter = useCallback((next: Center) => {
    if (!isValidLatLng(next.latitude, next.longitude)) return;
    setCenter(next);
  }, []);

  const handleWebMessage = useCallback(
    (event: { nativeEvent: { data: string } }) => {
      let data: MapMessage | null;
      try {
        data = JSON.parse(event.nativeEvent.data) as MapMessage;
      } catch {
        return;
      }
      if (!data || typeof data.type !== 'string') return;

      if (data.type === 'mapReady') {
        readyRef.current = true;
        setReady(true);
        if (initial) {
          post(webRef, { type: 'flyTo', lat: initial.latitude, lng: initial.longitude, zoom: INITIAL_ZOOM });
        } else if (pendingCenterRef.current) {
          applyCenter(pendingCenterRef.current);
        }
        return;
      }

      if (data.type === 'mapError') {
        setMapError(data.message || 'The map could not load.');
        return;
      }

      if (data.type === 'pickCenter') {
        const next: Center = { latitude: Number(data.lat), longitude: Number(data.lng) };
        if (!readyRef.current) {
          pendingCenterRef.current = next;
          return;
        }
        applyCenter(next);
      }
    },
    [applyCenter, initial],
  );

  // Reverse geocode the settled point; debounced so a fling does not spam Nominatim.
  useEffect(() => {
    if (!center) return;
    let cancelled = false;
    setGeocoding(true);
    const timer = setTimeout(async () => {
      const resolved = await reverseGeocodeEventAddress(center.latitude, center.longitude);
      if (cancelled) return;
      setPlace(resolved);
      setGeocoding(false);
    }, GEOCODE_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [center]);

  const useMyLocation = useCallback(() => {
    Geolocation.getCurrentPosition(
      position => {
        const next = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
        if (!isValidLatLng(next.latitude, next.longitude)) return;
        post(webRef, { type: 'flyTo', lat: next.latitude, lng: next.longitude, zoom: 16 });
        applyCenter(next);
      },
      () => {
        Alert.alert('Location unavailable', 'Could not read your current location.');
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 },
    );
  }, [applyCenter]);

  const confirm = useCallback(() => {
    if (!center || !isValidLatLng(center.latitude, center.longitude)) {
      Alert.alert('Location required', 'Move the map so the pin sits on the event location.');
      return;
    }
    const picked: PickedEventLocation = {
      latitude: Number(center.latitude.toFixed(6)),
      longitude: Number(center.longitude.toFixed(6)),
      address: place.address.slice(0, 500),
      city: place.city.slice(0, 100),
      state: place.state.slice(0, 100),
      pickedAt: Date.now(),
    };
    navigation.popTo('AddEvent', { pickedLocation: picked, pickedNonce: picked.pickedAt });
  }, [center, navigation, place]);

  const summary = useMemo(() => {
    const area = [place.city, place.state].filter(Boolean).join(', ');
    if (place.address) return place.address;
    if (area) return area;
    if (center) return `${center.latitude.toFixed(5)}, ${center.longitude.toFixed(5)}`;
    return '';
  }, [center, place]);

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={styles.circleBtn}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          testID="pick-location-back"
        >
          <Icon name="chevron-back" size={20} color="#1D2420" />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle} accessibilityRole="header">
            Pick location
          </Text>
          <Text style={styles.headerSubtitle}>Drag the map under the pin</Text>
        </View>
      </View>

      <View style={styles.mapWrap}>
        <SafeWebView
          ref={webRef}
          source={{ html: PICK_MAP_HTML, baseUrl: 'about:blank' }}
          originWhitelist={['*']}
          onMessage={handleWebMessage}
          injectedJavaScript={BOOT_JS}
          javaScriptEnabled
          domStorageEnabled
          startInLoadingState
          renderLoading={() => (
            <View style={styles.mapLoading}>
              <ActivityIndicator color={EVENT_COLORS.accent} />
            </View>
          )}
          accessibilityLabel="Location picker map"
        />

        <Pressable
          onPress={useMyLocation}
          style={styles.gpsBtn}
          accessibilityRole="button"
          accessibilityLabel="Use my current location"
          accessibilityHint="Centres the map on your GPS position"
          testID="pick-location-gps"
        >
          <Icon name="locate" size={20} color={EVENT_COLORS.accent} />
        </Pressable>

        {mapError ? (
          <View style={styles.errorBanner}>
            <Icon name="warning-outline" size={15} color="#B45309" />
            <Text style={styles.errorBannerText}>{mapError}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.sheet}>
        <View style={styles.sheetHandle} />
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetLabel}>Event location</Text>
          {geocoding ? <ActivityIndicator size="small" color={EVENT_COLORS.accent} /> : null}
        </View>

        <Text style={styles.sheetAddress} numberOfLines={2} testID="pick-location-address">
          {summary || 'Move the map to set the event location'}
        </Text>

        {center ? (
          <Text style={styles.sheetCoords}>
            {center.latitude.toFixed(5)}, {center.longitude.toFixed(5)}
            {place.city ? ` · ${place.city}` : ''}
          </Text>
        ) : null}

        <Pressable
          onPress={confirm}
          disabled={!ready || !center}
          style={[styles.confirmBtn, (!ready || !center) && styles.confirmBtnDisabled]}
          accessibilityRole="button"
          accessibilityLabel="Confirm this location"
          accessibilityState={{ disabled: !ready || !center }}
          testID="pick-location-confirm"
        >
          <Icon name="checkmark" size={18} color="#FFFFFF" />
          <Text style={styles.confirmText}>Use this location</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFFFFF' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: EVENT_COLORS.border,
  },
  circleBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: EVENT_COLORS.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: { flex: 1 },
  headerTitle: { fontSize: 17, fontWeight: '800', color: EVENT_COLORS.text },
  headerSubtitle: { fontSize: 12, color: EVENT_COLORS.textSecondary, marginTop: 1 },
  mapWrap: { flex: 1, backgroundColor: '#ECECEC', overflow: 'hidden' },
  mapLoading: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: '#ECECEC' },
  gpsBtn: {
    position: 'absolute',
    right: 14,
    bottom: 14,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: EVENT_COLORS.accentBorder,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#1D2420',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  errorBanner: {
    position: 'absolute',
    top: 12,
    left: 14,
    right: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F8F0E1',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FDE68A',
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  errorBannerText: { flex: 1, fontSize: 12.5, color: '#92400E', fontWeight: '600' },
  sheet: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderTopWidth: 1,
    borderColor: EVENT_COLORS.border,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 16,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: EVENT_COLORS.border,
    marginBottom: 12,
  },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetLabel: { fontSize: 12.5, fontWeight: '800', color: EVENT_COLORS.textSecondary, letterSpacing: 0.4, textTransform: 'uppercase' },
  sheetAddress: { fontSize: 15.5, fontWeight: '700', color: EVENT_COLORS.text, marginTop: 6, lineHeight: 21 },
  sheetCoords: { fontSize: 12.5, color: EVENT_COLORS.textSecondary, marginTop: 4 },
  confirmBtn: {
    marginTop: 14,
    height: 50,
    borderRadius: 16,
    backgroundColor: EVENT_COLORS.accent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  confirmBtnDisabled: { opacity: 0.55 },
  confirmText: { color: '#FFFFFF', fontSize: 15.5, fontWeight: '800' },
});
