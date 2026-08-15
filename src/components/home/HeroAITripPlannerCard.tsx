import React, { memo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  ActivityIndicator,
  ImageSourcePropType,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { PressableScale } from './PressableScale';
import {
  getLuxuryTheme,
  luxuryCardShadow,
  LuxuryRadii,
  LuxurySpacing,
  LuxuryTypography,
} from '../../design/luxuryTravel';

export type HeroPlannerState =
  | { kind: 'idle' }
  | { kind: 'generating'; progress: number; phase: string }
  | { kind: 'completed'; onDismiss: () => void }
  | { kind: 'activeTrip'; nextStopName: string; nextStopDistance: string; onResume: () => void }
  | {
      kind: 'itineraryReady';
      title: string;
      daysLabel: string;
      stopCount: number;
      progressPct: number;
      onView: () => void;
    };

type Props = {
  height: number;
  bannerSource: ImageSourcePropType;
  state: HeroPlannerState;
  onPlanTrip: () => void;
};

function HeroAITripPlannerCardComponent({ height, bannerSource, state, onPlanTrip }: Props) {
  const theme = getLuxuryTheme('light');

  const renderBody = () => {
    if (state.kind === 'generating') {
      return (
        <View style={styles.generating}>
          <ActivityIndicator color={theme.primaryBrown} />
          <Text style={[LuxuryTypography.headingHero, { color: theme.textPrimary, marginTop: 12 }]}>
            Planning your adventure...
          </Text>
          <Text style={[LuxuryTypography.caption, { color: theme.textSecondary, marginTop: 4 }]}>
            {state.phase}
          </Text>
          <View style={[styles.progressTrack, { backgroundColor: theme.divider }]}>
            <View
              style={[
                styles.progressFill,
                { width: `${state.progress}%`, backgroundColor: theme.primaryBrown },
              ]}
            />
          </View>
          <Text style={[LuxuryTypography.label, { color: theme.textSecondary, marginTop: 6 }]}>
            {state.progress}%
          </Text>
        </View>
      );
    }

    if (state.kind === 'completed') {
      return (
        <View style={styles.centered}>
          <Text style={{ fontSize: 32 }}>🎉</Text>
          <Text style={[LuxuryTypography.headingHero, { color: theme.textPrimary, marginTop: 8 }]}>
            Congratulations!
          </Text>
          <Text style={[LuxuryTypography.body, { color: theme.textSecondary, marginTop: 4 }]}>
            Trip completed · You earned 420 PalPoints
          </Text>
          <PressableScale onPress={state.onDismiss} style={[styles.cta, { backgroundColor: theme.primaryBrown }]}>
            <Text style={[LuxuryTypography.button, { color: theme.white }]}>Explore Again</Text>
          </PressableScale>
        </View>
      );
    }

    if (state.kind === 'activeTrip') {
      return (
        <>
          <Image source={bannerSource} style={styles.bannerImage} resizeMode="cover" />
          <LinearGradient
            colors={['rgba(248, 244, 236, 0.98)', 'rgba(248, 244, 236, 0.75)', 'rgba(248, 244, 236, 0)']}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFillObject}
          />
          <View style={styles.content}>
            <View style={styles.textCol}>
              <Text style={[LuxuryTypography.label, { color: theme.accentBrown }]}>CONTINUE JOURNEY</Text>
              <Text style={[LuxuryTypography.headingHero, { color: theme.textPrimary }]} numberOfLines={2}>
                Next: {state.nextStopName}
              </Text>
              <Text style={[LuxuryTypography.caption, { color: theme.textSecondary }]}>
                {state.nextStopDistance}
              </Text>
            </View>
            <PressableScale
              onPress={state.onResume}
              style={[styles.cta, { backgroundColor: theme.primaryBrown }]}
            >
              <Text style={[LuxuryTypography.button, { color: theme.white }]}>Resume →</Text>
            </PressableScale>
          </View>
        </>
      );
    }

    if (state.kind === 'itineraryReady') {
      return (
        <>
          <Image source={bannerSource} style={styles.bannerImage} resizeMode="cover" />
          <LinearGradient
            colors={['rgba(248, 244, 236, 0.98)', 'rgba(248, 244, 236, 0.8)', 'rgba(248, 244, 236, 0)']}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFillObject}
          />
          <View style={styles.content}>
            <View style={styles.textCol}>
              <Text style={[LuxuryTypography.label, { color: theme.accentBrown }]}>ITINERARY READY</Text>
              <Text style={[LuxuryTypography.headingHero, { color: theme.textPrimary }]} numberOfLines={1}>
                {state.title}
              </Text>
              <Text style={[LuxuryTypography.caption, { color: theme.textSecondary }]}>
                {state.daysLabel} · {state.stopCount} places
              </Text>
              <View style={[styles.progressTrack, styles.smallTrack, { backgroundColor: theme.divider }]}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${state.progressPct}%`, backgroundColor: theme.primaryBrown },
                  ]}
                />
              </View>
            </View>
            <PressableScale onPress={state.onView} style={[styles.cta, { backgroundColor: theme.primaryBrown }]}>
              <Text style={[LuxuryTypography.button, { color: theme.white }]}>View Itinerary →</Text>
            </PressableScale>
          </View>
        </>
      );
    }

    return (
      <>
        <Image source={bannerSource} style={styles.bannerImage} resizeMode="cover" />
        <LinearGradient
          colors={['rgba(248, 244, 236, 0.97)', 'rgba(248, 244, 236, 0.82)', 'rgba(248, 244, 236, 0.15)']}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 0.85, y: 0.5 }}
          style={StyleSheet.absoluteFillObject}
        />
        <View style={styles.content}>
          <View style={styles.textCol}>
            <Text style={[LuxuryTypography.headingHero, { color: theme.textPrimary }]}>
              ✨ AI Trip Planner
            </Text>
            <Text style={[LuxuryTypography.body, { color: theme.textSecondary, marginTop: 6, maxWidth: 220 }]}>
              Plan your perfect trip in just a few taps.
            </Text>
          </View>
          <PressableScale onPress={onPlanTrip} style={[styles.cta, { backgroundColor: theme.primaryBrown }]}>
            <Text style={[LuxuryTypography.button, { color: theme.white }]}>Plan My Trip →</Text>
          </PressableScale>
        </View>
      </>
    );
  };

  return (
    <Animated.View
      entering={FadeInDown.duration(520).springify().damping(18)}
      style={[styles.card, luxuryCardShadow(), { height }]}
    >
      {renderBody()}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: LuxurySpacing.screenHorizontal,
    marginBottom: 24,
    borderRadius: LuxuryRadii.card,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#ECE3D8',
  },
  bannerImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  content: {
    flex: 1,
    padding: 20,
    justifyContent: 'space-between',
  },
  textCol: {
    flex: 1,
    justifyContent: 'center',
    paddingRight: 12,
  },
  cta: {
    alignSelf: 'flex-start',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: LuxuryRadii.button,
    marginTop: 12,
  },
  generating: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#FBF7F0',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#FBF7F0',
  },
  progressTrack: {
    width: '78%',
    height: 6,
    borderRadius: 3,
    marginTop: 16,
    overflow: 'hidden',
  },
  smallTrack: {
    width: 140,
    marginTop: 10,
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
});

export const HeroAITripPlannerCard = memo(HeroAITripPlannerCardComponent);
