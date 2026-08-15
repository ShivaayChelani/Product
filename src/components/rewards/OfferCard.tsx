import React from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import type { NearbyReward } from '../../services/api';

const COLORS = {
  white: '#FFFFFF',
  text: '#202020',
  textMuted: '#6D6D6D',
  gold: '#D9A441',
  border: '#E7DFD2',
  background: '#FFFFFF',
};

interface OfferCardProps {
  offer: NearbyReward;
  onPress: (id: string) => void;
  onSave?: (id: string) => void;
  isSaved?: boolean;
}

export const OfferCard = ({ offer, onPress, onSave, isSaved }: OfferCardProps) => {
  const discountLabel = offer.discountType === 'flat' 
    ? `₹${offer.discountValue} OFF` 
    : offer.discountType === 'percentage' 
      ? `${offer.discountValue}% OFF` 
      : offer.discountType;

  return (
    <TouchableOpacity 
      style={styles.card} 
      activeOpacity={0.9} 
      onPress={() => onPress(offer.id)}
    >
      <View style={styles.imageContainer}>
        {offer.imageUrl ? (
          <Image source={{ uri: offer.imageUrl }} style={styles.image} />
        ) : (
          <View style={[styles.image, styles.imagePlaceholder]}>
            <Icon name="image-outline" size={32} color={COLORS.textMuted} />
          </View>
        )}
        <View style={styles.badgeContainer}>
          <Icon name="pricetag" size={12} color={COLORS.text} />
          <Text style={styles.badgeText}>{offer.category || 'Offer'}</Text>
        </View>
        <TouchableOpacity 
          style={styles.favoriteBtn} 
          onPress={() => onSave?.(offer.id)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Icon name={isSaved ? "heart" : "heart-outline"} size={20} color={isSaved ? '#FF3B30' : COLORS.text} />
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        <View style={styles.vendorRow}>
          {offer.vendor?.imageUrl ? (
            <Image source={{ uri: offer.vendor.imageUrl }} style={styles.vendorLogo} />
          ) : (
            <View style={[styles.vendorLogo, styles.logoPlaceholder]}>
              <Icon name="storefront-outline" size={12} color={COLORS.textMuted} />
            </View>
          )}
          <Text style={styles.vendorName} numberOfLines={1}>{offer.vendor?.businessName}</Text>
        </View>

        <Text style={styles.title} numberOfLines={2}>{offer.title}</Text>
        <Text style={styles.discount}>{discountLabel}</Text>

        <View style={styles.metaRow}>
          {offer.distance !== undefined && (
            <View style={styles.metaItem}>
              <Icon name="location-outline" size={12} color={COLORS.textMuted} />
              <Text style={styles.metaText}>{(offer.distance).toFixed(1)} km</Text>
            </View>
          )}
          {offer.validTill && (
            <View style={styles.metaItem}>
              <Icon name="time-outline" size={12} color={COLORS.textMuted} />
              <Text style={styles.metaText}>
                Until {new Date(offer.validTill).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
              </Text>
            </View>
          )}
        </View>

        <TouchableOpacity 
          style={styles.viewBtn} 
          onPress={() => onPress(offer.id)}
        >
          <Text style={styles.viewBtnText}>View Details</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    width: 220,
    backgroundColor: COLORS.white,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 3,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  imageContainer: {
    height: 120,
    width: '100%',
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  imagePlaceholder: {
    backgroundColor: '#F0F0F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeContainer: {
    position: 'absolute',
    top: 12,
    left: 12,
    backgroundColor: COLORS.white,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.text,
    marginLeft: 4,
  },
  favoriteBtn: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: COLORS.white,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  content: {
    padding: 12,
  },
  vendorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  vendorLogo: {
    width: 20,
    height: 20,
    borderRadius: 10,
    marginRight: 6,
  },
  logoPlaceholder: {
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  vendorName: {
    fontSize: 12,
    color: COLORS.textMuted,
    flex: 1,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 4,
  },
  discount: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.gold,
    marginBottom: 12,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaText: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginLeft: 4,
  },
  viewBtn: {
    width: '100%',
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  viewBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.text,
  },
});
