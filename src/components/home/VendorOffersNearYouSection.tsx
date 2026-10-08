import React, { memo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  Platform,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import LinearGradient from 'react-native-linear-gradient';
import { palette } from '../../config/theme';

export type NearbyVendorOfferItem = {
  id: string;
  vendorName: string;
  headline: string;
  subtitle: string;
  promoCode: string;
  distanceLabel: string;
  imageUri?: string;
  latitude?: number | null;
  longitude?: number | null;
};

type Props = {
  offers: NearbyVendorOfferItem[];
  onViewAll: () => void;
  onOfferPress: (offerId: string) => void;
  onMoreOffers: () => void;
};

const CARD_W = 280;

function VendorOfferCard({
  item,
  onPress,
}: {
  item: NearbyVendorOfferItem;
  onPress: () => void;
}) {
  const imageUri =
    item.imageUri ||
    'https://images.unsplash.com/photo-1554118811-1e0d58224f24?q=80&w=400';

  return (
    <TouchableOpacity style={styles.offerCard} activeOpacity={0.92} onPress={onPress}>
      <View style={styles.offerLeft}>
        <Image source={{ uri: imageUri }} style={styles.offerImage} resizeMode="cover" />
        <View style={styles.vendorBadge}>
          <Text style={styles.vendorBadgeText} numberOfLines={2}>
            {item.vendorName}
          </Text>
        </View>
      </View>

      <View style={styles.offerRight}>
        <Text style={styles.offerHeadline} numberOfLines={1}>
          {item.headline}
        </Text>
        <Text style={styles.offerSubtitle} numberOfLines={2}>
          {item.subtitle}
        </Text>

        {item.promoCode ? (
          <LinearGradient
            colors={[palette.primary, palette.primaryDark]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.promoStrip}
          >
            <Text style={styles.promoText} numberOfLines={1}>
              Use Code: {item.promoCode}
            </Text>
          </LinearGradient>
        ) : null}

        {item.distanceLabel ? (
          <View style={styles.distanceRow}>
            <Icon name="location-outline" size={12} color="#111111" />
            <Text style={styles.distanceText}>{item.distanceLabel}</Text>
          </View>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

function MoreOffersCard({ onPress }: { onPress: () => void }) {
  return (
    <TouchableOpacity activeOpacity={0.92} onPress={onPress}>
      <LinearGradient
        colors={[palette.primary, palette.primaryDark]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.moreCard}
      >
        <Icon name="gift-outline" size={34} color="#FFFFFF" />
        <Text style={styles.moreText}>More Offers{'\n'}from local vendors!</Text>
        <View style={styles.moreArrow}>
          <Icon name="arrow-forward" size={18} color={palette.primary} />
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
}

function VendorOffersNearYouSectionComponent({
  offers,
  onViewAll,
  onOfferPress,
  onMoreOffers,
}: Props) {
  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Icon name="pricetag" size={18} color={palette.primary} />
          <Text style={styles.title}>Vendor Offers Near You</Text>
        </View>
        <TouchableOpacity onPress={onViewAll} hitSlop={8}>
          <Text style={styles.viewAll}>View all →</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {offers.map(item => (
          <VendorOfferCard
            key={item.id}
            item={item}
            onPress={() => onOfferPress(item.id)}
          />
        ))}
        <MoreOffersCard onPress={onMoreOffers} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: 28,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    paddingHorizontal: 20,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  title: {
    fontSize: 18,
    color: '#000000',
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    fontWeight: '700',
    flexShrink: 1,
  },
  viewAll: {
    fontSize: 13,
    color: '#6B5B4E',
    fontWeight: '600',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingRight: 20,
    gap: 12,
  },
  offerCard: {
    width: CARD_W,
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.border,
    overflow: 'hidden',
    minHeight: 132,
  },
  offerLeft: {
    width: 98,
    backgroundColor: '#E5E5EA',
  },
  offerImage: {
    ...StyleSheet.absoluteFillObject,
  },
  vendorBadge: {
    position: 'absolute',
    left: 10,
    top: '50%',
    marginTop: -28,
    width: 78,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(30, 27, 24, 0.88)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  vendorBadgeText: {
    color: palette.primary,
    fontSize: 9,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 0.4,
    lineHeight: 12,
  },
  offerRight: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 12,
    justifyContent: 'space-between',
  },
  offerHeadline: {
    fontSize: 22,
    fontWeight: '800',
    color: '#000000',
    letterSpacing: -0.3,
  },
  offerSubtitle: {
    fontSize: 12,
    color: '#000000',
    fontWeight: '500',
    marginTop: 2,
  },
  promoStrip: {
    marginTop: 8,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  promoText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  distanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
  },
  distanceText: {
    fontSize: 11,
    color: '#8B7A6A',
    fontWeight: '500',
  },
  moreCard: {
    width: 150,
    minHeight: 132,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 18,
    marginTop: 12,
    marginBottom: 12,
  },
  moreArrow: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export const VendorOffersNearYouSection = memo(VendorOffersNearYouSectionComponent);
