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
  const { huntId, rewardCoins, completed, city } = route.params;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 40 }]}>
        <Animated.View entering={ZoomIn.duration(700).springify()}>
          <View style={styles.heroCircle}>
            <Text style={styles.heroEmoji}>🎉</Text>
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(250).duration(600)} style={styles.textBlock}>
          <Text style={styles.title}>TREASURE FOUND!</Text>
          <Text style={styles.bigTitle}>🎉 Congratulations!</Text>
          <Text style={styles.subtitle}>
            You completed the {city || 'city'} Treasure Hunt. Every clue cracked, every riddle solved!
          </Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(450).duration(600)} style={styles.rewardCard}>
          <Text style={styles.rewardLabel}>Hunt Rewards</Text>
          <View style={styles.rewardRow}>
            <Icon name="logo-bitcoin" size={30} color={TH.gold} />
            <Text style={styles.rewardAmount}>+{rewardCoins || 0} Coins</Text>
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(600).duration(600)} style={styles.badgeRow}>
          <View style={styles.badgeChip}>
            <Text style={styles.badgeEmoji}>🏆</Text>
            <Text style={styles.badgeText}>Treasure Hunter Badge</Text>
          </View>
        </Animated.View>

        <View style={styles.spacer} />

        <Animated.View entering={FadeInDown.delay(750).duration(600)} style={styles.buttonContainer}>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => navigation.navigate('TreasureHuntLanding')}
          >
            <Text style={styles.primaryBtnText}>Back to Treasure Hunts</Text>
            <Icon name="arrow-back" size={18} color="#FFF" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => navigation.navigate('MainTabs', { screen: 'Home' })}
          >
            <Text style={styles.secondaryBtnText}>Explore More in {city || 'Your City'}</Text>
            <Icon name="compass-outline" size={18} color={TH.brown} />
          </TouchableOpacity>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: TH.bg,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  heroCircle: {
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: TH.card,
    borderWidth: 1,
    borderColor: TH.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 32,
    ...TH.shadow,
  },
  heroEmoji: {
    fontSize: 70,
  },
  textBlock: {
    alignItems: 'center',
    width: '100%',
  },
  title: {
    fontFamily: SERIF,
    fontSize: 18,
    color: TH.gold,
    textAlign: 'center',
    letterSpacing: 1.2,
    marginBottom: 10,
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
    fontSize: 14,
    color: TH.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 8,
  },
  rewardCard: {
    marginTop: 32,
    backgroundColor: TH.card,
    borderWidth: 1,
    borderColor: TH.border,
    borderRadius: 18,
    paddingVertical: 16,
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
    marginBottom: 6,
  },
  rewardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  rewardAmount: {
    fontFamily: SANS_BOLD,
    fontSize: 30,
    color: TH.text,
  },
  badgeRow: {
    marginTop: 20,
  },
  badgeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: TH.cream,
    borderWidth: 1,
    borderColor: TH.border,
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
  badgeEmoji: {
    fontSize: 16,
  },
  badgeText: {
    fontFamily: SANS_BOLD,
    fontSize: 13,
    color: TH.brown,
  },
  spacer: {
    flex: 1,
    minHeight: 24,
  },
  buttonContainer: {
    width: '100%',
    marginTop: 24,
  },
  primaryBtn: {
    backgroundColor: TH.brown,
    borderRadius: 16,
    paddingVertical: 17,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
    ...TH.shadow,
  },
  primaryBtnText: {
    fontFamily: SANS_BOLD,
    color: '#FFF',
    fontSize: 15,
  },
  secondaryBtn: {
    backgroundColor: TH.card,
    borderWidth: 1,
    borderColor: TH.border,
    borderRadius: 16,
    paddingVertical: 15,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
  },
  secondaryBtnText: {
    fontFamily: SANS_SEMI,
    color: TH.brown,
    fontSize: 14,
  },
});