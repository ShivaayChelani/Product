import React, { useCallback, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { riddlesApi, type TreasureHunt, type DailyStatus } from '../services/api/riddles';
import { useLocationContext } from '../context/LocationContext';
import { useUserContext } from '../context/UserContext';
import { TH, SERIF, SANS, SANS_BOLD, SANS_SEMI } from '../features/treasureHunt/theme';
import { classifyTreasureHuntLoadError } from '../features/treasureHunt/treasureHuntErrors';
import { TreasureHuntGuestBlock } from '../components/ui/TreasureHuntGuestBlock';

export default function TreasureHuntLandingScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { effectivePosition, hasPermission, gpsEnabled, requestPermission, openLocationSettings } = useLocationContext();
  const { isAuthenticated, isGuest } = useUserContext();

  const [city, setCity] = useState<string | null>(null);
  const [hunt, setHunt] = useState<TreasureHunt | null>(null);
  const [dailyStatus, setDailyStatus] = useState<DailyStatus | null>(null);
  const [eligibleRiddleId, setEligibleRiddleId] = useState<string | null>(null);
  const [loadingHunt, setLoadingHunt] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestingPermission, setRequestingPermission] = useState(false);
  const loadingHuntRef = useRef(false);

  const loadHunt = useCallback(async () => {
    if (isGuest || !isAuthenticated) return;
    if (!hasPermission || !effectivePosition) return;
    if (loadingHuntRef.current) return;
    loadingHuntRef.current = true;
    setLoadingHunt(true);
    setError(null);
    try {
      const pos = effectivePosition;
      const res = await riddlesApi.getActiveForCurrentLocation(pos.latitude, pos.longitude);
      const cityName: string = res?.data?.city ?? null;
      const foundHunt: TreasureHunt | null = res?.data?.hunt ?? null;
      setCity(cityName);
      setHunt(foundHunt);

      if (foundHunt?.id) {
        try {
          const eligRes = await riddlesApi.getEligibleRiddle(foundHunt.id, pos.latitude, pos.longitude);
          const status: DailyStatus = eligRes?.data?.dailyStatus ?? 'NO_RIDDLES';
          setDailyStatus(status);
          setEligibleRiddleId(eligRes?.data?.eligibleRiddle?.id ?? null);
        } catch {
          // If eligible riddle check fails (e.g. hunt deleted mid-session), treat as no riddle
          setDailyStatus('NO_RIDDLES');
          setEligibleRiddleId(null);
        }
      } else {
        setDailyStatus(null);
        setEligibleRiddleId(null);
      }
    } catch (err: any) {
      setError(classifyTreasureHuntLoadError(err).message);
    } finally {
      setLoadingHunt(false);
      loadingHuntRef.current = false;
    }
  }, [hasPermission, effectivePosition, isGuest, isAuthenticated]);

  useFocusEffect(
    useCallback(() => {
      loadHunt();
    }, [loadHunt])
  );

  const handleEnableLocation = async () => {
    setRequestingPermission(true);
    try {
      await requestPermission();
    } finally {
      setRequestingPermission(false);
    }
  };

  const handleRetry = async () => {
    try {
      await requestPermission();
    } catch {
      // Location is optional on retry
    }
    loadHunt();
  };

  const handleStart = async () => {
    if (!hunt?.id || !eligibleRiddleId || starting) return;
    setStarting(true);
    try {
      navigation.navigate('TreasureHuntActive', {
        huntId: hunt.id,
        riddleId: eligibleRiddleId,
      });
    } finally {
      setStarting(false);
    }
  };

  const guest = isGuest || !isAuthenticated;

  // Derive UI state from dailyStatus
  const isAttemptedToday = dailyStatus === 'COMPLETED_TODAY' || dailyStatus === 'LOCKED_TODAY';
  const isAvailable = dailyStatus === 'AVAILABLE' && !!eligibleRiddleId;
  const noRiddles = !hunt || dailyStatus === 'NO_RIDDLES';

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 10) }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBtn}>
          <Icon name="chevron-back" size={26} color={TH.brown} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Treasure Hunt</Text>
        <View style={styles.headerBtn} />
      </View>

      {guest ? (
        <TreasureHuntGuestBlock />
      ) : (
        <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 40 }]} showsVerticalScrollIndicator={false}>
          {/* Location permission gate */}
          {!hasPermission ? (
            <View style={styles.centerCard}>
              <View style={styles.permissionIconWrap}>
                <Icon name="location-outline" size={44} color={TH.gold} />
              </View>
              <Text style={styles.permissionTitle}>Location Required</Text>
              <Text style={styles.permissionText}>
                Allow location access to play and unlock the treasure hunt for the city you're in.
              </Text>
              <TouchableOpacity
                style={styles.permissionBtn}
                onPress={handleEnableLocation}
                disabled={requestingPermission}
              >
                {requestingPermission ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Text style={styles.permissionBtnText}>Enable Location</Text>
                )}
              </TouchableOpacity>
              <Text style={styles.permissionHint}>We only use your location to detect which city has an active hunt for you.</Text>
            </View>
          ) : !effectivePosition ? (
            <View style={styles.centerCard}>
              {gpsEnabled ? (
                <>
                  <ActivityIndicator size="large" color={TH.brown} />
                  <Text style={styles.locatingText}>Detecting your location...</Text>
                </>
              ) : (
                <>
                  <View style={styles.permissionIconWrap}>
                    <Icon name="navigate-outline" size={44} color={TH.gold} />
                  </View>
                  <Text style={styles.permissionTitle}>GPS is Off</Text>
                  <Text style={styles.permissionText}>
                    Turn on location services (GPS) so we can find the city you're currently visiting.
                  </Text>
                  <TouchableOpacity style={styles.permissionBtn} onPress={openLocationSettings}>
                    <Text style={styles.permissionBtnText}>Enable GPS</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          ) : loadingHunt ? (
            <View style={styles.centerCard}>
              <ActivityIndicator size="large" color={TH.brown} />
              <Text style={styles.locatingText}>Finding treasure hunts near you...</Text>
            </View>
          ) : error ? (
            <View style={styles.centerCard}>
              <View style={styles.permissionIconWrap}>
                <Icon name="alert-circle-outline" size={44} color={TH.gold} />
              </View>
              <Text style={styles.permissionTitle}>Something went wrong</Text>
              <Text style={styles.permissionText}>{error}</Text>
              <TouchableOpacity style={styles.permissionBtn} onPress={handleRetry}>
                <Text style={styles.permissionBtnText}>Try Again</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              {/* Location pill */}
              <View style={styles.locationPill}>
                <View style={styles.liveDot} />
                <Text style={styles.locationPillText}>Location detected</Text>
                <Text style={styles.locationPillTextBold}>You're in {city || 'your city'}</Text>
              </View>

              {/* Hero */}
              <View style={styles.heroSection}>
                <Text style={styles.heroTitle}>Your Daily Hunt</Text>
                <Text style={styles.heroTagline}>Solve today's clue and earn 20 points.</Text>
              </View>

              {/* Feature pills */}
              <View style={styles.featuresRow}>
                <FeatureItem icon="extension-puzzle" title="Daily Challenge" desc="One riddle at a time" />
                <FeatureItem icon="trophy" title="Earn Points" desc="20 pts correct" />
                <FeatureItem icon="refresh-circle" title="Come Back" desc="New day, next riddle" />
              </View>

              {noRiddles ? (
                <View style={styles.noHuntCard}>
                  <View style={styles.noHuntIconWrap}>
                    <Icon name="map-outline" size={30} color={TH.gold} />
                  </View>
                  <Text style={styles.noHuntTitle}>No Treasure Hunts Here Yet</Text>
                  <Text style={styles.noHuntText}>
                    {city
                      ? `No active Treasure Hunt found in ${city} right now. Check back soon!`
                      : 'No active Treasure Hunt found in your city right now. Check back soon!'}
                  </Text>
                </View>
              ) : isAttemptedToday ? (
                <View style={styles.huntCard}>
                  <View style={styles.huntCardHeader}>
                    <View style={styles.huntIconWrap}>
                      <Icon name="checkmark-circle" size={22} color={TH.green} />
                    </View>
                    <View style={styles.huntCardHeaderText}>
                      <Text style={styles.huntTitle}>Today's Hunt Complete</Text>
                      <Text style={styles.huntMeta}>Come back tomorrow for your next riddle.</Text>
                    </View>
                  </View>
                  <View style={styles.completedRow}>
                    <Icon name="moon-outline" size={16} color={TH.textSecondary} />
                    <Text style={styles.completedText}>
                      {dailyStatus === 'COMPLETED_TODAY'
                        ? 'You answered correctly today. Well done!'
                        : "Today's attempt is used up. Try again tomorrow."}
                    </Text>
                  </View>
                </View>
              ) : isAvailable ? (
                <View style={styles.huntCard}>
                  <View style={styles.huntCardHeader}>
                    <View style={styles.huntIconWrap}>
                      <Icon name="sparkles" size={20} color={TH.gold} />
                    </View>
                    <View style={styles.huntCardHeaderText}>
                      <Text style={styles.huntTitle}>{hunt?.title ?? 'Daily Hunt'}</Text>
                      <Text style={styles.huntMeta}>+20 points for a correct answer</Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    style={styles.startBtn}
                    onPress={handleStart}
                    disabled={starting}
                  >
                    {starting ? (
                      <ActivityIndicator color="#FFF" />
                    ) : (
                      <>
                        <Text style={styles.startBtnText}>Start Today's Hunt</Text>
                        <Icon name="arrow-forward" size={20} color="#FFF" />
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              ) : null}
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

function FeatureItem({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <View style={styles.featureItem}>
      <View style={styles.featureIconWrap}>
        <Icon name={icon} size={22} color={TH.brown} />
      </View>
      <Text style={styles.featureTitle}>{title}</Text>
      <Text style={styles.featureDesc}>{desc}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: TH.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  headerBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontFamily: SANS_BOLD,
    fontSize: 18,
    color: TH.text,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  centerCard: {
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 48,
  },
  permissionIconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: TH.cream,
    borderWidth: 1,
    borderColor: TH.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  permissionTitle: {
    fontFamily: SERIF,
    fontSize: 24,
    color: TH.text,
    textAlign: 'center',
    marginBottom: 10,
  },
  permissionText: {
    fontFamily: SANS,
    fontSize: 14,
    color: TH.textSecondary,
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 24,
    paddingHorizontal: 8,
  },
  permissionHint: {
    fontFamily: SANS,
    fontSize: 11,
    color: TH.textMuted,
    textAlign: 'center',
    marginTop: 14,
    paddingHorizontal: 20,
    lineHeight: 16,
  },
  permissionBtn: {
    backgroundColor: TH.brown,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 28,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 200,
  },
  permissionBtnText: {
    fontFamily: SANS_BOLD,
    color: '#FFF',
    fontSize: 15,
  },
  locatingText: {
    fontFamily: SANS,
    fontSize: 14,
    color: TH.textSecondary,
    marginTop: 16,
  },
  locationPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: TH.card,
    borderWidth: 1,
    borderColor: TH.border,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    alignSelf: 'center',
    gap: 8,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: TH.greenBright,
  },
  locationPillText: {
    fontFamily: SANS,
    fontSize: 12,
    color: TH.textSecondary,
  },
  locationPillTextBold: {
    fontFamily: SANS_BOLD,
    fontSize: 12,
    color: TH.text,
  },
  heroSection: {
    alignItems: 'center',
    marginTop: 28,
    marginBottom: 26,
  },
  heroTitle: {
    fontFamily: SERIF,
    fontSize: 36,
    color: TH.text,
    textAlign: 'center',
    lineHeight: 44,
  },
  heroTagline: {
    fontFamily: SANS,
    fontSize: 13,
    color: TH.textSecondary,
    marginTop: 10,
    letterSpacing: 0.2,
  },
  featuresRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  featureItem: {
    alignItems: 'center',
    flex: 1,
    paddingHorizontal: 4,
  },
  featureIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: TH.cream,
    borderWidth: 1,
    borderColor: TH.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  featureTitle: {
    fontFamily: SANS_BOLD,
    fontSize: 11,
    color: TH.text,
    textAlign: 'center',
    marginBottom: 3,
  },
  featureDesc: {
    fontFamily: SANS,
    fontSize: 9,
    color: TH.textMuted,
    textAlign: 'center',
  },
  huntCard: {
    backgroundColor: TH.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: TH.border,
    padding: 18,
    ...TH.shadow,
  },
  huntCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  huntIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: TH.bg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  huntCardHeaderText: {
    marginLeft: 12,
    flex: 1,
  },
  huntTitle: {
    fontFamily: SANS_BOLD,
    fontSize: 16,
    color: TH.text,
  },
  huntMeta: {
    fontFamily: SANS,
    fontSize: 12,
    color: TH.textSecondary,
    marginTop: 2,
  },
  startBtn: {
    backgroundColor: TH.brown,
    borderRadius: 14,
    paddingVertical: 15,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    ...TH.shadow,
  },
  startBtnText: {
    fontFamily: SANS_BOLD,
    color: '#FFF',
    fontSize: 15,
    letterSpacing: 0.8,
  },
  completedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: TH.cream,
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 16,
    gap: 8,
  },
  completedText: {
    fontFamily: SANS_SEMI,
    fontSize: 12,
    color: TH.textSecondary,
    flex: 1,
  },
  noHuntCard: {
    backgroundColor: TH.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: TH.border,
    padding: 22,
    alignItems: 'center',
    ...TH.shadow,
  },
  noHuntIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: TH.bg,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  noHuntTitle: {
    fontFamily: SERIF,
    fontSize: 20,
    color: TH.text,
    marginBottom: 6,
    textAlign: 'center',
  },
  noHuntText: {
    fontFamily: SANS,
    fontSize: 13,
    color: TH.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
});
