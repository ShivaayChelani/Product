import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  StatusBar,
  TouchableOpacity,
  ScrollView,
  Switch,
  Platform,
  Dimensions,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from '../utils/LinearGradient';
import { useUserContext } from '../context/UserContext';
import { apiClient } from '../services/api';
import { tripsApi, AiGenerateInput } from '../services/api/trips';
import { getCachedAiPlan, setCachedAiPlan } from '../features/aiTripPlanner/planCache';
import { API_CONFIG } from '../config/api';

const WIN = Dimensions.get('window');

const STATUS_TASKS = [
  { icon: 'diamond-outline', label: 'Finding hidden gems...' },
  { icon: 'partly-sunny-outline', label: 'Checking weather...' },
  { icon: 'heart-outline', label: 'Matching your interests...' },
  { icon: 'wallet-outline', label: 'Calculating budget...' },
  { icon: 'business-outline', label: 'Finding local experiences...' },
  { icon: 'git-network-outline', label: 'Optimizing route...' },
];

const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 2000;

type ScreenState = 'loading' | 'success' | 'error' | 'unauthenticated';

const COLORS = {
  cream: '#F5EFE6',
  creamPanel: '#EDE4D8',
  gold: '#C5A059',
  goldDark: '#A67C3D',
  brown: '#4B3621',
  brownDark: '#3E2723',
  text: '#2D1B0B',
  textSecondary: '#8B7355',
  textMuted: '#A89478',
  checkBg: '#5C4228',
  track: '#DDD2C4',
  card: '#FFFFFF',
};

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isAuthError(err: any): boolean {
  return err?.status === 401;
}

function isRetryableError(err: any): boolean {
  if (!err) return false;
  if (!err.status) return true;
  if (err.status === 408 || err.status === 429) return true;
  if (err.status >= 500) return true;
  const msg = String(err.message || '').toLowerCase();
  return msg.includes('timed out') || msg.includes('network') || msg.includes('abort');
}

function friendlyErrorMessage(err: any): {
  message: string;
  nearbyDestinations?: Array<{ city: string; state: string; placeCount: number }>;
} {
  const nearby = err?.details?.nearbyDestinations as
    | Array<{ city: string; state: string; placeCount: number }>
    | undefined;
  if (err?.message?.includes('timed out')) {
    return { message: 'That took too long. Check your connection and try again.', nearbyDestinations: nearby };
  }
  if (err?.status === 422) {
    return {
      message:
        err?.message || "We couldn't find enough places for this trip. Try another city or broaden your interests.",
      nearbyDestinations: nearby,
    };
  }
  if (err?.status === 400) {
    return { message: err?.message || 'Some of the trip details look invalid. Please review and try again.' };
  }
  if (err?.status === 429) {
    return { message: err?.message || 'Too many trip requests. Please wait a minute and try again.' };
  }
  if (err?.status && err.status >= 500) {
    const serverMsg = typeof err?.message === 'string' ? err.message.trim() : '';
    if (serverMsg && !/^internal server error$/i.test(serverMsg) && !/^request failed/i.test(serverMsg)) {
      return { message: serverMsg };
    }
    return { message: 'Trip servers needed a moment to wake up. Tap Try Again — the next attempt usually works.' };
  }
  if (!err?.status) {
    return { message: 'Network error. Check your connection and try again.' };
  }
  return { message: err?.message || 'Could not generate your trip. Please try again.' };
}

function cleanAiInput(input: AiGenerateInput): AiGenerateInput {
  const cleaned: Partial<AiGenerateInput> = {};
  for (const [key, value] of Object.entries(input) as [keyof AiGenerateInput, unknown][]) {
    if (value !== undefined && value !== null && value !== '') {
      (cleaned as Record<string, unknown>)[key] = value;
    }
  }
  return {
    destination: cleaned.destination ?? input.destination,
    days: cleaned.days ?? input.days,
    pace: cleaned.pace ?? 'BALANCED',
    travelers: cleaned.travelers ?? 'SOLO',
    budget: cleaned.budget ?? 'MEDIUM',
    interests: Array.isArray(cleaned.interests) ? cleaned.interests : [],
    avoid: Array.isArray(cleaned.avoid) ? cleaned.avoid : [],
    ...(cleaned.tripId !== undefined ? { tripId: cleaned.tripId } : {}),
    ...(cleaned.customBudgetAmount !== undefined ? { customBudgetAmount: cleaned.customBudgetAmount } : {}),
    ...(cleaned.timePreference !== undefined ? { timePreference: cleaned.timePreference } : {}),
    ...(cleaned.prompt !== undefined ? { prompt: cleaned.prompt } : {}),
    ...(cleaned.manualPlaceIds !== undefined ? { manualPlaceIds: cleaned.manualPlaceIds } : {}),
    ...(cleaned.fillWithAi !== undefined ? { fillWithAi: cleaned.fillWithAi } : {}),
    ...(cleaned.transportation !== undefined ? { transportation: cleaned.transportation } : {}),
    ...(cleaned.regenerateDayNumber !== undefined ? { regenerateDayNumber: cleaned.regenerateDayNumber } : {}),
    ...(cleaned.startDate !== undefined ? { startDate: cleaned.startDate } : {}),
  };
}

async function wakeTripServers(): Promise<void> {
  try {
    await apiClient.get(API_CONFIG.endpoints.health);
  } catch {
    /* ignore */
  }
}

function StatusTaskRow({
  icon,
  label,
  done,
  active,
}: {
  icon: string;
  label: string;
  done: boolean;
  active: boolean;
}) {
  const checked = done || active;
  return (
    <View style={styles.taskCard}>
      <View style={[styles.taskCheck, checked && styles.taskCheckDone]}>
        {checked ? <Icon name="checkmark" size={11} color="#FFF" /> : null}
      </View>
      <Icon name={icon} size={15} color={COLORS.gold} style={styles.taskIcon} />
      <Text style={[styles.taskLabel, (done || active) && styles.taskLabelActive]} numberOfLines={1}>
        {label}
      </Text>
      <Text style={styles.taskDots}>...</Text>
    </View>
  );
}

export default function GenerateLoadingScreen({ route: propRoute }: { navigation?: any; route?: any }) {
  const navigation = useNavigation<any>();
  const hookRoute = useRoute<any>();
  const insets = useSafeAreaInsets();
  const { isGuest } = useUserContext();
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [progressPct, setProgressPct] = useState(0);
  const [notifyEnabled, setNotifyEnabled] = useState(true);
  const [screenState, setScreenState] = useState<ScreenState>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [nearbySuggestions, setNearbySuggestions] = useState<
    Array<{ city: string; state: string; placeCount: number }>
  >([]);
  const cancelledRef = useRef(false);
  const phaseIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressListenerRef = useRef<string | null>(null);

  const progressAnim = useRef(new Animated.Value(0)).current;

  const params = useMemo(() => propRoute?.params || hookRoute?.params || {}, [propRoute?.params, hookRoute?.params]);

  const startPhaseAnimation = useCallback(() => {
    setPhaseIndex(0);
    setProgressPct(0);
    progressAnim.setValue(0);

    if (progressListenerRef.current) {
      progressAnim.removeListener(progressListenerRef.current);
    }
    progressListenerRef.current = progressAnim.addListener(({ value }) => {
      setProgressPct(Math.min(95, Math.round(value * 95)));
    });

    Animated.timing(progressAnim, {
      toValue: 1,
      duration: 90_000,
      useNativeDriver: false,
    }).start();

    if (phaseIntervalRef.current) clearInterval(phaseIntervalRef.current);
    phaseIntervalRef.current = setInterval(() => {
      setPhaseIndex(prev => {
        if (prev >= STATUS_TASKS.length - 1) {
          if (phaseIntervalRef.current) clearInterval(phaseIntervalRef.current);
          return prev;
        }
        return prev + 1;
      });
    }, 12_000);
  }, [progressAnim]);

  const runGeneration = useCallback(async () => {
    setScreenState('loading');
    setErrorMessage('');
    setNearbySuggestions([]);
    startPhaseAnimation();

    await apiClient.init();
    if (isGuest || !apiClient.getToken()) {
      setScreenState('unauthenticated');
      return;
    }

    const destination: string = params.destination || params.location;
    if (!destination) {
      setScreenState('error');
      setErrorMessage('No destination was provided. Please go back and choose a city.');
      return;
    }

    const input = cleanAiInput({
      destination,
      days: Number(params.days) || 3,
      pace: params.pace,
      travelers: params.travelers,
      budget: params.budget,
      customBudgetAmount: params.customBudgetAmount,
      interests: params.interests || [],
      timePreference: params.timePreference,
      avoid: params.avoid || [],
      prompt: params.prompt,
      tripId: params.tripId,
      manualPlaceIds: Array.isArray(params.manualPlaceIds) ? params.manualPlaceIds : undefined,
      fillWithAi: params.fillWithAi === true ? true : undefined,
      transportation: Array.isArray(params.transportation) ? params.transportation : undefined,
      regenerateDayNumber: params.regenerateDayNumber ? Number(params.regenerateDayNumber) : undefined,
    });

    const cached = await getCachedAiPlan(input);
    if (cached?.trip?.id) {
      setProgressPct(100);
      setScreenState('success');
      navigation.replace('TripDetail', {
        tripId: cached.trip.id,
        warnings: cached.warnings,
        note: cached.note,
      });
      return;
    }

    let lastError: any;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      if (cancelledRef.current) return;

      try {
        await wakeTripServers();
        if (attempt > 1) {
          await delay(RETRY_DELAY_MS * (attempt - 1));
        }

        const result = await tripsApi.aiGenerate(input);
        if (cancelledRef.current) return;
        await setCachedAiPlan(input, result);
        setProgressPct(100);
        setScreenState('success');
        navigation.replace('TripDetail', {
          tripId: result.trip.id,
          warnings: result.warnings,
          note: result.note,
        });
        return;
      } catch (err: any) {
        lastError = err;
        if (isAuthError(err)) {
          if (cancelledRef.current) return;
          setScreenState('unauthenticated');
          return;
        }
        if (!isRetryableError(err) || attempt === MAX_ATTEMPTS) {
          break;
        }
      }
    }

    if (cancelledRef.current) return;
    setScreenState('error');
    const friendly = friendlyErrorMessage(lastError);
    setErrorMessage(friendly.message);
    setNearbySuggestions(friendly.nearbyDestinations || []);
  }, [params, isGuest, navigation, startPhaseAnimation]);

  useEffect(() => {
    cancelledRef.current = false;
    runGeneration();

    return () => {
      cancelledRef.current = true;
      if (phaseIntervalRef.current) clearInterval(phaseIntervalRef.current);
      if (progressListenerRef.current) {
        progressAnim.removeListener(progressListenerRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  const handleRetry = () => {
    cancelledRef.current = false;
    runGeneration();
  };

  const handleSignIn = () => {
    navigation.goBack();
  };

  const renderLoadingBody = () => (
    <>
      <View style={styles.titleRow}>
        <Text style={styles.titleSparkle}>✦</Text>
        <Text style={styles.mainTitle}>
          Crafting Your <Text style={styles.mainTitleAccent}>Perfect Journey...</Text>
        </Text>
        <Text style={styles.titleSparkle}>✦</Text>
      </View>
      <Text style={styles.mainSubtitle}>Our AI is preparing something amazing for you</Text>

      <View style={styles.taskListOuter}>
        {STATUS_TASKS.map((task, index) => (
          <StatusTaskRow
            key={task.label}
            icon={task.icon}
            label={task.label}
            done={index < phaseIndex}
            active={index === phaseIndex}
          />
        ))}
      </View>

      <View style={styles.progressHeader}>
        <View style={styles.progressLine} />
        <Text style={styles.progressLabel}>Progress</Text>
        <View style={styles.progressLine} />
      </View>

      <View style={styles.progressRow}>
        <View style={styles.progressTrack}>
          <Animated.View style={[styles.progressFillWrap, { width: progressWidth }]}>
            <LinearGradient
              colors={['#4B3621', '#8B6914', '#C5A059']}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={styles.progressFill}
            />
          </Animated.View>
        </View>
        <Text style={styles.progressPct}>{progressPct}%</Text>
      </View>

      <View style={styles.notifyCard}>
        <View style={styles.notifyBellCircle}>
          <Icon name="notifications" size={16} color="#FFF" />
        </View>
        <View style={styles.notifyTextWrap}>
          <Text style={styles.notifyTitle}>Notify me when it's live</Text>
          <Text style={styles.notifySub}>Be the first explorer to unlock new adventures!</Text>
        </View>
        <Switch
          value={notifyEnabled}
          onValueChange={setNotifyEnabled}
          trackColor={{ false: '#D9CFC0', true: '#8B6914' }}
          thumbColor="#FFF"
          ios_backgroundColor="#D9CFC0"
        />
      </View>

      <TouchableOpacity
        style={styles.notifyBtn}
        activeOpacity={0.9}
        onPress={() => setNotifyEnabled(v => !v)}
      >
        <Icon name="notifications-outline" size={16} color="#FFF" />
        <Text style={styles.notifyBtnText}>NOTIFY ME</Text>
        <Text style={styles.notifyBtnSparkle}>✦</Text>
      </TouchableOpacity>
    </>
  );

  const renderErrorBody = () => (
    <>
      <View style={styles.errorIconWrap}>
        <Icon name="alert-circle-outline" size={48} color={COLORS.gold} />
      </View>
      <Text style={styles.mainTitle}>Couldn't Build Your Trip</Text>
      <Text style={styles.errorText}>{errorMessage}</Text>
      {nearbySuggestions.length > 0 && (
        <View style={styles.suggestWrap}>
          <Text style={styles.suggestHeading}>Try these verified destinations:</Text>
          {nearbySuggestions.map(s => (
            <TouchableOpacity
              key={`${s.city}-${s.state}`}
              style={styles.suggestBtn}
              onPress={() =>
                navigation.replace('GenerateLoading', {
                  ...params,
                  destination: s.state ? `${s.city}, ${s.state}` : s.city,
                })
              }
            >
              <Text style={styles.suggestBtnText}>
                {s.city}
                {s.state ? `, ${s.state}` : ''} · {s.placeCount} places
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      <TouchableOpacity style={styles.retryBtn} onPress={handleRetry} activeOpacity={0.85}>
        <Icon name="refresh" size={16} color="#FFF" />
        <Text style={styles.retryBtnText}>Try Again</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.backLink} onPress={() => navigation.goBack()} activeOpacity={0.85}>
        <Text style={styles.backLinkText}>Go Back</Text>
      </TouchableOpacity>
    </>
  );

  const renderUnauthBody = () => (
    <>
      <View style={styles.errorIconWrap}>
        <Icon name="lock-closed-outline" size={48} color={COLORS.gold} />
      </View>
      <Text style={styles.mainTitle}>Sign In Required</Text>
      <Text style={styles.errorText}>
        Sign in to generate and save your itinerary. Your trip will sync across devices once you're logged in.
      </Text>
      <TouchableOpacity style={styles.retryBtn} onPress={handleSignIn} activeOpacity={0.85}>
        <Text style={styles.retryBtnText}>Go Back to Sign In</Text>
      </TouchableOpacity>
    </>
  );

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.cream} translucent />

      <TouchableOpacity
        style={[styles.backBtn, { top: insets.top + 8 }]}
        onPress={() => navigation.goBack()}
        hitSlop={12}
      >
        <Icon name="chevron-back" size={18} color={COLORS.text} />
      </TouchableOpacity>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: insets.top + 56,
            paddingBottom: insets.bottom + 24,
            minHeight: WIN.height,
          },
        ]}
        showsVerticalScrollIndicator={false}
        bounces={false}
        overScrollMode="never"
      >
        {screenState === 'loading' && renderLoadingBody()}
        {screenState === 'error' && renderErrorBody()}
        {screenState === 'unauthenticated' && renderUnauthBody()}
      </ScrollView>
    </View>
  );
}

const serif = Platform.OS === 'ios' ? 'Georgia' : 'serif';

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.cream,
  },
  backBtn: {
    position: 'absolute',
    left: 16,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(232,223,208,0.95)',
    zIndex: 20,
  },
  scroll: {
    flex: 1,
    backgroundColor: COLORS.cream,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    backgroundColor: COLORS.cream,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 8,
    marginTop: 8,
    paddingHorizontal: 4,
  },
  titleSparkle: {
    fontSize: 10,
    color: COLORS.gold,
    marginTop: 2,
  },
  mainTitle: {
    flexShrink: 1,
    fontSize: 24,
    fontFamily: serif,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'center',
    lineHeight: 32,
  },
  mainTitleAccent: {
    color: COLORS.gold,
    fontStyle: 'italic',
  },
  mainSubtitle: {
    fontSize: 12,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 18,
  },
  taskListOuter: {
    backgroundColor: COLORS.creamPanel,
    borderRadius: 16,
    padding: 10,
    gap: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(221,210,196,0.85)',
  },
  taskCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 10,
    shadowColor: '#2D1B0B',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 1,
  },
  taskCheck: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: COLORS.track,
    backgroundColor: '#FFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  taskCheckDone: {
    backgroundColor: COLORS.checkBg,
    borderColor: COLORS.checkBg,
  },
  taskIcon: {
    marginRight: 8,
  },
  taskLabel: {
    flex: 1,
    fontSize: 12,
    color: COLORS.textMuted,
    fontWeight: '500',
  },
  taskLabelActive: {
    color: COLORS.text,
    fontWeight: '600',
  },
  taskDots: {
    fontSize: 14,
    color: COLORS.textMuted,
    fontWeight: '700',
    marginLeft: 4,
  },
  progressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 10,
  },
  progressLine: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.track,
  },
  progressLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.text,
    fontFamily: serif,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  progressTrack: {
    flex: 1,
    height: 12,
    borderRadius: 6,
    backgroundColor: COLORS.track,
    overflow: 'hidden',
  },
  progressFillWrap: {
    height: '100%',
  },
  progressFill: {
    flex: 1,
    height: '100%',
    borderRadius: 6,
  },
  progressPct: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.text,
    fontFamily: serif,
    minWidth: 42,
    textAlign: 'right',
  },
  notifyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.track,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 12,
    gap: 10,
    shadowColor: '#2D1B0B',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  notifyBellCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: COLORS.brown,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifyTextWrap: {
    flex: 1,
  },
  notifyTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.text,
  },
  notifySub: {
    fontSize: 9.5,
    color: COLORS.textMuted,
    marginTop: 2,
    lineHeight: 13,
  },
  notifyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.brownDark,
    borderRadius: 14,
    paddingVertical: 15,
    gap: 8,
    marginBottom: 4,
    shadowColor: '#2D1B0B',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 3,
  },
  notifyBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFF',
    letterSpacing: 1.2,
  },
  notifyBtnSparkle: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.85)',
  },
  errorIconWrap: {
    alignItems: 'center',
    marginBottom: 12,
    marginTop: 8,
  },
  errorText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  suggestWrap: {
    width: '100%',
    marginBottom: 16,
  },
  suggestHeading: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 8,
    textAlign: 'center',
  },
  suggestBtn: {
    backgroundColor: COLORS.card,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.track,
  },
  suggestBtnText: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.brownDark,
    paddingVertical: 14,
    borderRadius: 14,
    marginBottom: 10,
  },
  retryBtnText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '700',
  },
  backLink: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  backLinkText: {
    color: COLORS.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
});
