import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  PanResponder,
  Animated,
  ActivityIndicator,
  Platform,
  Image,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';

export type MapDetailMarker = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  category: string;
  type: 'place' | 'vendor';
  image?: string | null;
  rating?: number;
  reviewCount?: number;
  reelCount?: number;
  description?: string;
  city?: string;
  state?: string;
  color: string;
  sublabel: string;
  distanceKm?: string;
  needsImage?: boolean;
  isOpen?: boolean | null;
  closesAt?: string | null;
  entryFee?: number | null;
  estimatedDuration?: number | null;
};

type Props = {
  marker: MapDetailMarker;
  locationUnavailable?: boolean;
  addressLine?: string;
  inItinerary: boolean;
  addingToItinerary?: boolean;
  bottomInset: number;
  onClose: () => void;
  onNavigate: () => void;
  onAddToTrip: () => void;
  onBookRide?: () => void;
  isVendor?: boolean;
  onViewVendor?: () => void;
  onAddImage?: () => void;
  onReelsPress?: () => void;
};

const COLORS = {
  card: '#FFFFFF',
  textPrimary: '#1A1412',
  textSecondary: '#70645C',
  textBody: '#524842',
  gold: '#A06828',
  iconDiscBg: '#F7EFE5',
  cardBg: '#FAF8F5',
  cardBorder: '#F2EDE6',
  btnBg: '#FAF8F5',
  btnBorder: '#F2EDE6',
};

const serif = Platform.OS === 'ios' ? 'Georgia' : 'serif';

function formatEntryFee(fee?: number | null): string {
  if (fee == null) return 'Not listed';
  if (fee === 0) return '₹0';
  return `₹${fee}`;
}

export default function MapPlaceDetailCard({
  marker,
  locationUnavailable = false,
  inItinerary,
  addingToItinerary = false,
  bottomInset,
  onClose,
  onNavigate,
  onAddToTrip,
  onBookRide,
  isVendor,
  onViewVendor,
  onAddImage,
  onReelsPress,
}: Props) {
  const translateY = useRef(new Animated.Value(0)).current;
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false);

  useEffect(() => {
    setDescriptionExpanded(false);
    setImageError(false);
  }, [marker.id]);

  useEffect(() => {
    translateY.setValue(48);
    Animated.spring(translateY, {
      toValue: 0,
      damping: 16,
      stiffness: 180,
      useNativeDriver: true,
    }).start();
  }, [marker.id, translateY]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => g.dy > 8,
      onPanResponderMove: (_, g) => {
        if (g.dy > 0) translateY.setValue(g.dy);
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy > 80 || g.vy > 0.8) {
          Animated.timing(translateY, {
            toValue: 500,
            duration: 200,
            useNativeDriver: true,
          }).start(onClose);
        } else {
          Animated.spring(translateY, { toValue: 0, useNativeDriver: true }).start();
        }
      },
    }),
  ).current;

  const cityLine = [marker.city, marker.state ? (marker.state.length <= 3 ? marker.state.toUpperCase() : marker.state) : null]
    .filter(Boolean)
    .join(', ');
  const locationSubtext = cityLine;

  const description = marker.description?.trim() || '';
  const hasValidImage = !!marker.image && !imageError;

  return (
    <Animated.View
      style={[styles.wrap, { bottom: bottomInset, transform: [{ translateY }] }]}
      {...panResponder.panHandlers}
    >
      <View style={styles.headerRow}>
        {/* Left Column: Large Image Thumbnail */}
        <View style={styles.imageCol}>
          {hasValidImage ? (
            <Image
              source={{ uri: marker.image as string }}
              style={styles.thumbnail}
              resizeMode="cover"
              onError={() => setImageError(true)}
            />
          ) : (
            <TouchableOpacity style={styles.noImageThumbnail} onPress={onAddImage} activeOpacity={0.8}>
              <Icon name="image-outline" size={32} color="#D0BFA5" />
              <View style={styles.placeholderPlus}>
                <Icon name="add" size={12} color="#FFF" />
              </View>
            </TouchableOpacity>
          )}
        </View>

        {/* Right Column: Title, Favorite Heart, Subtitle, Description, Read More, Watch Reels */}
        <View style={styles.headerInfo}>
          <View style={styles.titleRow}>
            <Text style={styles.title} numberOfLines={2}>
              {marker.name}
            </Text>
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={onClose}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Icon name="close" size={18} color="#2C1810" />
            </TouchableOpacity>
          </View>

          {locationSubtext || locationUnavailable ? (
            <View style={styles.metaRow}>
              <Icon name="location-outline" size={13} color={COLORS.textSecondary} />
              <Text style={styles.metaText} numberOfLines={1}>
                {locationUnavailable && !locationSubtext ? 'Location unavailable' : locationSubtext}
              </Text>
            </View>
          ) : null}

          {description ? (
            <>
              <Text style={styles.description} numberOfLines={descriptionExpanded ? undefined : 2}>
                {description}
              </Text>

              <TouchableOpacity
                onPress={() => setDescriptionExpanded(!descriptionExpanded)}
                hitSlop={{ top: 8, bottom: 8, right: 8 }}
                style={{ marginBottom: 8 }}
              >
                <Text style={styles.readMore}>
                  {descriptionExpanded ? 'Read less' : 'Read more \u203A'}
                </Text>
              </TouchableOpacity>
            </>
          ) : null}

          {/* Watch Reels Banner Card */}
          <TouchableOpacity style={s.reelsBanner} onPress={onReelsPress} activeOpacity={0.85}>
            <View style={s.reelsThumbWrap}>
              {hasValidImage ? (
                <Image source={{ uri: marker.image as string }} style={s.reelsThumbImg} resizeMode="cover" />
              ) : (
                <View style={[s.reelsThumbImg, { backgroundColor: '#E8DDD0' }]} />
              )}
              <View style={s.reelsPlayDisc}>
                <Icon name="play" size={10} color="#1A1412" style={{ marginLeft: 1 }} />
              </View>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.reelsTitle}>Watch Reels</Text>
              <Text style={s.reelsSub} numberOfLines={1}>
                Explore this place in short videos
              </Text>
            </View>
            <Icon name="chevron-forward" size={16} color={COLORS.textBody} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.infoCard}>
        <View style={styles.infoItem}>
          <View style={styles.infoIconDisc}>
            <Icon name="ticket-outline" size={20} color={COLORS.gold} />
          </View>
          <View style={styles.infoTextCol}>
            <Text style={styles.infoValue}>{formatEntryFee(marker.entryFee)}</Text>
            <Text style={styles.infoLabel}>Entry Fee</Text>
          </View>
        </View>
      </View>

      {/* Bottom Action Pill Buttons: Navigate, Add to Trip, Get a Ride */}
      <View style={styles.actionsRow}>
        <TouchableOpacity style={styles.actionPillBtn} onPress={onNavigate} activeOpacity={0.8}>
          <Icon name="navigate-outline" size={18} color={COLORS.textPrimary} />
          <Text style={styles.actionPillText}>Navigate</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionPillBtn, (!isVendor && inItinerary) && styles.actionPillDisabled]}
          onPress={isVendor && onViewVendor ? onViewVendor : onAddToTrip}
          disabled={(!isVendor && inItinerary) || addingToItinerary}
          activeOpacity={0.8}
        >
          {addingToItinerary ? (
            <ActivityIndicator size="small" color={COLORS.textPrimary} />
          ) : (
            <Icon
              name={isVendor ? 'storefront-outline' : inItinerary ? 'checkmark-circle-outline' : 'briefcase-outline'}
              size={18}
              color={COLORS.textPrimary}
            />
          )}
          <Text style={styles.actionPillText}>
            {isVendor ? 'View' : inItinerary ? 'Added' : 'Add to Trip'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionPillBtn}
          onPress={onBookRide || onNavigate}
          activeOpacity={0.8}
        >
          <Icon name="car-outline" size={18} color={COLORS.textPrimary} />
          <Text style={styles.actionPillText}>Get a Ride</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  reelsBanner: {
    backgroundColor: '#FAF7F2',
    borderWidth: 1,
    borderColor: '#EFEBE4',
    borderRadius: 14,
    padding: 8,
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  reelsThumbWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#E8DDD0',
  },
  reelsThumbImg: {
    width: '100%',
    height: '100%',
  },
  reelsPlayDisc: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginTop: -10,
    marginLeft: -10,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
  },
  reelsTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1A1412',
  },
  reelsSub: {
    fontSize: 11,
    color: '#70645C',
    marginTop: 1,
  },
});

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 24,
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 16,
    shadowColor: '#2D1B0B',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 12,
  },
  headerRow: {
    flexDirection: 'row',
    gap: 14,
  },
  imageCol: {
    width: 130,
  },
  thumbnail: {
    width: 130,
    height: 190,
    borderRadius: 16,
    backgroundColor: '#E8DDD0',
  },
  noImageThumbnail: {
    width: 130,
    height: 190,
    borderRadius: 16,
    backgroundColor: '#FAF8F5',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E8DDD0',
  },
  placeholderPlus: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: COLORS.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerInfo: {
    flex: 1,
    minWidth: 0,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 6,
  },
  title: {
    flex: 1,
    fontSize: 20,
    fontFamily: serif,
    fontWeight: '700',
    color: COLORS.textPrimary,
    lineHeight: 24,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#F5F2EE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
    marginBottom: 6,
  },
  metaText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    flex: 1,
  },
  description: {
    fontSize: 12.5,
    color: COLORS.textBody,
    lineHeight: 17,
    marginBottom: 4,
  },
  readMore: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.gold,
  },
  infoCard: {
    backgroundColor: COLORS.cardBg,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  infoItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  infoIconDisc: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: COLORS.iconDiscBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  infoTextCol: {
    justifyContent: 'center',
  },
  infoValue: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  infoLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 1,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  actionPillBtn: {
    flex: 1,
    backgroundColor: COLORS.btnBg,
    borderWidth: 1,
    borderColor: COLORS.btnBorder,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  actionPillDisabled: {
    opacity: 0.6,
  },
  actionPillText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
});
