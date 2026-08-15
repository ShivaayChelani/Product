import React, { memo, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { PalPointsIcon } from '../PalPointsIcon';
import type { Campaign } from '../../services/api/campaigns';
import {
  getLuxuryTheme,
  luxuryCardShadow,
  LuxuryRadii,
  LuxurySpacing,
  LuxuryTypography,
} from '../../design/luxuryTravel';

type Props = {
  balance: number;
  nextCampaign?: Campaign | null;
  onPress?: () => void;
};

const PAL_POINTS_ACCENT = '#D4843A';

function PalPointsBalanceCardComponent({ balance, nextCampaign, onPress }: Props) {
  const theme = getLuxuryTheme('light');
  const palPointsColor = theme.palPoints ?? PAL_POINTS_ACCENT;

  const { progress, remaining, rewardTitle } = useMemo(() => {
    if (!nextCampaign) {
      return { progress: 0, remaining: 0, rewardTitle: null as string | null };
    }
    const target = nextCampaign.pointsRequired ?? 0;
    const pct = target > 0 ? Math.min(100, Math.round((balance / target) * 100)) : 0;
    return {
      progress: pct,
      remaining: Math.max(0, target - balance),
      rewardTitle: nextCampaign.name,
    };
  }, [balance, nextCampaign]);

  return (
    <Animated.View entering={FadeInUp.delay(120).duration(480)}>
      <TouchableOpacity
        activeOpacity={0.92}
        onPress={onPress}
        style={[styles.card, luxuryCardShadow(), { backgroundColor: theme.card, borderColor: theme.border }]}
        accessibilityRole="button"
        accessibilityLabel={`PalPoints balance ${balance}`}
      >
        <View style={styles.left}>
          <Text style={[LuxuryTypography.caption, { color: theme.textSecondary }]}>
            PalPoints Balance
          </Text>
          <View style={styles.balanceRow}>
            <PalPointsIcon size={32} />
            <Text style={[LuxuryTypography.headingLarge, { color: theme.textPrimary }]}>
              {balance.toLocaleString()}
            </Text>
          </View>
          <Text style={[LuxuryTypography.caption, { color: theme.textSecondary, marginTop: 4 }]}>
            Keep exploring, keep earning!
          </Text>
        </View>

        <View style={styles.giftWrap} accessibilityElementsHidden>
          <Text style={styles.giftEmoji}>🎁</Text>
        </View>

        <View style={styles.right}>
          {rewardTitle ? (
            <>
              <View style={styles.rewardHead}>
                <Image source={require('../../assets/ticket.png')} style={{ width: 16, height: 16, tintColor: theme.accentBrown }} resizeMode="contain" />
                <Text style={[LuxuryTypography.caption, { color: theme.textSecondary }]}>
                  Next Reward:
                </Text>
              </View>
              <Text style={[LuxuryTypography.bodySemiBold, { color: theme.textPrimary }]} numberOfLines={2}>
                {rewardTitle}
              </Text>
              <View style={[styles.track, { backgroundColor: theme.divider }]}>
                <View
                  style={[styles.fill, { width: `${progress}%`, backgroundColor: palPointsColor }]}
                />
              </View>
              <Text style={[LuxuryTypography.label, { color: theme.textSecondary, marginTop: 6 }]}>
                {remaining} pts to go
              </Text>
            </>
          ) : (
            <Text style={[LuxuryTypography.caption, { color: theme.textSecondary }]}>
              No active reward campaigns.
            </Text>
          )}
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: LuxurySpacing.screenHorizontal,
    marginBottom: 8,
    borderRadius: LuxuryRadii.card,
    borderWidth: 1,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  left: {
    flex: 1.1,
  },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  giftWrap: {
    paddingHorizontal: 4,
  },
  giftEmoji: {
    fontSize: 36,
  },
  right: {
    flex: 1,
  },
  rewardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  track: {
    height: 6,
    borderRadius: 3,
    marginTop: 8,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 3,
  },
});

export const PalPointsBalanceCard = memo(PalPointsBalanceCardComponent);
export default PalPointsBalanceCard;
