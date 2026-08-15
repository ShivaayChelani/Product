import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, StatusBar, Alert, TextInput, RefreshControl } from 'react-native';
import { colors, spacing, borderRadius } from '../config/theme';
import { MaterialIcons } from '../utils/Icons';
import { HiddenGemSubmission } from '../types';
import { hiddenGemsApi } from '../services/api';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBottomSafePadding } from '../design/responsive';

interface AdminHiddenGemReviewScreenProps {
  onBack: () => void;
}

export default function AdminHiddenGemReviewScreen({ onBack }: AdminHiddenGemReviewScreenProps) {
  const insets = useSafeAreaInsets();
  const contentPadBottom = useBottomSafePadding(24);
  const [submissions, setSubmissions] = useState<HiddenGemSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [showQualityMenu, setShowQualityMenu] = useState<string | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [rejectingIdLoading, setRejectingIdLoading] = useState<string | null>(null);

  const fetchSubmissions = useCallback(async () => {
    try {
      const [pendingRes, approvedRes, rejectedRes] = await Promise.all([
        hiddenGemsApi.list({ status: 'pending' }),
        hiddenGemsApi.list({ status: 'approved', limit: 50 }),
        hiddenGemsApi.list({ status: 'rejected', limit: 50 }),
      ]);
      const merged = [
        ...(pendingRes.data || []),
        ...(approvedRes.data || []),
        ...(rejectedRes.data || []),
      ];
      const byId = new Map<string, HiddenGemSubmission>();
      for (const item of merged) byId.set(item.id, item);
      setSubmissions(Array.from(byId.values()));
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to load submissions');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchSubmissions();
  }, [fetchSubmissions]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchSubmissions();
  }, [fetchSubmissions]);

  const pendingSubmissions = useMemo(() => submissions.filter(s => s.status === 'pending'), [submissions]);
  const approvedSubmissions = useMemo(() => submissions.filter(s => s.status === 'approved'), [submissions]);
  const rejectedSubmissions = useMemo(() => submissions.filter(s => s.status === 'rejected'), [submissions]);

  const _checkDuplicates = (submission: HiddenGemSubmission): HiddenGemSubmission | undefined => {
    const byName = submissions.find(s => 
      s.id !== submission.id &&
      s.status === 'approved' &&
      s.placeName.toLowerCase() === submission.placeName.toLowerCase() &&
      s.city.toLowerCase() === submission.city.toLowerCase()
    );
    if (byName) return byName;

    const byCoords = submissions.find(s =>
      s.id !== submission.id &&
      s.status === 'approved' &&
      Math.abs(s.latitude - submission.latitude) < 0.001 &&
      Math.abs(s.longitude - submission.longitude) < 0.001
    );
    return byCoords;
  };

  const handleApprove = (submissionId: string) => {
    setShowQualityMenu(submissionId);
  };

  const confirmApprove = async (points: number) => {
    if (!showQualityMenu) return;
    setApprovingId(showQualityMenu);
    try {
      await hiddenGemsApi.approve(showQualityMenu, { points });
      Alert.alert('Approved!', `Hidden gem approved with ${points} Pal Points!`);
      fetchSubmissions();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to approve');
    } finally {
      setShowQualityMenu(null);
      setApprovingId(null);
    }
  };

  const handleReject = (submissionId: string) => {
    setRejectingId(submissionId);
    setRejectReason('');
  };

  const confirmReject = async () => {
    if (!rejectingId) return;
    setRejectingIdLoading(rejectingId);
    try {
      await hiddenGemsApi.reject(rejectingId, { reason: rejectReason.trim() || undefined });
      Alert.alert('Rejected', 'Hidden gem has been rejected');
      fetchSubmissions();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to reject');
    } finally {
      setRejectingId(null);
      setRejectingIdLoading(null);
      setRejectReason('');
    }
  };

  const getCategoryEmoji = (category: string): string => {
    const emojiMap: Record<string, string> = {
      waterfall: '💧', sunset_point: '🌅', old_temple: '🛕', local_viewpoint: '🏔️',
      photo_spot: '📸', river_ghat: '🌊', small_fort: '🏰', nature_trail: '🌲',
      cultural_place: '🎭', lake: '🏞️', cave: '🕳️', wildlife: '🦌', heritage: '🏛️', other: '📍',
    };
    return emojiMap[category] || '📍';
  };

  const formatDate = (timestamp: number): string => {
    return new Date(timestamp).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) }]}>
        <TouchableOpacity onPress={onBack}>
          <MaterialIcons name="arrow-back" size={24} color={colors.primaryLight} />
        </TouchableOpacity>
        <Text style={styles.title}>Hidden Gems Review</Text>
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
            <Text style={[styles.statValue, { color: colors.warning }]}>{pendingSubmissions.length}</Text>
            <Text style={styles.statLabel}>Pending</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statValue, { color: colors.success }]}>{approvedSubmissions.length}</Text>
            <Text style={styles.statLabel}>Approved</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statValue, { color: colors.danger }]}>{rejectedSubmissions.length}</Text>
            <Text style={styles.statLabel}>Rejected</Text>
          </View>
        </View>

        {loading && (
          <View style={styles.loadingContainer}>
            <Text style={styles.loadingText}>Loading submissions...</Text>
          </View>
        )}

        <Text style={styles.sectionTitle}>⏳ Pending Reviews</Text>
        {!loading && pendingSubmissions.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>✅</Text>
            <Text style={styles.emptyText}>No pending submissions!</Text>
          </View>
        ) : (
          pendingSubmissions.map((sub) => (
            <View key={sub.id} style={styles.submissionCard}>
              <View style={styles.submissionHeader}>
                <View style={styles.subTitleRow}>
                  <Text style={styles.subEmoji}>{getCategoryEmoji(sub.category)}</Text>
                  <Text style={styles.subName}>{sub.placeName}</Text>
                </View>
                <View style={styles.categoryBadge}>
                  <Text style={styles.categoryText}>{sub.category.replace(/_/g, ' ')}</Text>
                </View>
              </View>

              <View style={styles.subDetails}>
                <Text style={styles.subDetail}>📍 {sub.city}, {sub.state}</Text>
                <Text style={styles.subDetail}>📌 {sub.latitude.toFixed(4)}, {sub.longitude.toFixed(4)}</Text>
                {sub.locationMethod === 'gps' && <Text style={styles.subDetail}>📍 Used GPS Location</Text>}
                <Text style={styles.subDetail}>👤 Submitted by: {sub.userName}</Text>
                <Text style={styles.subDetail}>📅 {formatDate(sub.submittedAt)}</Text>
              </View>

              <View style={styles.subDescription}>
                <Text style={styles.descLabel}>Description:</Text>
                <Text style={styles.descText}>{sub.description}</Text>
              </View>

              {sub.worthVisitingReason && (
                <View style={styles.subDescription}>
                  <Text style={styles.descLabel}>Why worth visiting:</Text>
                  <Text style={styles.descText}>{sub.worthVisitingReason}</Text>
                </View>
              )}

              {sub.bestTimeToVisit && (
                <Text style={styles.subDetail}>
                  ⏰ Best time: {typeof sub.bestTimeToVisit === 'string'
                    ? sub.bestTimeToVisit
                    : sub.bestTimeToVisit.label
                      ? `${sub.bestTimeToVisit.label} (${sub.bestTimeToVisit.from} – ${sub.bestTimeToVisit.to})`
                      : `${sub.bestTimeToVisit.from} – ${sub.bestTimeToVisit.to}`}
                </Text>
              )}
              {sub.estimatedCost && sub.estimatedCost !== 'Free' && (
                <Text style={styles.subDetail}>💰 Cost: {sub.estimatedCost}</Text>
              )}
              {sub.safetyTip && sub.safetyTip !== 'None' && (
                <Text style={styles.subDetail}>⚠️ Safety: {sub.safetyTip}</Text>
              )}

              {showQualityMenu === sub.id ? (
                <View style={styles.qualityMenu}>
                  <Text style={styles.qualityTitle}>Select Reward Quality:</Text>
                  <TouchableOpacity style={styles.qualityOption} onPress={() => confirmApprove(50)} disabled={approvingId === sub.id}>
                    <Text style={styles.qualityOptionText}>{approvingId === sub.id ? 'Approving...' : 'Basic (50 pts)'}</Text>
                    <Text style={styles.qualityHint}>Valid place</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.qualityOption} onPress={() => confirmApprove(100)} disabled={approvingId === sub.id}>
                    <Text style={styles.qualityOptionText}>{approvingId === sub.id ? 'Approving...' : 'Good (100 pts)'}</Text>
                    <Text style={styles.qualityHint}>+ Image or description</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.qualityOption} onPress={() => confirmApprove(150)} disabled={approvingId === sub.id}>
                    <Text style={styles.qualityOptionText}>{approvingId === sub.id ? 'Approving...' : 'High Quality (150 pts)'}</Text>
                    <Text style={styles.qualityHint}>Image + good description</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowQualityMenu(null)} disabled={approvingId === sub.id}>
                    <Text style={styles.cancelBtnText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              ) : rejectingId === sub.id ? (
                <View style={styles.rejectForm}>
                  <TextInput
                    style={styles.rejectInput}
                    placeholder="Reason for rejection..."
                    placeholderTextColor={colors.textMuted}
                    value={rejectReason}
                    onChangeText={setRejectReason}
                    multiline
                    editable={rejectingIdLoading !== sub.id}
                  />
                  <View style={styles.rejectActions}>
                    <TouchableOpacity style={styles.cancelRejectBtn} onPress={() => setRejectingId(null)} disabled={rejectingIdLoading === sub.id}>
                      <Text style={styles.cancelRejectText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.confirmRejectBtn} onPress={confirmReject} disabled={rejectingIdLoading === sub.id}>
                      <Text style={styles.confirmRejectText}>{rejectingIdLoading === sub.id ? 'Rejecting...' : 'Confirm Reject'}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <View style={styles.actionRow}>
                  <TouchableOpacity style={styles.approveButton} onPress={() => handleApprove(sub.id)} disabled={approvingId === sub.id}>
                    <MaterialIcons name="check" size={18} color="#fff" />
                    <Text style={styles.approveText}>{approvingId === sub.id ? 'Approving...' : 'Approve'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.rejectButton} onPress={() => handleReject(sub.id)} disabled={rejectingIdLoading === sub.id}>
                    <MaterialIcons name="close" size={18} color={colors.danger} />
                    <Text style={styles.rejectText}>{rejectingIdLoading === sub.id ? 'Rejecting...' : 'Reject'}</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ))
        )}

        {approvedSubmissions.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>✅ Approved ({approvedSubmissions.length})</Text>
            {approvedSubmissions.map((sub) => (
              <View key={sub.id} style={[styles.submissionCard, styles.approvedCard]}>
                <View style={styles.subTitleRow}>
                  <Text style={styles.subEmoji}>{getCategoryEmoji(sub.category)}</Text>
                  <Text style={styles.subName}>{sub.placeName}</Text>
                </View>
                <Text style={styles.subDetail}>📍 {sub.city}, {sub.state}</Text>
                <Text style={styles.subDetail}>🏆 Awarded: {sub.pointsReward} Pal Points</Text>
              </View>
            ))}
          </>
        )}

        {rejectedSubmissions.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>❌ Rejected ({rejectedSubmissions.length})</Text>
            {rejectedSubmissions.map((sub) => (
              <View key={sub.id} style={[styles.submissionCard, styles.rejectedCard]}>
                <View style={styles.subTitleRow}>
                  <Text style={styles.subEmoji}>{getCategoryEmoji(sub.category)}</Text>
                  <Text style={styles.subName}>{sub.placeName}</Text>
                </View>
                <Text style={styles.subDetail}>📍 {sub.city}, {sub.state}</Text>
                {sub.rejectionReason && <Text style={styles.rejectionReason}>Reason: {sub.rejectionReason}</Text>}
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.md, paddingTop: 0 },
  title: { fontSize: 20, fontWeight: 'bold', color: colors.text },
  content: { flex: 1, padding: spacing.lg },
  statsRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  statCard: { flex: 1, backgroundColor: colors.surface, borderRadius: borderRadius.md, padding: spacing.md, alignItems: 'center' },
  statValue: { fontSize: 24, fontWeight: 'bold' },
  statLabel: { fontSize: 12, color: colors.textSecondary, marginTop: spacing.xs },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: colors.text, marginBottom: spacing.md, marginTop: spacing.md },
  submissionCard: { backgroundColor: colors.surface, borderRadius: borderRadius.md, padding: spacing.md, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.border },
  approvedCard: { borderLeftWidth: 3, borderLeftColor: colors.success },
  rejectedCard: { borderLeftWidth: 3, borderLeftColor: colors.danger },
  submissionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.sm },
  subTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 },
  subEmoji: { fontSize: 24 },
  subName: { fontSize: 16, fontWeight: 'bold', color: colors.text, flex: 1 },
  categoryBadge: { backgroundColor: colors.primary + '30', paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: borderRadius.sm },
  categoryText: { fontSize: 10, color: colors.primaryLight, fontWeight: '600', textTransform: 'capitalize' },
  subDetails: { marginBottom: spacing.sm },
  subDetail: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  subDescription: { marginTop: spacing.sm },
  descLabel: { fontSize: 12, color: colors.textSecondary, fontWeight: '600' },
  descText: { fontSize: 12, color: colors.textMuted, marginTop: 2, lineHeight: 18 },
  actionRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  approveButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.success, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: borderRadius.md, gap: spacing.xs },
  approveText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  rejectButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: borderRadius.md, gap: spacing.xs, borderWidth: 1, borderColor: colors.danger },
  rejectText: { color: colors.danger, fontSize: 14, fontWeight: '600' },
  rejectForm: { marginTop: spacing.sm },
  rejectInput: { backgroundColor: colors.surfaceLight, borderRadius: borderRadius.md, padding: spacing.md, color: colors.text, fontSize: 13, borderWidth: 1, borderColor: colors.danger, marginBottom: spacing.sm, textAlignVertical: 'top', minHeight: 60 },
  rejectActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm },
  cancelRejectBtn: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  cancelRejectText: { color: colors.textMuted, fontSize: 13 },
  confirmRejectBtn: { backgroundColor: colors.danger, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: borderRadius.md },
  confirmRejectText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  qualityMenu: { marginTop: spacing.md, backgroundColor: colors.surfaceLight, borderRadius: borderRadius.md, padding: spacing.md },
  qualityTitle: { fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: spacing.sm },
  qualityOption: { paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  qualityOptionText: { fontSize: 14, color: colors.text, fontWeight: '600' },
  qualityHint: { fontSize: 11, color: colors.textMuted },
  cancelBtn: { marginTop: spacing.sm, paddingVertical: spacing.sm, alignItems: 'center' },
  cancelBtnText: { color: colors.textMuted, fontSize: 13 },
  rejectionReason: { fontSize: 12, color: colors.danger, marginTop: spacing.xs, fontStyle: 'italic' },
  emptyState: { alignItems: 'center', paddingVertical: spacing.xl, backgroundColor: colors.surface, borderRadius: borderRadius.md },
  emptyEmoji: { fontSize: 48, marginBottom: spacing.md },
  emptyText: { fontSize: 16, color: colors.success },
  loadingContainer: { alignItems: 'center', paddingVertical: spacing.xl, backgroundColor: colors.surface, borderRadius: borderRadius.md },
  loadingText: { fontSize: 16, color: colors.textSecondary },
});