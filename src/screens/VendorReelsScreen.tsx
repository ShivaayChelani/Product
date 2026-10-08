import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, StatusBar, Platform,
  ActivityIndicator, FlatList, Image, RefreshControl,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useBottomSafePadding } from '../design/responsive';
import { vendorsApi } from '../services/api/vendors';
import { normalizeReelCaption } from '../components/reels/reelCaptionUtils';

interface VendorReelItem {
  id: string;
  videoUrl: string;
  thumbnail?: string | null;
  title?: string | null;
  description?: string | null;
  likes?: number;
  views?: number;
  createdAt?: string;
}

interface VendorReelsScreenProps {
  vendorId: string;
  vendorName: string;
  onBack: () => void;
  onOpenReel?: (reelId: string, extras?: { reels?: any[]; initialIndex?: number }) => void;
}

export default function VendorReelsScreen({
  vendorId,
  vendorName,
  onBack,
  onOpenReel,
}: VendorReelsScreenProps) {
  // Stack screen (RootNavigator) — not a VendorTabs child; use safe bottom only
  const listPadBottom = useBottomSafePadding(24);
  const [reels, setReels] = useState<VendorReelItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [vendorReels, tagged] = await Promise.all([
        vendorsApi.getVendorReels(vendorId).catch(() => []),
        vendorsApi.getTaggedCreatorReels(vendorId).catch(() => ({
          reels: [],
          pending: [],
          isOwner: false,
        })),
      ]);
      const promoItems: VendorReelItem[] = (Array.isArray(vendorReels) ? vendorReels : []).map((r) => ({
        id: r.id,
        videoUrl: r.videoUrl,
        thumbnail: r.thumbnail,
        title: r.title,
        description: r.description,
        likes: r.likes,
        views: r.views,
        createdAt: r.createdAt,
      }));
      const taggedItems: VendorReelItem[] = (tagged.reels || []).map((r) => ({
        id: r.id,
        videoUrl: r.videoUrl,
        thumbnail: r.thumbnail,
        title: r.title || `@${r.creator.username}`,
        description: r.description,
        createdAt: r.createdAt,
      }));
      const seen = new Set<string>();
      const combined = [...promoItems, ...taggedItems].filter((item) => {
        if (!item.id || seen.has(item.id)) return false;
        seen.add(item.id);
        return true;
      });
      setReels(combined);
    } catch {
      setError('Failed to load vendor reels');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [vendorId]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Icon name="arrow-back" size={22} color="#000000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{vendorName}</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#111111" />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={load}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={reels}
          keyExtractor={(item) => item.id}
          contentContainerStyle={
            reels.length === 0
              ? styles.centered
              : [styles.list, { paddingBottom: listPadBottom }]
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); load(); }}
              tintColor="#111111"
            />
          }
          ListEmptyComponent={
            <View style={styles.centered}>
              <Icon name="videocam-outline" size={48} color="#6B6B6B" />
              <Text style={styles.emptyTitle}>No reels yet</Text>
              <Text style={styles.emptyText}>Published business reels and allowed creator reels will show up here.</Text>
            </View>
          }
          renderItem={({ item, index }) => (
            <TouchableOpacity
              style={styles.card}
              activeOpacity={0.85}
              onPress={() => onOpenReel?.(item.id, { reels: reels as any, initialIndex: index })}
            >
              {item.thumbnail ? (
                <Image source={{ uri: item.thumbnail }} style={styles.thumb} />
              ) : (
                <View style={[styles.thumb, styles.thumbPlaceholder]}>
                  <Icon name="play-circle" size={36} color="#111111" />
                </View>
              )}
              <View style={styles.cardBody}>
                <Text style={styles.cardTitle} numberOfLines={2}>
                  {item.title || normalizeReelCaption(item.description) || 'Vendor reel'}
                </Text>
                <Text style={styles.cardMeta}>
                  {(item.views || 0).toLocaleString()} views · {(item.likes || 0).toLocaleString()} likes
                </Text>
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  header: {
    paddingTop: Platform.OS === 'ios' ? 54 : 36,
    paddingBottom: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(183,121,31,0.15)',
    backgroundColor: '#FFFFFF',
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '800',
    color: '#000000',
  },
  centered: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  list: { padding: 16 },
  errorText: { color: '#C94A4A', marginBottom: 12, textAlign: 'center' },
  retryBtn: {
    backgroundColor: '#111111',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 16,
  },
  retryText: { color: '#FFFFFF', fontWeight: '700' },
  emptyTitle: { color: '#000000', fontSize: 18, fontWeight: '800', marginTop: 12 },
  emptyText: { color: '#6B6B6B', textAlign: 'center', marginTop: 6 },
  card: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(183,121,31,0.12)',
  },
  thumb: { width: 96, height: 96 },
  thumbPlaceholder: {
    backgroundColor: '#F7F6F1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardBody: { flex: 1, padding: 12, justifyContent: 'center' },
  cardTitle: { fontSize: 14, fontWeight: '700', color: '#000000' },
  cardMeta: { fontSize: 12, color: '#6B6B6B', marginTop: 6 },
});
