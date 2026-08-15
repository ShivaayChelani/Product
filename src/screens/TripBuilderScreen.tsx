import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBottomSafePadding } from '../design/responsive';
import Icon from 'react-native-vector-icons/Ionicons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useUserContext } from '../context/UserContext';
import { tripsApi, TripPlan } from '../services/api/trips';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  DRAFT_TRIP_ID_KEY,
  loadBestDraftTrip,
  loadDraftSnapshot,
  seedDraftTripCache,
} from '../utils/quickAddPlace';
import { normalizeTripPlan } from '../utils/normalizeTripPlan';
import { PressableScale } from '../components/home/PressableScale';
import { BT, SERIF, SANS_BOLD } from '../features/buildTrip/theme';
import { TripBuilderEmptyRoute } from '../features/buildTrip/components/TripBuilderEmptyRoute';
import { TripBuilderLoadedView } from '../features/buildTrip/components/TripBuilderLoadedView';
import { countAllStops } from '../features/buildTrip/utils/itineraryHelpers';
import { BottomNavigation } from '../components/navigation/BottomNavigation';

function applyTrip(trip: TripPlan): TripPlan {
  return normalizeTripPlan(trip);
}

export default function TripBuilderScreen({ tripId: routeTripId }: { tripId?: string }) {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const contentPadBottom = useBottomSafePadding(24);
  const { isGuest } = useUserContext();
  const [trip, setTrip] = useState<TripPlan | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingTrip, setLoadingTrip] = useState(Boolean(routeTripId));
  const serverFetchGen = useRef(0);

  useEffect(() => {
    if (isGuest || routeTripId) return;
    const gen = serverFetchGen.current;
    void loadDraftSnapshot()
      .then(snapshot => {
        if (serverFetchGen.current !== gen) return;
        if (snapshot) {
          setTrip(applyTrip(snapshot));
        }
      })
      .catch(() => {});
  }, [isGuest, routeTripId]);

  useFocusEffect(
    useCallback(() => {
      if (isGuest) return;
      let cancelled = false;

      const applyIfCurrent = (full: TripPlan) => {
        if (cancelled) return;
        serverFetchGen.current += 1;
        const applied = applyTrip(full);
        setTrip(applied);
        setLoadError(null);
        setLoadingTrip(false);
        if (applied.status === 'DRAFT') seedDraftTripCache(applied);
      };

      void (async () => {
        setLoadingTrip(true);
        setLoadError(null);

        const preferredId = routeTripId
          ? routeTripId
          : await AsyncStorage.getItem(DRAFT_TRIP_ID_KEY);

        if (preferredId) {
          try {
            const full = await tripsApi.getById(preferredId);
            applyIfCurrent(full);
            return;
          } catch (err: unknown) {
            if (routeTripId) {
              if (!cancelled) {
                setTrip(null);
                setLoadError(
                  (err as { message?: string })?.message || 'This trip is no longer available.',
                );
                setLoadingTrip(false);
              }
              return;
            }
            /* manual builder without tripId may fall through to latest draft */
          }
        }

        if (routeTripId) {
          if (!cancelled) {
            setTrip(null);
            setLoadError('This trip is no longer available.');
            setLoadingTrip(false);
          }
          return;
        }

        const best = await loadBestDraftTrip(undefined, { forceServer: true });
        if (best) {
          applyIfCurrent(best);
        } else if (!cancelled) {
          setLoadingTrip(false);
        }
      })();

      return () => {
        cancelled = true;
      };
    }, [isGuest, routeTripId]),
  );

  if (isGuest) {
    return (
      <View style={[styles.centered, { paddingTop: Math.max(insets.top, 16), paddingBottom: contentPadBottom }]}>
        <Icon name="lock-closed-outline" size={48} color={BT.textMuted} />
        <Text style={styles.emptyTitle}>Sign in required</Text>
        <PressableScale style={styles.primaryBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.primaryBtnText}>Go back</Text>
        </PressableScale>
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={[styles.centered, { paddingTop: Math.max(insets.top, 16), paddingBottom: contentPadBottom }]}>
        <Icon name="alert-circle-outline" size={48} color={BT.textMuted} />
        <Text style={styles.emptyTitle}>Trip unavailable</Text>
        <Text style={styles.errorBody}>{loadError}</Text>
        <PressableScale style={styles.primaryBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.primaryBtnText}>Go back</Text>
        </PressableScale>
      </View>
    );
  }

  if (loadingTrip && routeTripId && !trip) {
    return (
      <View style={[styles.centered, { paddingTop: Math.max(insets.top, 16), paddingBottom: contentPadBottom }]}>
        <Icon name="map-outline" size={48} color={BT.textMuted} />
        <Text style={styles.emptyTitle}>Loading trip…</Text>
      </View>
    );
  }

  const stopCount = trip ? countAllStops(trip) : 0;
  if (!trip || stopCount === 0) {
    return (
      <>
        <TripBuilderEmptyRoute trip={trip} onTripChange={setTrip} />
        <BottomNavigation activeTab="trips" />
      </>
    );
  }

  return (
    <>
      <TripBuilderLoadedView trip={trip} onTripChange={setTrip} />
      <BottomNavigation activeTab="trips" />
    </>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    backgroundColor: BT.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  emptyTitle: { fontFamily: SERIF, fontSize: 20, color: BT.text, marginTop: 12, textAlign: 'center' },
  errorBody: {
    fontFamily: SANS_BOLD,
    fontSize: 13,
    color: BT.textMuted,
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 20,
  },
  primaryBtn: {
    marginTop: 16,
    backgroundColor: BT.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 22,
  },
  primaryBtnText: { fontFamily: SANS_BOLD, color: '#FFF' },
});
