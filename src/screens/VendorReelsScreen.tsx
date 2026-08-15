import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, StatusBar, Platform,
  ActivityIndicator, FlatList, Image, RefreshControl,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useBottomSafePadding } from '../design/responsive';
import { vendorsApi } from '../services/api/vendors';

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
}

export default function VendorReelsScreen({
  vendorId,
  vendorName,
  onBack,
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
      const tagged = await vendorsApi.getTaggedCreatorReels(vendorId).catch(() => ({
        reels: [],
        pending: [],
        isOwner: false,
      }));
      const taggedItems: VendorReelItem[] = (tagged.reels || []).map((r) => ({
        id: r.id,
        videoUrl: r.videoUrl,
        thumbnail: r.thumbnail,
        title: r.title || `@${r.creator.username}`,
        description: r.description,
        createdAt: r.createdAt,
      }));
      setReels(taggedItems);
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
          <Icon name="arrow-back" size={22} color="#2C1810" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{vendorName}</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#B9834B" />
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
              tintColor="#B9834B"
            />
          }
          ListEmptyComponent={
            <View style={styles.centered}>
              <Icon name="videocam-outline" size={48} color="#B8A88A" />
              <Text style={styles.emptyTitle}>No creator reels yet</Text>
              <Text style={styles.emptyText}>Allowed creator reels for this business will show up here.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              {item.thumbnail ? (
                <Image source={{ uri: item.thumbnail }} style={styles.thumb} />
              ) : (
                <View style={[styles.thumb, styles.thumbPlaceholder]}>
                  <Icon name="play-circle" size={36} color="#B9834B" />
                </View>
              )}
              <View style={styles.cardBody}>
                <Text style={styles.cardTitle} numberOfLines={2}>
                  {item.title || item.description || 'Vendor reel'}
                </Text>
                <Text style={styles.cardMeta}>
                  {(item.views || 0).toLocaleString()} views · {(item.likes || 0).toLocaleString()} likes
                </Text>
              </View>
            </View>
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
    borderBottomColor: 'rgba(200,155,60,0.15)',
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
    color: '#2C1810',
  },
  centered: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  list: { padding: 16 },
  errorText: { color: '#FF5A5F', marginBottom: 12, textAlign: 'center' },
  retryBtn: {
    backgroundColor: '#B9834B',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 16,
  },
  retryText: { color: '#FFFFFF', fontWeight: '700' },
  emptyTitle: { color: '#2C1810', fontSize: 18, fontWeight: '800', marginTop: 12 },
  emptyText: { color: '#8B7355', textAlign: 'center', marginTop: 6 },
  card: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(185,131,75,0.12)',
  },
  thumb: { width: 96, height: 96 },
  thumbPlaceholder: {
    backgroundColor: '#F9F9F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardBody: { flex: 1, padding: 12, justifyContent: 'center' },
  cardTitle: { fontSize: 14, fontWeight: '700', color: '#2C1810' },
  cardMeta: { fontSize: 12, color: '#8B7355', marginTop: 6 },
});
