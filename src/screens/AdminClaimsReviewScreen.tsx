import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Image,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import Icon from 'react-native-vector-icons/Ionicons';

import { getAdminClaims, updateClaimStatus } from '../services/api/campaigns';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBottomSafePadding } from '../design/responsive';

interface AdminClaimsReviewScreenProps {
  onBack: () => void;
}

export default function AdminClaimsReviewScreen({ onBack }: AdminClaimsReviewScreenProps) {
  const insets = useSafeAreaInsets();
  const contentPadBottom = useBottomSafePadding(24);
  const [claims, setClaims] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const fetchClaims = useCallback(async () => {
    try {
      const res = await getAdminClaims();
      const items = Array.isArray(res) ? res : res?.data || res?.items || [];
      setClaims(items);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to load user reward claims');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchClaims();
  }, [fetchClaims]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchClaims();
  }, [fetchClaims]);

  const handleStatusChange = (claimId: string, currentStatus: string, nextStatus: string) => {
    Alert.alert(
      'Update Claim Status',
      `Mark this claim as ${nextStatus}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Update',
          onPress: async () => {
            setUpdatingId(claimId);
            try {
              await updateClaimStatus(claimId, nextStatus);
              Alert.alert('Updated', `Claim status set to ${nextStatus}`);
              fetchClaims();
            } catch (err: any) {
              Alert.alert('Error', err?.message || 'Failed to update claim status');
            } finally {
              setUpdatingId(null);
            }
          },
        },
      ],
    );
  };

  const getStatusColor = (status: string) => {
    switch (String(status).toUpperCase()) {
      case 'PENDING':
        return '#D97706';
      case 'APPROVED':
      case 'COMPLETED':
      case 'DISPATCHED':
        return '#059669';
      case 'REJECTED':
      case 'CANCELLED':
        return '#DC2626';
      default:
        return '#475569';
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1E293B" />
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) }]}>
        <TouchableOpacity onPress={onBack}>
          <MaterialIcons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.title}>Reward Claims Dashboard</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={{ paddingBottom: contentPadBottom }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#B9834B']} />
        }
      >
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={[styles.statValue, { color: '#D97706' }]}>
              {claims.filter((c) => c.status === 'PENDING').length}
            </Text>
            <Text style={styles.statLabel}>Pending Claims</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statValue, { color: '#059669' }]}>
              {claims.filter((c) => ['APPROVED', 'COMPLETED', 'DISPATCHED'].includes(c.status)).length}
            </Text>
            <Text style={styles.statLabel}>Dispatched</Text>
          </View>
        </View>

        {loading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator color="#B9834B" />
            <Text style={styles.loadingText}>Loading reward claims…</Text>
          </View>
        )}

        {!loading && claims.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>🎁</Text>
            <Text style={styles.emptyText}>No reward claims submitted yet.</Text>
          </View>
        ) : (
          claims.map((claim) => {
            const statusColor = getStatusColor(claim.status);
            const userEmail = claim.user?.email || 'N/A';
            const userName = claim.user?.name || 'User';
            const campaignName = claim.campaign?.name || 'Reward Campaign';

            return (
              <View key={claim.id} style={styles.claimCard}>
                <View style={styles.cardHeader}>
                  <View style={styles.campaignMeta}>
                    {claim.campaign?.imageUrl ? (
                      <Image source={{ uri: claim.campaign.imageUrl }} style={styles.campaignThumb} />
                    ) : (
                      <View style={[styles.campaignThumb, styles.campaignThumbFallback]}>
                        <Icon name="gift-outline" size={20} color="#B9834B" />
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.campaignTitle} numberOfLines={1}>
                        {campaignName}
                      </Text>
                      <Text style={styles.redemptionId}>ID: {claim.redemptionId || claim.id}</Text>
                    </View>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
                    <Text style={[styles.statusText, { color: statusColor }]}>{claim.status}</Text>
                  </View>
                </View>

                <View style={styles.detailsBox}>
                  <Text style={styles.detailRow}>
                    👤 <Text style={styles.detailBold}>User:</Text> {userName} ({userEmail})
                  </Text>
                  <Text style={styles.detailRow}>
                    🪙 <Text style={styles.detailBold}>Points Deducted:</Text> {claim.pointsSpent || 0} pts
                  </Text>
                  <Text style={styles.detailRow}>
                    📅 <Text style={styles.detailBold}>Claimed Date:</Text>{' '}
                    {new Date(claim.claimedAt || claim.createdAt).toLocaleString('en-IN')}
                  </Text>
                  {claim.notes ? (
                    <View style={styles.notesWrap}>
                      <Text style={styles.notesLabel}>Shipping & Delivery Details:</Text>
                      <Text style={styles.notesText}>{claim.notes}</Text>
                    </View>
                  ) : null}
                </View>

                <View style={styles.actionRow}>
                  {claim.status === 'PENDING' ? (
                    <>
                      <TouchableOpacity
                        style={[styles.actionBtn, styles.approveBtn]}
                        onPress={() => handleStatusChange(claim.id, claim.status, 'DISPATCHED')}
                        disabled={updatingId === claim.id}
                      >
                        <Text style={styles.actionBtnText}>
                          {updatingId === claim.id ? 'Updating…' : 'Mark Dispatched'}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.actionBtn, styles.rejectBtn]}
                        onPress={() => handleStatusChange(claim.id, claim.status, 'CANCELLED')}
                        disabled={updatingId === claim.id}
                      >
                        <Text style={[styles.actionBtnText, { color: '#DC2626' }]}>Cancel Claim</Text>
                      </TouchableOpacity>
                    </>
                  ) : (
                    <TouchableOpacity
                      style={[styles.actionBtn, styles.completeBtn]}
                      onPress={() => handleStatusChange(claim.id, claim.status, 'COMPLETED')}
                      disabled={updatingId === claim.id || claim.status === 'COMPLETED'}
                    >
                      <Text style={styles.actionBtnText}>
                        {claim.status === 'COMPLETED' ? 'Completed' : 'Mark Completed'}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 16,
    backgroundColor: '#1E293B',
  },
  title: { fontSize: 18, fontWeight: '800', color: '#FFF' },
  content: { flex: 1, padding: 16 },
  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  statCard: {
    flex: 1,
    backgroundColor: '#1E293B',
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
  },
  statValue: { fontSize: 22, fontWeight: '800' },
  statLabel: { fontSize: 11, color: '#94A3B8', marginTop: 2 },
  loadingContainer: { alignItems: 'center', paddingVertical: 40, gap: 10 },
  loadingText: { color: '#94A3B8', fontSize: 14 },
  emptyState: { alignItems: 'center', paddingVertical: 40, gap: 10 },
  emptyEmoji: { fontSize: 40 },
  emptyText: { color: '#94A3B8', fontSize: 14 },
  claimCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 },
  campaignMeta: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  campaignThumb: { width: 42, height: 42, borderRadius: 8, backgroundColor: '#334155' },
  campaignThumbFallback: { justifyContent: 'center', alignItems: 'center' },
  campaignTitle: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  redemptionId: { color: '#94A3B8', fontSize: 11, marginTop: 2 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusText: { fontSize: 11, fontWeight: '800' },
  detailsBox: {
    backgroundColor: '#0F172A',
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
    gap: 6,
  },
  detailRow: { color: '#CBD5E1', fontSize: 12, lineHeight: 18 },
  detailBold: { fontWeight: '700', color: '#FFF' },
  notesWrap: { marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)' },
  notesLabel: { color: '#B9834B', fontSize: 11, fontWeight: '800', marginBottom: 2 },
  notesText: { color: '#E2E8F0', fontSize: 12, lineHeight: 18 },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  actionBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  approveBtn: { backgroundColor: '#059669' },
  rejectBtn: { backgroundColor: 'rgba(220,38,38,0.12)', borderWidth: 1, borderColor: '#DC2626' },
  completeBtn: { backgroundColor: '#3B82F6' },
  actionBtnText: { color: '#FFF', fontSize: 13, fontWeight: '800' },
});
