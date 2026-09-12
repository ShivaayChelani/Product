/**
 * TreasureHuntSuccessScreen — Daily Result Screen
 *
 * Shown after the user submits their answer (correct or wrong).
 * The riddle is now locked for the rest of today regardless of outcome.
 *
 * correct=true:  "+20 Points — Come back tomorrow for another riddle."
 * correct=false: "0 Points   — Come back tomorrow to try again."
 *
 * IMPORTANT:
 *  - Does NOT reveal the correct answer.
 *  - Does NOT show a "Next Riddle" button.
 *  - Does NOT show a completion bonus.
 *  - Only shows "Back to Treasure Hunt".
 */
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import { useNavigation, useRoute } from '@react-navigation/native';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';
import { TH, SERIF, SANS, SANS_BOLD, SANS_SEMI } from '../features/treasureHunt/theme';

export default function TreasureHuntSuccessScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();

  // Defensive param extraction
  const correct: boolean = route?.params?.correct === true;
  const rewardCoins: number =
    typeof route?.params?.rewardCoins === 'number' ? route.params.rewardCoins : correct ? 20 : 0;

  const handleBack = () => {
    // Always navigate back to landing — never show a "next riddle" button
    navigation.navigate('TreasureHuntLanding');
  };

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 40 },
        ]}
      >
        {/* Hero icon */}
        <Animated.View entering={ZoomIn.duration(700).springify()}>
          <View style={[styles.heroCircle, correct ? styles.heroCircleCorrect : styles.heroCircleWrong]}>
            <Text style={styles.heroEmoji}>{correct ? '✨' : '😔'}</Text>
          </View>
        </Animated.View>

        {/* Title block */}
        <Animated.View entering={FadeInDown.delay(250).duration(600)} style={styles.textBlock}>
          <Text style={styles.title}>{correct ? 'CORRECT!' : 'NOT QUITE!'}</Text>
          <Text style={styles.bigTitle}>
            {correct ? 'Well done!' : 'Better luck next time'}
          </Text>
          <Text style={styles.subtitle}>
            {correct
              ? 'Come back tomorrow for another riddle.'
              : 'Come back tomorrow to try again.'}
          </Text>
        </Animated.View>

        {/* Points card */}
        <Animated.View entering={FadeInDown.delay(450).duration(600)} style={styles.rewardCard}>
          <Text style={styles.rewardLabel}>Today's Result</Text>
          <View style={styles.rewardRow}>
            <Icon
              name={correct ? 'star' : 'star-outline'}
              size={30}
              color={correct ? TH.gold : TH.textMuted}
            />
            <Text style={[styles.rewardAmount, !correct && styles.rewardAmountZero]}>
              {correct ? `+${rewardCoins}` : '0'} Points
            </Text>
          </View>
          {correct && (
            <Text style={styles.rewardNote}>Coins added to your wallet.</Text>
          )}
        </Animated.View>

        {/* Info note */}
        <Animated.View entering={FadeInDown.delay(580).duration(600)} style={styles.infoCard}>
          <Icon name="moon-outline" size={16} color={TH.textSecondary} />
          <Text style={styles.infoText}>
            {correct
              ? "Your next riddle will be available tomorrow."
              : "The same riddle will be available for you again tomorrow."}
          </Text>
        </Animated.View>

        <View style={styles.spacer} />

        {/* Back to Treasure Hunt — the ONLY action button */}
        <Animated.View entering={FadeInDown.delay(700).duration(600)} style={styles.buttonContainer}>
          <TouchableOpacity style={styles.primaryBtn} onPress={handleBack}>
            <Icon name="arrow-back" size={18} color="#FFF" />
            <Text style={styles.primaryBtnText}>Back to Treasure Hunt</Text>
          </TouchableOpacity>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: TH.bg },
  content: { flexGrow: 1, paddingHorizontal: 24, alignItems: 'center' },
  heroCircle: {
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: TH.card,
    borderWidth: 1,
    borderColor: TH.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 32,
    ...TH.shadow,
  },
  heroCircleCorrect: { borderColor: TH.gold },
  heroCircleWrong: { borderColor: TH.border },
  heroEmoji: { fontSize: 60 },
  textBlock: { alignItems: 'center', width: '100%' },
  title: {
    fontFamily: SANS_BOLD,
    fontSize: 13,
    color: TH.textSecondary,
    textAlign: 'center',
    letterSpacing: 2,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  bigTitle: {
    fontFamily: SERIF,
    fontSize: 30,
    color: TH.text,
    textAlign: 'center',
    lineHeight: 38,
    marginBottom: 10,
  },
  subtitle: {
    fontFamily: SANS,
    fontSize: 15,
    color: TH.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 8,
  },
  rewardCard: {
    marginTop: 28,
    backgroundColor: TH.card,
    borderWidth: 1,
    borderColor: TH.border,
    borderRadius: 18,
    paddingVertical: 18,
    paddingHorizontal: 26,
    alignItems: 'center',
    width: '100%',
    ...TH.shadow,
  },
  rewardLabel: {
    fontFamily: SANS_BOLD,
    fontSize: 11,
    color: TH.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  rewardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  rewardAmount: {
    fontFamily: SANS_BOLD,
    fontSize: 32,
    color: TH.text,
  },
  rewardAmountZero: {
    color: TH.textMuted,
  },
  rewardNote: {
    fontFamily: SANS,
    fontSize: 12,
    color: TH.textSecondary,
    marginTop: 6,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 18,
    backgroundColor: TH.cream,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    width: '100%',
  },
  infoText: {
    fontFamily: SANS,
    fontSize: 12,
    color: TH.textSecondary,
    flex: 1,
    lineHeight: 18,
  },
  spacer: { flex: 1, minHeight: 24 },
  buttonContainer: { width: '100%', marginTop: 24 },
  primaryBtn: {
    backgroundColor: TH.brown,
    borderRadius: 16,
    paddingVertical: 17,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    ...TH.shadow,
  },
  primaryBtnText: { fontFamily: SANS_BOLD, color: '#FFF', fontSize: 15 },
});
