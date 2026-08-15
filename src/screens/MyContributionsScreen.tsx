import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, StatusBar, ActivityIndicator, RefreshControl } from 'react-native';
import { colors, spacing, borderRadius } from '../config/theme';
import { MaterialIcons } from '../utils/Icons';
import { HiddenGemSubmission } from '../types';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBottomSafePadding } from '../design/responsive';
import { hiddenGemsApi } from '../services/api/hiddenGems';

interface MyContributionsScreenProps {
  onBack: () => void;
  userId: string;
  /** Optional offline seed; live data loads from API. */
  submissions?: HiddenGemSubmission[];
  onAddNew: () => void;
}

export default function MyContributionsScreen({
  onBack,
  userId,
  submissions: seedSubmissions = [],
  onAddNew,
}: MyContributionsScreenProps) {
  const insets = useSafeAreaInsets();
  const contentPadBottom = useBottomSafePadding(24);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [remote, setRemote] = useState<HiddenGemSubmission[]>([]);

  const load = useCallback(async () => {
    try {
      const [pending, approved, rejected] = await Promise.all([
        hiddenGemsApi.list({ status: 'pending', limit: 50 }),
        hiddenGemsApi.list({ status: 'approved', limit: 50 }),
        hiddenGemsApi.list({ status: 'rejected', limit: 50 }),
      ]);
      const rows = [
        ...(pending.data || []),
        ...(approved.data || []),
        ...(rejected.data || []),
      ] as HiddenGemSubmission[];
      setRemote(rows);
    } catch {
      // Keep seed/offline data on failure
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const mySubmissions = useMemo(() => {
    const source = remote.length > 0 ? remote : seedSubmissions;
    return source
      .filter((s) => !userId || s.userId === userId)
      .sort((a, b) => b.submittedAt - a.submittedAt);
  }, [remote, seedSubmissions, userId]);

  const pendingCount = useMemo(() => mySubmissions.filter((s) => s.status === 'pending').length, [mySubmissions]);
  const approvedCount = useMemo(() => mySubmissions.filter((s) => s.status === 'approved').length, [mySubmissions]);

  const totalPoints = useMemo(
    () =>
      mySubmissions
        .filter((s) => s.status === 'approved' || s.status === 'merged')
        .reduce((sum, s) => sum + (s.pointsReward || 0), 0),
    [mySubmissions],
  );

  const getCategoryEmoji = (category: string): string => {
    const emojiMap: Record<string, string> = {
      waterfall: '💧', sunset_point: '🌅', old_temple: '🛕', local_viewpoint: '🏔️',
      photo_spot: '📸', river_ghat: '🌊', small_fort: '🏰', nature_trail: '🌲',
      cultural_place: '🎭', lake: '🏞️', cave: '🕳️', wildlife: '🦌', heritage: '🏛️', other: '📍',
    };
    return emojiMap[category] || '📍';
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return { bg: colors.warning + '30', text: colors.warning, label: 'Pending Review' };
      case 'approved':
        return { bg: colors.success + '30', text: colors.success, label: 'Approved' };
      case 'rejected':
        return { bg: colors.danger + '30', text: colors.danger, label: 'Rejected' };
      case 'merged':
        return { bg: colors.primary + '30', text: colors.primary, label: 'Merged' };
      default:
        return { bg: colors.textMuted + '30', text: colors.textMuted, label: status };
    }
  };

  const formatDate = (timestamp: number): string => {
    return new Date(timestamp).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) }]}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack}>
          <MaterialIcons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Contributions</Text>
        <TouchableOpacity style={styles.addBtn} onPress={onAddNew}>
          <MaterialIcons name="add" size={24} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{pendingCount}</Text>
          <Text style={styles.statLabel}>Pending</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{approvedCount}</Text>
          <Text style={styles.statLabel}>Approved</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{totalPoints}</Text>
          <Text style={styles.statLabel}>Points</Text>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : (
        <ScrollView
          contentContainerStyle={[styles.list, { paddingBottom: contentPadBottom }]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void load();
              }}
            />
          }
        >
          {mySubmissions.length === 0 ? (
            <View style={styles.empty}>
              <MaterialIcons name="diamond" size={40} color={colors.textMuted} />
              <Text style={styles.emptyTitle}>No submissions yet</Text>
              <Text style={styles.emptySub}>Share a hidden gem to earn PalPoints</Text>
              <TouchableOpacity style={styles.cta} onPress={onAddNew}>
                <Text style={styles.ctaText}>Submit Hidden Gem</Text>
              </TouchableOpacity>
            </View>
          ) : (
            mySubmissions.map((s) => {
              const badge = getStatusBadge(s.status);
              return (
                <View key={s.id} style={styles.card}>
                  <View style={styles.cardTop}>
                    <Text style={styles.emoji}>{getCategoryEmoji(s.category)}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.placeName}>{s.placeName}</Text>
                      <Text style={styles.meta}>
                        {s.city}, {s.state} · {formatDate(s.submittedAt)}
                      </Text>
                    </View>
                    <View style={[styles.badge, { backgroundColor: badge.bg }]}>
                      <Text style={[styles.badgeText, { color: badge.text }]}>{badge.label}</Text>
                    </View>
                  </View>
                  {s.rejectionReason ? (
                    <Text style={styles.reason}>Reason: {s.rejectionReason}</Text>
                  ) : null}
                </View>
              );
            })
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  backBtn: { padding: 8 },
  addBtn: { padding: 8 },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '700', color: colors.text },
  statsRow: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.md, marginBottom: spacing.md },
  statCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    alignItems: 'center',
  },
  statValue: { fontSize: 18, fontWeight: '700', color: colors.text },
  statLabel: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  list: { padding: spacing.md },
  empty: { alignItems: 'center', marginTop: 60, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: colors.text },
  emptySub: { fontSize: 13, color: colors.textMuted },
  cta: {
    marginTop: 12,
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: borderRadius.md,
  },
  ctaText: { color: '#fff', fontWeight: '600' },
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  emoji: { fontSize: 22 },
  placeName: { fontSize: 15, fontWeight: '600', color: colors.text },
  meta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  badge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 },
  badgeText: { fontSize: 11, fontWeight: '600' },
  reason: { marginTop: 8, fontSize: 12, color: colors.danger },
});
