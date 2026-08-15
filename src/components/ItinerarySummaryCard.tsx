import React, { useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import Pal from '../design/DesignSystem';
import { Ionicons, MaterialIcons } from '../utils/Icons';

interface ItinerarySummaryCardProps {
  totalSpots: number;
  totalDuration: number;
  estimatedCost: number;
  totalPoints: number;
  completedCount: number;
  pace: 'relaxed' | 'moderate' | 'fast';
  onPaceChange: (pace: 'relaxed' | 'moderate' | 'fast') => void;
}

const C = Pal.colors.light;

const PACE_OPTIONS: { key: 'relaxed' | 'moderate' | 'fast'; label: string; icon: string }[] = [
  { key: 'relaxed', label: 'Relaxed', icon: '\uD83D\uDC22' },
  { key: 'moderate', label: 'Moderate', icon: '\uD83D\uDEB6' },
  { key: 'fast', label: 'Fast', icon: '\uD83C\uDFC3' },
];

export default function ItinerarySummaryCard({
  totalSpots,
  totalDuration,
  estimatedCost,
  totalPoints,
  completedCount,
  pace,
  onPaceChange,
}: ItinerarySummaryCardProps) {
  const hours = Math.floor(totalDuration / 60);
  const mins = totalDuration % 60;
  const durationStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  const progress = totalSpots > 0 ? completedCount / totalSpots : 0;

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 1, friction: 8, tension: 40, useNativeDriver: true }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  const translateY = slideAnim.interpolate({ inputRange: [0, 1], outputRange: [30, 0] });

  return (
    <Animated.View style={[styles.card, { opacity: fadeAnim, transform: [{ translateY }] }]}>
      <View style={styles.gradientTop}>
        <View style={styles.gradientAccent1} />
        <View style={styles.gradientAccent2} />
      </View>

      <View style={styles.cardContent}>
        <View style={styles.titleRow}>
          <View style={styles.titleIconWrap}>
            <Ionicons name="compass" size={16} color="#fff" />
          </View>
          <Text style={styles.title}>Trip Overview</Text>
          <View style={styles.titleGlow} />
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <View style={[styles.statIconWrap, { backgroundColor: '#EFF6FF' }]}>
              <MaterialIcons name="place" size={20} color={C.primary} />
            </View>
            <Text style={styles.statValue}>{totalSpots}</Text>
            <Text style={styles.statLabel}>Places</Text>
          </View>

          <View style={styles.statDivider} />

          <View style={styles.statItem}>
            <View style={[styles.statIconWrap, { backgroundColor: '#F0FDF4' }]}>
              <Ionicons name="time-outline" size={20} color={C.success} />
            </View>
            <Text style={styles.statValue}>{durationStr}</Text>
            <Text style={styles.statLabel}>Duration</Text>
          </View>

          <View style={styles.statDivider} />

          <View style={styles.statItem}>
            <View style={[styles.statIconWrap, { backgroundColor: '#FEFCE8' }]}>
              <Ionicons name="wallet-outline" size={20} color={C.primary} />
            </View>
            <Text style={styles.statValue}>₹{estimatedCost}</Text>
            <Text style={styles.statLabel}>Budget</Text>
          </View>

          <View style={styles.statDivider} />

          <View style={styles.statItem}>
            <View style={[styles.statIconWrap, { backgroundColor: '#FEF2F2' }]}>
              <Ionicons name="trophy-outline" size={20} color="#EF4444" />
            </View>
            <Text style={styles.statValue}>{totalPoints}</Text>
            <Text style={styles.statLabel}>Points</Text>
          </View>
        </View>

        {completedCount > 0 && (
          <View style={styles.progressContainer}>
            <View style={styles.progressHeader}>
              <Ionicons name="checkmark-circle" size={16} color={C.success} />
              <Text style={styles.progressText}>{completedCount} of {totalSpots} completed</Text>
              <Text style={styles.progressPercent}>{Math.round(progress * 100)}%</Text>
            </View>
            <View style={styles.progressBarOuter}>
              <View style={styles.progressBarTrack}>
                <Animated.View
                  style={[
                    styles.progressFill,
                    {
                      width: `${progress * 100}%`,
                    },
                  ]}
                />
              </View>
            </View>
          </View>
        )}

        <View style={styles.paceRow}>
          <View style={styles.paceLabelRow}>
            <Ionicons name="speedometer-outline" size={18} color={C.text} />
            <Text style={styles.paceLabel}>Trip Pace</Text>
          </View>
          <View style={styles.paceOptions}>
            {PACE_OPTIONS.map(option => (
              <TouchableOpacity
                key={option.key}
                style={[styles.paceChip, pace === option.key && styles.paceChipActive]}
                onPress={() => onPaceChange(option.key)}
                activeOpacity={0.7}
              >
                <Text style={styles.paceIcon}>{option.icon}</Text>
                <Text style={[styles.paceText, pace === option.key && styles.paceTextActive]}>
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 28,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    shadowColor: '#0A2540',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 28,
    elevation: 10,
    borderWidth: 1,
    borderColor: 'rgba(79, 140, 255, 0.08)',
    position: 'relative',
  },
  gradientTop: {
    height: 6,
    backgroundColor: '#4F8CFF',
    position: 'relative',
    overflow: 'hidden',
  },
  gradientAccent1: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: '50%',
    bottom: 0,
    backgroundColor: '#B9834B',
    opacity: 0.5,
  },
  gradientAccent2: {
    position: 'absolute',
    top: 0,
    left: '50%',
    right: 0,
    bottom: 0,
    backgroundColor: '#2DD4BF',
    opacity: 0.5,
  },
  cardContent: {
    padding: 20,
    paddingTop: 18,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 18,
    position: 'relative',
  },
  titleIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: C.text,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.4,
    flex: 1,
  },
  titleGlow: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(79, 140, 255, 0.06)',
    position: 'absolute',
    right: -30,
    top: -20,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  statIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.5,
  },
  statLabel: {
    fontSize: 10,
    color: '#94A3B8',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  statDivider: {
    width: 1,
    height: 44,
    backgroundColor: '#F1F5F9',
  },
  progressContainer: {
    marginBottom: 16,
    backgroundColor: '#F0FDF4',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(45, 212, 191, 0.15)',
  },
  progressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  progressText: {
    fontSize: 13,
    color: '#166534',
    fontWeight: '600',
    flex: 1,
  },
  progressPercent: {
    fontSize: 13,
    color: '#166534',
    fontWeight: '800',
  },
  progressBarOuter: {
    borderRadius: 8,
    overflow: 'hidden',
  },
  progressBarTrack: {
    height: 8,
    backgroundColor: '#DCFCE7',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#22C55E',
    borderRadius: 4,
  },
  paceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  paceLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  paceLabel: {
    fontSize: 14,
    color: '#64748B',
    fontWeight: '600',
  },
  paceOptions: {
    flexDirection: 'row',
    gap: 6,
  },
  paceChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 24,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  paceChipActive: {
    borderColor: C.primary,
    backgroundColor: '#EFF6FF',
    shadowColor: C.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  paceIcon: {
    fontSize: 13,
  },
  paceText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },
  paceTextActive: {
    color: C.primary,
    fontWeight: '700',
  },
});
