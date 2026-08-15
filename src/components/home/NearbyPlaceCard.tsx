import React, { memo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { PressableScale } from './PressableScale';
import ImageComingSoon from '../ui/ImageComingSoon';
import { hasValidImageUrl } from '../../utils/imageUrl';
import {
  getLuxuryTheme,
  luxuryCardShadow,
  LuxuryRadii,
  LuxuryTypography,
} from '../../design/luxuryTravel';

export type NearbyPlaceItem = {
  id: string;
  name: string;
  imageUri?: string | null;
  rating?: number | null;
  distance: string;
  isOpen?: boolean;
};

type Props = {
  item: NearbyPlaceItem;
  width: number;
  index: number;
  isWishlisted: boolean;
  onPress: () => void;
  onToggleWishlist: () => void;
};

function NearbyPlaceCardComponent({
  item,
  width,
  index,
  isWishlisted,
  onPress,
  onToggleWishlist,
}: Props) {
  const theme = getLuxuryTheme('light');

  return (
    <Animated.View entering={FadeInUp.delay(index * 60).duration(420)}>
      <PressableScale
        onPress={onPress}
        style={[styles.card, luxuryCardShadow(), { width }]}
        activeScale={0.97}
      >
        <View style={styles.imageWrap}>
          {hasValidImageUrl(item.imageUri) ? (
            <Image
              source={{ uri: item.imageUri }}
              style={styles.image}
              resizeMode="cover"
            />
          ) : (
            <ImageComingSoon style={styles.image} compact />
          )}
          <View style={styles.distanceBadge}>
            <Text style={[LuxuryTypography.label, { color: theme.textPrimary }]}>
              {item.distance}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.heartBtn}
            onPress={onToggleWishlist}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel={isWishlisted ? 'Remove from wishlist' : 'Add to wishlist'}
          >
            <Icon
              name={isWishlisted ? 'heart' : 'heart-outline'}
              size={18}
              color={isWishlisted ? '#D4843A' : '#FFFFFF'}
            />
          </TouchableOpacity>
        </View>
        <View style={styles.meta}>
          <Text style={[LuxuryTypography.bodySemiBold, { color: theme.textPrimary }]} numberOfLines={2}>
            {item.name.replace(/\n/g, ' ')}
          </Text>
          <View style={styles.row}>
            {item.rating != null && item.rating > 0 ? (
              <>
                <Icon name="star" size={13} color={theme.accentBrown} />
                <Text style={[LuxuryTypography.caption, { color: theme.textSecondary }]}>
                  {item.rating.toFixed(1)}
                </Text>
              </>
            ) : (
              <Text style={[LuxuryTypography.caption, { color: theme.textSecondary }]}>
                No ratings yet
              </Text>
            )}
            {item.isOpen !== false ? (
              <>
                <Text style={[LuxuryTypography.caption, { color: theme.divider }]}> • </Text>
                <Text style={[LuxuryTypography.caption, { color: theme.success }]}>Open Now</Text>
              </>
            ) : null}
          </View>
        </View>
      </PressableScale>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginRight: 14,
    borderRadius: LuxuryRadii.card,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#ECE3D8',
    overflow: 'hidden',
  },
  imageWrap: {
    height: 148,
    borderTopLeftRadius: LuxuryRadii.image,
    borderTopRightRadius: LuxuryRadii.image,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  distanceBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: LuxuryRadii.pill,
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
  heartBtn: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(45, 36, 29, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  meta: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
});

export const NearbyPlaceCard = memo(NearbyPlaceCardComponent);
