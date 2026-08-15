import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
} from 'react-native';

import { LinearGradient } from '../utils/LinearGradient';
import { Ionicons } from '../utils/Icons';
import { colors, spacing, borderRadius, shadows } from '../config/theme';
import { walletApi, WalletTransaction } from '../services/api/wallet';
import { DEV_FLAGS } from '../config/devFlags';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBottomSafePadding } from '../design/responsive';

import { UserProfile } from '../types';

interface RewardsWalletScreenProps {
  user: UserProfile;
  onBack: () => void;
}

export default function RewardsWalletScreen({
  user,
  onBack,
}: RewardsWalletScreenProps) {
  const insets = useSafeAreaInsets();
  const contentPadBottom = useBottomSafePadding(24);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [palPoints, setPalPoints] = useState(user.totalPoints || 0);
  const [lifetimeEarned, setLifetimeEarned] = useState(0);
  const [lifetimeSpent, setLifetimeSpent] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const loadWallet = useCallback(async () => {
    if (!DEV_FLAGS.USE_SERVER_API) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(false);
    try {
      const [profileRes, txRes] = await Promise.all([
        walletApi.getProfile(),
        walletApi.getTransactions(1, 30),
      ]);
      if (profileRes.success && profileRes.data) {
        setPalPoints(profileRes.data.palPoints ?? 0);
        setLifetimeEarned(profileRes.data.lifetimeEarned || 0);
        setLifetimeSpent(profileRes.data.lifetimeSpent || 0);
      }
      if (txRes.success && Array.isArray(txRes.data)) {
        setTransactions(txRes.data);
      }
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadWallet();
  }, [loadWallet]);

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) }]}>
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Rewards Wallet</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: contentPadBottom }} showsVerticalScrollIndicator={false}>
        <View style={styles.summaryCard}>
          <LinearGradient
            colors={[colors.primary, colors.primaryDark] as any}
            style={styles.summaryGradient}
          >
            <View style={styles.summaryRow}>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryValue}>{palPoints}</Text>
                <Text style={styles.summaryLabel}>Pal Points</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryItem}>
                <Text style={styles.summaryValue}>{lifetimeEarned}</Text>
                <Text style={styles.summaryLabel}>Earned</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryItem}>
                <Text style={styles.summaryValue}>{lifetimeSpent}</Text>
                <Text style={styles.summaryLabel}>Spent</Text>
              </View>
            </View>
          </LinearGradient>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Transaction History</Text>
          {loading ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.lg }} />
          ) : loadError ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>Could not load wallet. Pull to refresh or try again.</Text>
              <TouchableOpacity onPress={loadWallet} style={{ marginTop: spacing.md }}>
                <Text style={{ color: colors.primary, fontWeight: '700' }}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : transactions.length === 0 ? (
            <View style={styles.emptyState}>
              <Image
                source={require('../assets/gift.png')}
                style={styles.emptyStateArt}
                resizeMode="contain"
              />
              <Text style={styles.emptyText}>No transactions yet. Explore and earn Pal Points!</Text>
            </View>
          ) : (
            transactions.map((txn) => (
              <View key={txn.id} style={styles.historyItem}>
                <View style={[
                  styles.historyIcon,
                  { backgroundColor: txn.type === 'EARN' ? colors.green + '20' : colors.danger + '20' },
                ]}>
                  <Ionicons
                    name={txn.type === 'EARN' ? 'arrow-down' : 'arrow-up'}
                    size={16}
                    color={txn.type === 'EARN' ? colors.green : colors.danger}
                  />
                </View>
                <View style={styles.historyContent}>
                  <Text style={styles.historyDesc}>{txn.reason}</Text>
                  <Text style={styles.historyDate}>
                    {new Date(txn.createdAt).toLocaleDateString()}
                  </Text>
                </View>
                <Text style={[
                  styles.historyAmount,
                  { color: txn.type === 'EARN' ? colors.green : colors.danger },
                ]}>
                  {txn.type === 'EARN' ? '+' : '-'}{Math.abs(txn.amount)}
                </Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: 0,
    paddingBottom: spacing.md,
    backgroundColor: colors.surface,
    ...shadows.sm,
  },
  backButton: { padding: spacing.sm },
  headerTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  content: { flex: 1, padding: spacing.md },
  summaryCard: { borderRadius: borderRadius.lg, overflow: 'hidden', marginBottom: spacing.lg, ...shadows.md },
  summaryGradient: { padding: spacing.lg },
  summaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' },
  summaryItem: { alignItems: 'center', flex: 1 },
  summaryValue: { fontSize: 22, fontWeight: '800', color: '#FFF' },
  summaryLabel: { fontSize: 12, color: 'rgba(255,255,255,0.85)', marginTop: 4 },
  summaryDivider: { width: 1, height: 40, backgroundColor: 'rgba(255,255,255,0.3)' },
  section: { marginBottom: spacing.xl },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: spacing.md },
  emptyState: { alignItems: 'center', paddingVertical: spacing.lg },
  emptyStateArt: { width: 150, height: 260, marginBottom: spacing.md },
  emptyText: { color: colors.textMuted, textAlign: 'center', marginTop: spacing.lg },
  historyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...shadows.sm,
  },
  historyIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginRight: spacing.md },
  historyContent: { flex: 1 },
  historyDesc: { fontSize: 14, fontWeight: '600', color: colors.text },
  historyDate: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  historyAmount: { fontSize: 16, fontWeight: '700' },
});
