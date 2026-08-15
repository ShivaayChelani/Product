import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, StatusBar, Alert, RefreshControl, Image } from 'react-native';
import { colors, spacing, borderRadius } from '../config/theme';
import { MaterialIcons } from '../utils/Icons';
import { PlaceResponse, placesApi } from '../services/api/places';
import { launchImageLibrary } from 'react-native-image-picker';
import { uploadApi } from '../services/api/upload';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBottomSafePadding } from '../design/responsive';

interface AdminPlacesReviewScreenProps {
  onBack: () => void;
  onNavigateCreate?: () => void;
}

export default function AdminPlacesReviewScreen({ onBack, onNavigateCreate }: AdminPlacesReviewScreenProps) {
  const insets = useSafeAreaInsets();
  const contentPadBottom = useBottomSafePadding(24);
  const [places, setPlaces] = useState<PlaceResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const fetchPlaces = useCallback(async () => {
    try {
      const data = await placesApi.getAdminPending(1, 100);
      setPlaces(data || []);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to load places');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchPlaces();
  }, [fetchPlaces]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchPlaces();
  }, [fetchPlaces]);

  const handleApprove = async (id: string) => {
    setActionLoadingId(id);
    try {
      await placesApi.adminApprove(id);
      Alert.alert('Approved!', 'Place has been approved and is now live.');
      fetchPlaces();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to approve');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleReject = async (id: string) => {
    setActionLoadingId(id);
    try {
      await placesApi.adminReject(id);
      Alert.alert('Rejected', 'Place has been rejected.');
      fetchPlaces();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to reject');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handlePickImage = async (placeId: string) => {
    try {
      const result = await launchImageLibrary({
        mediaType: 'photo',
        quality: 0.7,
        selectionLimit: 1,
      });

      if (result.didCancel || !result.assets || result.assets.length === 0) {
        return;
      }

      const uri = result.assets[0].uri;
      if (!uri) return;
      
      setActionLoadingId(placeId);
      
      // Upload to storage
      const uploadRes = await uploadApi.uploadImage(uri);
      
      // Add to place
      await placesApi.addImage(placeId, uploadRes.url, 'Cover image', true);
      
      Alert.alert('Success', 'Image uploaded successfully!');
      fetchPlaces(); // Refresh list to see the new image
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to upload image');
    } finally {
      setActionLoadingId(null);
    }
  };

  const pendingPlaces = useMemo(() => places.filter(p => p.status === 'PENDING'), [places]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) }]}>
        <TouchableOpacity onPress={onBack}>
          <MaterialIcons name="arrow-back" size={24} color={colors.primaryLight} />
        </TouchableOpacity>
        <Text style={styles.title}>Review Curated Places</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={{ paddingBottom: contentPadBottom }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[colors.primary]}
            progressViewOffset={60}
          />
        }
      >
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={[styles.statValue, { color: colors.warning }]}>{pendingPlaces.length}</Text>
            <Text style={styles.statLabel}>Pending Reviews</Text>
          </View>
        </View>

        {loading && (
          <View style={styles.loadingContainer}>
            <Text style={styles.loadingText}>Loading places...</Text>
          </View>
        )}

        <Text style={styles.sectionTitle}>⏳ Pending Genuine Places</Text>
        {!loading && pendingPlaces.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>✅</Text>
            <Text style={styles.emptyText}>All caught up!</Text>
          </View>
        ) : (
          pendingPlaces.map((place) => (
            <View key={place.id} style={styles.placeCard}>
              {place.images && place.images.length > 0 ? (
                <Image source={{ uri: place.images[0] }} style={styles.placeImage} />
              ) : (
                <View style={styles.noImageContainer}>
                  <MaterialIcons name="image" size={40} color={colors.textMuted} />
                  <Text style={styles.noImageText}>No Image Yet</Text>
                </View>
              )}
              
              <View style={styles.cardContent}>
                <View style={styles.titleRow}>
                  <Text style={styles.placeName}>{place.name}</Text>
                  <View style={styles.categoryBadge}>
                    <Text style={styles.categoryText}>{place.category.toLowerCase()}</Text>
                  </View>
                </View>

                <Text style={styles.placeDetail}>📍 {place.city}, {place.state}</Text>
                {place.description && (
                  <Text style={styles.descText} numberOfLines={3}>{place.description}</Text>
                )}

                <View style={styles.actionRow}>
                  <TouchableOpacity 
                    style={styles.uploadBtn} 
                    onPress={() => handlePickImage(place.id)}
                    disabled={actionLoadingId === place.id}
                  >
                    <MaterialIcons name="add-photo-alternate" size={18} color={colors.primaryLight} />
                    <Text style={styles.uploadBtnText}>Add Media</Text>
                  </TouchableOpacity>

                  <View style={styles.decisionActions}>
                    <TouchableOpacity 
                      style={styles.approveBtn} 
                      onPress={() => handleApprove(place.id)}
                      disabled={actionLoadingId === place.id}
                    >
                      <MaterialIcons name="check" size={18} color="#fff" />
                    </TouchableOpacity>
                    
                    <TouchableOpacity 
                      style={styles.rejectBtn} 
                      onPress={() => handleReject(place.id)}
                      disabled={actionLoadingId === place.id}
                    >
                      <MaterialIcons name="close" size={18} color={colors.danger} />
                    </TouchableOpacity>
                  </View>
                </View>
                {actionLoadingId === place.id && (
                  <Text style={styles.loadingStatusText}>Processing...</Text>
                )}
              </View>
            </View>
          ))
        )}
      </ScrollView>
      {onNavigateCreate && (
        <TouchableOpacity style={[styles.fab, { bottom: contentPadBottom + 16 }]} onPress={onNavigateCreate}>
          <MaterialIcons name="add" size={24} color={colors.white} />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.md, paddingTop: 0 },
  title: { fontSize: 20, fontWeight: 'bold', color: colors.text },
  content: { flex: 1, padding: spacing.lg },
  statsRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  fab: {
    position: 'absolute',
    right: spacing.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  statCard: { flex: 1, backgroundColor: colors.surface, borderRadius: borderRadius.md, padding: spacing.md, alignItems: 'center' },
  statValue: { fontSize: 24, fontWeight: 'bold' },
  statLabel: { fontSize: 12, color: colors.textSecondary, marginTop: spacing.xs },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: colors.text, marginBottom: spacing.md, marginTop: spacing.md },
  
  placeCard: { backgroundColor: colors.surface, borderRadius: borderRadius.md, marginBottom: spacing.md, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
  placeImage: { width: '100%', height: 160, backgroundColor: colors.surfaceLight, resizeMode: 'cover' },
  noImageContainer: { width: '100%', height: 160, backgroundColor: colors.surfaceLight, justifyContent: 'center', alignItems: 'center' },
  noImageText: { color: colors.textMuted, marginTop: 8, fontSize: 14 },
  cardContent: { padding: spacing.md },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.xs },
  placeName: { fontSize: 16, fontWeight: 'bold', color: colors.text, flex: 1, marginRight: 8 },
  categoryBadge: { backgroundColor: colors.primary + '30', paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: borderRadius.sm },
  categoryText: { fontSize: 10, color: colors.primaryLight, fontWeight: '600', textTransform: 'capitalize' },
  placeDetail: { fontSize: 12, color: colors.textMuted, marginBottom: spacing.xs },
  descText: { fontSize: 12, color: colors.textSecondary, marginTop: 4, lineHeight: 18, marginBottom: spacing.md },
  
  actionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  uploadBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 12, backgroundColor: colors.surfaceLight, borderRadius: borderRadius.sm },
  uploadBtnText: { color: colors.primaryLight, fontSize: 13, fontWeight: '600' },
  decisionActions: { flexDirection: 'row', gap: 8 },
  approveBtn: { backgroundColor: colors.success, padding: 8, borderRadius: borderRadius.sm, alignItems: 'center', justifyContent: 'center' },
  rejectBtn: { backgroundColor: 'transparent', padding: 8, borderRadius: borderRadius.sm, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.danger },
  loadingStatusText: { fontSize: 12, color: colors.primary, fontStyle: 'italic', marginTop: 8, textAlign: 'right' },

  emptyState: { alignItems: 'center', paddingVertical: spacing.xl, backgroundColor: colors.surface, borderRadius: borderRadius.md },
  emptyEmoji: { fontSize: 48, marginBottom: spacing.md },
  emptyText: { fontSize: 16, color: colors.success },
  loadingContainer: { alignItems: 'center', paddingVertical: spacing.xl, backgroundColor: colors.surface, borderRadius: borderRadius.md },
  loadingText: { fontSize: 16, color: colors.textSecondary },
});
