import React, { useRef, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, Easing, Image } from 'react-native';
import Pal from '../design/DesignSystem';
import { Ionicons } from '../utils/Icons';
import { TouristSpot } from '../types';
import { getCategoryEmoji } from '../utils/placeUtils';
import { getBestTimeReason } from '../utils/itinerary';
import { LinearGradient } from '../utils/LinearGradient';

interface ItineraryCardProps {
  spot: TouristSpot;
  scheduledTime: string;
  startMinutes: number;
  endMinutes: number;
  order: number;
  distanceFromPrevious?: number;
  isCompleted: boolean;
  onNavigate: () => void;
  onViewDetails: () => void;
  onRemove: () => void;
  onToggleComplete: () => void;
}

const C = Pal.colors.light;

export default function ItineraryCard({
  spot,
  scheduledTime,
  distanceFromPrevious,
  isCompleted,
  onNavigate,
  onViewDetails,
  onRemove,
  onToggleComplete,
}: ItineraryCardProps) {
  const emoji = spot.badgeIcon || getCategoryEmoji(spot.category) || '📍';
  const duration = spot.estimatedDuration || 60;
  const entryFee = spot.entryFee ?? spot.averageCost ?? 0;
  const bestTimeReason = getBestTimeReason(spot);
  const spotImage = spot.imageUrl || spot.imageUri || (spot as { images?: string[] }).images?.[0] || null;
  const [imgError, _setImgError] = useState(false);

  const slideAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.95)).current;
  const shimmerAnim = useRef(new Animated.Value(0)).current;
  const completeScale = useRef(new Animated.Value(1)).current;

   
  useEffect(() => {
    Animated.parallel([
      Animated.spring(slideAnim, { toValue: 1, friction: 8, tension: 40, useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, friction: 8, tension: 40, useNativeDriver: true }),
    ]).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerAnim, { toValue: 1, duration: 2000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(shimmerAnim, { toValue: 0, duration: 2000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    ).start();
  }, [fadeAnim, scaleAnim, shimmerAnim, slideAnim]);

  useEffect(() => {
    if (isCompleted) {
      Animated.sequence([
        Animated.spring(completeScale, { toValue: 1.15, friction: 3, tension: 100, useNativeDriver: true }),
        Animated.spring(completeScale, { toValue: 1, friction: 5, tension: 80, useNativeDriver: true }),
      ]).start();
    }
  }, [isCompleted, completeScale]);

  const shimmerOpacity = shimmerAnim.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] });
  const translateY = slideAnim.interpolate({ inputRange: [0, 1], outputRange: [40, 0] });

  const hasHeroImage = spotImage && !imgError;

  return (
    <Animated.View
      style={[
        styles.card,
        isCompleted && styles.cardCompleted,
        { opacity: fadeAnim, transform: [{ translateY }, { scale: scaleAnim }] },
      ]}
    >
      <View style={[styles.glowBorder, isCompleted && { backgroundColor: C.success }]} />
      <View style={styles.leftAccent}>
        <TouchableOpacity style={styles.completeButton} onPress={onToggleComplete} activeOpacity={0.7}>
          <Animated.View style={[styles.checkCircle, isCompleted && styles.checkCircleDone, { transform: [{ scale: completeScale }] }]}>
            {isCompleted ? (
              <Ionicons name="checkmark" size={16} color="#fff" />
            ) : (
              <View style={styles.checkEmpty} />
            )}
          </Animated.View>
        </TouchableOpacity>
        <View style={[styles.timelineDot, isCompleted && styles.timelineDotDone]} />
      </View>

      <View style={styles.content}>
        {hasHeroImage && (
          <View style={styles.heroImageWrap}>
            <Image
              source={{ uri: spotImage }}
              style={styles.heroImage}
              resizeMode="cover"
            />
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.25)', 'rgba(0,0,0,0.62)']}
              locations={[0.45, 0.72, 1]}
              style={styles.heroGradient}
            />
            <View style={styles.heroBadgeRow}>
              <View style={styles.heroTimeBadge}>
                <Ionicons name="time-outline" size={11} color="#fff" />
                <Text style={styles.heroTimeText}>{scheduledTime}</Text>
              </View>
              <View style={styles.heroDurationBadge}>
                <Text style={styles.heroDurationText}>{duration} min</Text>
              </View>
            </View>
            <View style={styles.heroTitleRow}>
              <Text style={styles.heroTitle} numberOfLines={1}>{spot.name}</Text>
              <View style={styles.heroCategory}>
                <Text style={styles.heroCategoryText}>{spot.category}</Text>
              </View>
            </View>
          </View>
        )}

        {!hasHeroImage && (
          <View style={styles.headerRow}>
            <View style={[styles.timeBadge, isCompleted && styles.timeBadgeDone]}>
              <Ionicons name="time-outline" size={12} color={isCompleted ? C.success : C.primary} />
              <Text style={[styles.time, isCompleted && styles.timeDone]}>{scheduledTime}</Text>
            </View>
            <View style={[styles.durationBadge, isCompleted && styles.durationBadgeDone]}>
              <Text style={[styles.duration, isCompleted && styles.durationDone]}>{duration} min</Text>
            </View>
          </View>
        )}

        <Animated.View style={[!hasHeroImage ? styles.spotRow : styles.spotRowCompact, { opacity: shimmerOpacity }]}>
          {hasHeroImage ? (
            <View style={[styles.emojiContainer, isCompleted && styles.emojiContainerDone]}>
              <Text style={styles.emoji}>{emoji}</Text>
            </View>
          ) : (
            <View style={[styles.emojiContainer, isCompleted && styles.emojiContainerDone]}>
              <Text style={styles.emoji}>{emoji}</Text>
            </View>
          )}
          <View style={styles.spotInfo}>
            {hasHeroImage && (
              <View style={styles.categoryRow}>
                <View style={[styles.categoryDot, { backgroundColor: isCompleted ? C.success : C.primary }]} />
                <Text style={[styles.category, isCompleted && styles.categoryDone]}>
                  {spot.category.charAt(0).toUpperCase() + spot.category.slice(1)}
                </Text>
              </View>
            )}
            {!hasHeroImage && (
              <>
                <Text style={[styles.spotName, isCompleted && styles.spotNameCompleted]} numberOfLines={1}>
                  {spot.name}
                </Text>
                <View style={styles.categoryRow}>
                  <View style={[styles.categoryDot, { backgroundColor: isCompleted ? C.success : C.primary }]} />
                  <Text style={[styles.category, isCompleted && styles.categoryDone]}>
                    {spot.category.charAt(0).toUpperCase() + spot.category.slice(1)}
                  </Text>
                </View>
              </>
            )}
          </View>
        </Animated.View>

        <View style={styles.badgeRow}>
          {spot.verificationStatus === 'verified' && (
            <View style={[styles.badge, styles.badgeVerified]}>
              <Ionicons name="checkmark-circle" size={10} color="#059669" />
              <Text style={styles.badgeText}>Verified</Text>
            </View>
          )}
          {spot.mustVisit && (
            <View style={[styles.badge, styles.badgeMustVisit]}>
              <Ionicons name="star" size={10} color="#DC2626" />
              <Text style={styles.badgeText}>Must Visit</Text>
            </View>
          )}
          {spot.isHiddenGem && (
            <View style={[styles.badge, styles.badgeHiddenGem]}>
              <Ionicons name="diamond" size={10} color="#D97706" />
              <Text style={styles.badgeText}>Hidden Gem</Text>
            </View>
          )}
        </View>

        {bestTimeReason && (
          <View style={styles.tipRow}>
            <View style={styles.tipIconWrap}>
              <Ionicons name="bulb-outline" size={12} color={C.primary} />
            </View>
            <Text style={styles.tipText}>{bestTimeReason}</Text>
          </View>
        )}

        <View style={styles.metaRow}>
          {entryFee > 0 ? (
            <View style={styles.metaItem}>
              <Ionicons name="cash-outline" size={13} color={C.success} />
              <Text style={styles.metaText}>₹{entryFee}</Text>
            </View>
          ) : (
            <View style={styles.metaItem}>
              <View style={styles.freeBadge}>
                <Text style={styles.freeText}>Free</Text>
              </View>
            </View>
          )}
          {spot.points ? (
            <View style={styles.metaItem}>
              <Ionicons name="trophy-outline" size={13} color={C.primary} />
              <Text style={[styles.metaText, styles.pointsText]}>+{spot.points} pts</Text>
            </View>
          ) : null}
          {distanceFromPrevious !== undefined && distanceFromPrevious > 0 && (
            <View style={styles.metaItem}>
              <Ionicons name="walk-outline" size={13} color={C.primary} />
              <Text style={[styles.metaText, styles.distanceText]}>
                {distanceFromPrevious < 1000
                  ? `${Math.round(distanceFromPrevious)}m`
                  : `${(distanceFromPrevious / 1000).toFixed(1)}km`}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.actionRow}>
          <TouchableOpacity style={[styles.actionButton, styles.actionNavigate]} onPress={onNavigate} activeOpacity={0.8}>
            <Ionicons name="navigate-outline" size={14} color={C.primary} />
            <Text style={[styles.actionText, { color: C.primary }]}>Navigate</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.actionButton, styles.actionDetails]} onPress={onViewDetails} activeOpacity={0.8}>
            <Ionicons name="information-circle-outline" size={14} color={C.primaryDark} />
            <Text style={[styles.actionText, { color: C.primaryDark }]}>Details</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.actionButton, styles.actionRemove]} onPress={onRemove} activeOpacity={0.8}>
            <Ionicons name="trash-outline" size={14} color={C.danger} />
            <Text style={[styles.actionText, { color: C.danger }]}>Remove</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    marginBottom: 14,
    marginLeft: 16,
    marginRight: 16,
    overflow: 'visible',
    shadowColor: '#0A2540',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 8,
    borderWidth: 1,
    borderColor: 'rgba(79, 140, 255, 0.08)',
    position: 'relative',
  },
  cardCompleted: {
    opacity: 0.88,
  },
  glowBorder: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: '#4F8CFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    opacity: 0.6,
  },
  leftAccent: {
    width: 40,
    alignItems: 'center',
    paddingTop: 18,
  },
  completeButton: {
    width: 28,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2,
  },
  checkCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#CBD5E1',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
  },
  checkCircleDone: {
    borderColor: C.success,
    backgroundColor: C.success,
    shadowColor: C.success,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 4,
  },
  checkEmpty: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#CBD5E1',
  },
  timelineDot: {
    width: 2,
    flex: 1,
    backgroundColor: '#E2E8F0',
    marginTop: 4,
    minHeight: 20,
  },
  timelineDotDone: {
    backgroundColor: C.success,
  },
  content: {
    flex: 1,
    paddingVertical: 16,
    paddingRight: 16,
    paddingLeft: 4,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  timeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(79, 140, 255, 0.15)',
  },
  timeBadgeDone: {
    backgroundColor: '#F0FDF4',
    borderColor: 'rgba(45, 212, 191, 0.2)',
  },
  time: {
    fontSize: 12,
    fontWeight: '700',
    color: C.primary,
    letterSpacing: 0.2,
  },
  timeDone: {
    color: C.success,
  },
  durationBadge: {
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  durationBadgeDone: {
    backgroundColor: '#F1F5F9',
    borderColor: '#E2E8F0',
  },
  duration: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '600',
  },
  durationDone: {
    color: '#CBD5E1',
  },
  heroImageWrap: {
    height: 140,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 12,
    position: 'relative',
    shadowColor: '#0A2540',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 6,
  },
  heroImage: {
    width: '100%',
    height: '100%',
    opacity: 1,
  },
  heroGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  heroBadgeRow: {
    position: 'absolute',
    top: 10,
    left: 10,
    flexDirection: 'row',
    gap: 6,
  },
  heroTimeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  heroTimeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  heroDurationBadge: {
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  heroDurationText: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.95)',
    textShadowColor: 'rgba(0,0,0,0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  heroTitleRow: {
    position: 'absolute',
    bottom: 10,
    left: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heroTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.3,
    flex: 1,
    marginRight: 8,
    textShadowColor: 'rgba(0,0,0,0.85)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  heroCategory: {
    backgroundColor: 'rgba(0,0,0,0.4)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  heroCategoryText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  spotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  spotRowCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    marginTop: -2,
  },
  emojiContainer: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: '#F8FAFC',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    shadowColor: '#0A2540',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  emojiContainerDone: {
    backgroundColor: '#F1F5F9',
    borderColor: '#E2E8F0',
  },
  emoji: {
    fontSize: 20,
  },
  imageContainer: {
    width: 50,
    height: 50,
    borderRadius: 14,
    marginRight: 12,
    overflow: 'hidden',
    shadowColor: '#0A2540',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 4,
    position: 'relative',
  },
  spotImage: {
    width: '100%',
    height: '100%',
  },
  imageOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(79, 140, 255, 0.08)',
  },
  spotInfo: {
    flex: 1,
  },
  spotName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  spotNameCompleted: {
    textDecorationLine: 'line-through',
    color: '#94A3B8',
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 3,
  },
  categoryDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  category: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
  },
  categoryDone: {
    color: '#94A3B8',
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  badgeVerified: {
    backgroundColor: '#ECFDF5',
  },
  badgeMustVisit: {
    backgroundColor: '#FEF2F2',
  },
  badgeHiddenGem: {
    backgroundColor: '#FFFBEB',
  },
  badgeText: {
    fontSize: 10,
    color: '#1E293B',
    fontWeight: '700',
  },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 10,
    backgroundColor: '#FFFBEB',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(244, 180, 0, 0.15)',
  },
  tipIconWrap: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FEF3C7',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 1,
  },
  tipText: {
    fontSize: 12,
    color: '#92400E',
    flex: 1,
    lineHeight: 16,
    fontWeight: '500',
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    marginBottom: 14,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
  },
  freeBadge: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  freeText: {
    color: C.success,
    fontWeight: '700',
    fontSize: 11,
  },
  pointsText: {
    color: C.primary,
    fontWeight: '700',
  },
  distanceText: {
    color: C.primary,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 10,
    borderRadius: 14,
  },
  actionNavigate: {
    backgroundColor: '#EFF6FF',
  },
  actionDetails: {
    backgroundColor: '#EEF2FF',
  },
  actionRemove: {
    backgroundColor: '#FEF2F2',
  },
  actionText: {
    fontSize: 12,
    fontWeight: '700',
  },
});
