import React from 'react';
import { View, Text, StyleSheet, ImageBackground, TouchableOpacity, Image } from 'react-native';
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

interface FeaturedOfferCardProps {
  offer: NearbyReward;
  onPress: (id: string) => void;
  onSave?: (id: string) => void;
  isSaved?: boolean;
}

export const FeaturedOfferCard = ({ offer, onPress, onSave, isSaved }: FeaturedOfferCardProps) => {
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
          <ImageBackground source={{ uri: offer.imageUrl }} style={styles.image} resizeMode="cover">
            <View style={styles.overlay} />
          </ImageBackground>
        ) : (
          <View style={[styles.image, styles.imagePlaceholder]}>
            <Icon name="image-outline" size={32} color={COLORS.textMuted} />
          </View>
        )}
        
        <View style={styles.badgeContainer}>
          <Icon name="star" size={12} color={COLORS.gold} />
          <Text style={styles.badgeText}>Featured</Text>
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
        <View style={styles.row}>
          <View style={styles.vendorLogoContainer}>
            {offer.vendor?.imageUrl ? (
              <Image source={{ uri: offer.vendor.imageUrl }} style={styles.vendorLogo} />
            ) : (
              <View style={[styles.vendorLogo, styles.logoPlaceholder]}>
                <Icon name="storefront-outline" size={16} color={COLORS.textMuted} />
              </View>
            )}
          </View>
          <View style={styles.textContent}>
            <Text style={styles.vendorName} numberOfLines={1}>{offer.vendor?.businessName}</Text>
            <Text style={styles.title} numberOfLines={1}>{offer.title}</Text>
            <Text style={styles.discount}>{discountLabel}</Text>
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.footerRow}>
          <View style={styles.metaRow}>
            <Icon name="star" size={14} color={COLORS.gold} />
            <Text style={styles.metaText}>4.8</Text>
            
            <View style={styles.dot} />
            
            {offer.distance !== undefined && (
              <>
                <Icon name="location-outline" size={14} color={COLORS.textMuted} />
                <Text style={styles.metaText}>{(offer.distance).toFixed(1)} km</Text>
              </>
            )}
          </View>

          <TouchableOpacity style={styles.viewBtn} onPress={() => onPress(offer.id)}>
            <Text style={styles.viewBtnText}>View Offer</Text>
            <Icon name="arrow-forward" size={14} color={COLORS.text} style={styles.viewIcon} />
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    width: 320,
    backgroundColor: COLORS.white,
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  imageContainer: {
    height: 140,
    width: '100%',
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  imagePlaceholder: {
    backgroundColor: '#F0F0F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeContainer: {
    position: 'absolute',
    top: 16,
    left: 16,
    backgroundColor: COLORS.white,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.text,
    marginLeft: 4,
  },
  favoriteBtn: {
    position: 'absolute',
    top: 16,
    right: 16,
    backgroundColor: COLORS.white,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  content: {
    padding: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  vendorLogoContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.white,
    marginTop: -40, // overlap the image
    padding: 4,
    marginRight: 12,
  },
  vendorLogo: {
    width: '100%',
    height: '100%',
    borderRadius: 24,
  },
  logoPlaceholder: {
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  textContent: {
    flex: 1,
  },
  vendorName: {
    fontSize: 13,
    color: COLORS.textMuted,
    marginBottom: 2,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 4,
  },
  discount: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.gold,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 12,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textMuted,
    marginLeft: 4,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.textMuted,
    marginHorizontal: 8,
  },
  viewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  viewBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.text,
  },
  viewIcon: {
    marginLeft: 4,
  },
});
