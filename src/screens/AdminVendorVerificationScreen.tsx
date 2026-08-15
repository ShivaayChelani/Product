import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, StatusBar, Alert, TextInput, RefreshControl } from 'react-native';
import { colors, spacing, borderRadius } from '../config/theme';
import { MaterialIcons } from '../utils/Icons';
import { vendorsApi, Vendor } from '../services/api';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBottomSafePadding } from '../design/responsive';

interface AdminVendorVerificationScreenProps {
  onBack: () => void;
  onLogout?: () => void;
  onNavigateHiddenGems?: () => void;
  onNavigatePlaces?: () => void;
  onNavigateClaims?: () => void;
  onNavigateReels?: () => void;
}

export default function AdminVendorVerificationScreen({
  onBack,
  onLogout,
  onNavigateHiddenGems,
  onNavigatePlaces,
  onNavigateClaims,
  onNavigateReels,
}: AdminVendorVerificationScreenProps) {
  const insets = useSafeAreaInsets();
  const contentPadBottom = useBottomSafePadding(24);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusTotals, setStatusTotals] = useState({ pending: 0, approved: 0, rejected: 0 });
  const [rejectReason, setRejectReason] = useState('');
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [rejectingIdLoading, setRejectingIdLoading] = useState<string | null>(null);

  const fetchVendors = useCallback(async () => {
    try {
      const [pendingRes, approvedRes, rejectedRes] = await Promise.all([
        vendorsApi.list({ status: 'PENDING', limit: 100 }),
        vendorsApi.list({ status: 'APPROVED', limit: 1 }),
        vendorsApi.list({ status: 'REJECTED', limit: 1 }),
      ]);
      setVendors(pendingRes.data || []);
      setStatusTotals({
        pending: pendingRes.pagination?.total ?? (pendingRes.data || []).length,
        approved: approvedRes.pagination?.total ?? 0,
        rejected: rejectedRes.pagination?.total ?? 0,
      });
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to load vendors');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchVendors();
  }, [fetchVendors]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchVendors();
  }, [fetchVendors]);

  const pendingVendors = useMemo(() => vendors.filter(p => p.status === 'PENDING'), [vendors]);
  const approvedVendors = useMemo(() => vendors.filter(p => p.status === 'APPROVED'), [vendors]);
  const rejectedVendors = useMemo(() => vendors.filter(p => p.status === 'REJECTED'), [vendors]);

  const handleApprove = (vendorId: string) => {
    Alert.alert('Approve Vendor', 'Are you sure you want to approve this vendor?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Approve', onPress: () => confirmApprove(vendorId) },
    ]);
  };

  const confirmApprove = async (vendorId: string) => {
    setApprovingId(vendorId);
    try {
      await vendorsApi.verify(vendorId, { status: 'APPROVED' });
      Alert.alert('Approved!', 'Vendor has been approved');
      fetchVendors();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to approve');
    } finally {
      setApprovingId(null);
    }
  };

  const handleReject = (vendorId: string) => {
    setRejectingId(vendorId);
    setRejectReason('');
  };

  const confirmReject = async () => {
    if (!rejectingId) return;
    setRejectingIdLoading(rejectingId);
    try {
      await vendorsApi.verify(rejectingId, { status: 'REJECTED', rejectionReason: rejectReason.trim() || undefined });
      Alert.alert('Rejected', 'Vendor has been rejected');
      fetchVendors();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to reject');
    } finally {
      setRejectingId(null);
      setRejectingIdLoading(null);
      setRejectReason('');
    }
  };

  const getLinkedSpotNames = (spotIds: string[]) => {
    return spotIds.length > 0 ? spotIds.join(', ') : 'None';
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) }]}>
        <TouchableOpacity onPress={onBack}>
          <MaterialIcons name="arrow-back" size={24} color={colors.primaryLight} />
        </TouchableOpacity>
        <Text style={styles.title}>Admin Verification</Text>
        {onLogout ? (
          <TouchableOpacity onPress={() => {
            Alert.alert('Log Out', 'Are you sure you want to log out?', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Log Out', style: 'destructive', onPress: onLogout },
            ]);
          }}>
            <MaterialIcons name="logout" size={22} color={colors.danger} />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 24 }} />
        )}
      </View>

      <View style={styles.quickNavSection}>
        <Text style={styles.quickNavSectionTitle}>Content</Text>
        <View style={styles.quickNavRow}>
          {onNavigatePlaces ? (
            <TouchableOpacity style={styles.quickNavBtn} onPress={onNavigatePlaces}>
              <Text style={styles.quickNavText}>Places</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity style={styles.quickNavBtn} onPress={() => { if (onNavigateReels) onNavigateReels(); }}>
            <Text style={styles.quickNavText}>All Reels</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.quickNavSection}>
        <Text style={styles.quickNavSectionTitle}>Community</Text>
        <View style={styles.quickNavRow}>
          {onNavigateHiddenGems ? (
            <TouchableOpacity style={styles.quickNavBtn} onPress={onNavigateHiddenGems}>
              <Text style={styles.quickNavText}>Hidden gems</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity style={styles.quickNavBtn} onPress={() => { if (onNavigateClaims) onNavigateClaims(); }}>
            <Text style={styles.quickNavText}>Reward claims</Text>
          </TouchableOpacity>
        </View>
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
        {loading && (
          <View style={styles.loadingContainer}>
            <Text style={styles.loadingText}>Loading vendors...</Text>
          </View>
        )}

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={[styles.statValue, { color: colors.warning }]}>{statusTotals.pending}</Text>
            <Text style={styles.statLabel}>Pending</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statValue, { color: colors.success }]}>{statusTotals.approved}</Text>
            <Text style={styles.statLabel}>Approved</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statValue, { color: colors.danger }]}>{statusTotals.rejected}</Text>
            <Text style={styles.statLabel}>Rejected</Text>
          </View>
        </View>

        {/* Pending Vendors */}
        <Text style={styles.sectionTitle}>⏳ Pending Registrations</Text>
        {!loading && pendingVendors.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>✅</Text>
            <Text style={styles.emptyText}>All vendors verified!</Text>
          </View>
        ) : (
          pendingVendors.map((vendor) => (
            <View key={vendor.id} style={styles.vendorCard}>
              <View style={styles.vendorInfo}>
                <View style={styles.nameRow}>
                  <Text style={styles.vendorName}>{vendor.businessName}</Text>
                  <View style={styles.categoryBadge}>
                    <Text style={styles.categoryText}>{vendor.businessType.replace(/_/g, ' ')}</Text>
                  </View>
                </View>
                <Text style={styles.vendorOwner}>Owner: {vendor.user?.name || 'N/A'}</Text>
                {vendor.user?.email && <Text style={styles.vendorDetail}>📧 {vendor.user.email}</Text>}
                {vendor.phone && <Text style={styles.vendorDetail}>📞 {vendor.phone}</Text>}
                <Text style={styles.vendorDetail}>📍 {vendor.city}, {vendor.state}</Text>
                <Text style={styles.vendorDetail}>🏠 {vendor.address}</Text>
                {vendor.description && <Text style={styles.vendorDesc}>{vendor.description}</Text>}
                {vendor.linkedSpotIds.length > 0 && (
                  <Text style={styles.vendorDetail}>🔗 {getLinkedSpotNames(vendor.linkedSpotIds)}</Text>
                )}
                {vendor.createdAt && (
                  <Text style={styles.vendorDetail}>📅 Submitted: {new Date(vendor.createdAt).toLocaleDateString()}</Text>
                )}
              </View>

              {rejectingId === vendor.id ? (
                <View style={styles.rejectForm}>
                  <TextInput
                    style={styles.rejectInput}
                    placeholder="Optional rejection reason..."
                    placeholderTextColor={colors.textMuted}
                    value={rejectReason}
                    onChangeText={setRejectReason}
                    multiline
                    editable={rejectingIdLoading !== vendor.id}
                  />
                  <View style={styles.rejectActions}>
                    <TouchableOpacity style={styles.cancelRejectBtn} onPress={() => setRejectingId(null)} disabled={rejectingIdLoading === vendor.id}>
                      <Text style={styles.cancelRejectText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.confirmRejectBtn} onPress={confirmReject} disabled={rejectingIdLoading === vendor.id}>
                      <Text style={styles.confirmRejectText}>{rejectingIdLoading === vendor.id ? 'Rejecting...' : 'Confirm Reject'}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <View style={styles.actionRow}>
                  <TouchableOpacity style={styles.approveButton} onPress={() => handleApprove(vendor.id)} disabled={approvingId === vendor.id}>
                    <MaterialIcons name="check" size={18} color="#fff" />
                    <Text style={styles.approveText}>{approvingId === vendor.id ? 'Approving...' : 'Approve'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.rejectButton} onPress={() => handleReject(vendor.id)} disabled={rejectingIdLoading === vendor.id}>
                    <MaterialIcons name="close" size={18} color={colors.danger} />
                    <Text style={styles.rejectText}>{rejectingIdLoading === vendor.id ? 'Rejecting...' : 'Reject'}</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ))
        )}

        {/* Approved Vendors */}
        {approvedVendors.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>✅ Approved Vendors ({approvedVendors.length})</Text>
            {approvedVendors.map((vendor) => (
              <View key={vendor.id} style={[styles.vendorCard, styles.approvedCard]}>
                <Text style={styles.vendorName}>{vendor.businessName}</Text>
                <Text style={styles.vendorOwner}>Owner: {vendor.user?.name || 'N/A'} • {vendor.city}</Text>
                {vendor.user?.email && <Text style={styles.vendorDetail}>📧 {vendor.user.email}</Text>}
              </View>
            ))}
          </>
        )}

        {/* Rejected Vendors */}
        {rejectedVendors.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>❌ Rejected Vendors ({rejectedVendors.length})</Text>
            {rejectedVendors.map((vendor) => (
              <View key={vendor.id} style={[styles.vendorCard, styles.rejectedCard]}>
                <Text style={styles.vendorName}>{vendor.businessName}</Text>
                <Text style={styles.vendorOwner}>Owner: {vendor.user?.name || 'N/A'} • {vendor.city}</Text>
                {vendor.rejectionReason && <Text style={styles.rejectedReason}>Reason: {vendor.rejectionReason}</Text>}
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
  vendorCard: { backgroundColor: colors.surface, borderRadius: borderRadius.md, padding: spacing.md, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.border },
  approvedCard: { borderLeftWidth: 3, borderLeftColor: colors.success },
  rejectedCard: { borderLeftWidth: 3, borderLeftColor: colors.danger },
  vendorInfo: { marginBottom: spacing.md },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs },
  vendorName: { fontSize: 16, fontWeight: 'bold', color: colors.text },
  categoryBadge: { backgroundColor: colors.primary + '30', paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: borderRadius.sm },
  categoryText: { fontSize: 10, color: colors.primaryLight, fontWeight: '600', textTransform: 'capitalize' },
  vendorOwner: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  vendorDetail: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  vendorDesc: { fontSize: 12, color: colors.textSecondary, marginTop: spacing.xs, fontStyle: 'italic' },
  actionRow: { flexDirection: 'row', gap: spacing.sm },
  approveButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.success, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: borderRadius.md, gap: spacing.xs },
  approveText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  rejectButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: borderRadius.md, gap: spacing.xs, borderWidth: 1, borderColor: colors.danger },
  rejectText: { color: colors.danger, fontSize: 14, fontWeight: '600' },
  rejectForm: { marginTop: spacing.sm },
  rejectInput: { backgroundColor: colors.surfaceLight, borderRadius: borderRadius.md, padding: spacing.md, color: colors.text, fontSize: 13, borderWidth: 1, borderColor: colors.danger, marginBottom: spacing.sm, textAlignVertical: 'top', minHeight: 60 },
  rejectActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm },
  cancelRejectBtn: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  cancelRejectText: { color: colors.textMuted, fontSize: 13 },
  confirmRejectBtn: { backgroundColor: colors.danger, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: borderRadius.md },
  confirmRejectText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  rejectedReason: { fontSize: 12, color: colors.danger, marginTop: spacing.xs, fontStyle: 'italic' },
  emptyState: { alignItems: 'center', paddingVertical: spacing.xl, backgroundColor: colors.surface, borderRadius: borderRadius.md },
  quickNavSection: { paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  quickNavSectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: spacing.xs,
    paddingHorizontal: 2,
  },
  quickNavRow: { flexDirection: 'row', gap: spacing.sm },
  quickNavBtn: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  quickNavText: { color: colors.primaryLight, fontSize: 13, fontWeight: '600' },
  emptyEmoji: { fontSize: 48, marginBottom: spacing.md },
  emptyText: { fontSize: 16, color: colors.success },
  loadingContainer: { alignItems: 'center', paddingVertical: spacing.xl, backgroundColor: colors.surface, borderRadius: borderRadius.md },
  loadingText: { fontSize: 16, color: colors.textSecondary },
});
