import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Platform,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useUserContext } from '../context/UserContext';
import { walletApi, WalletProfile, WalletTransaction, pointRulesApi } from '../services/api';
import { DEV_FLAGS } from '../config/devFlags';
import { navigateToVendorReviewMap } from '../navigation/vendorReviewFlow';
import { CreatorUI } from '../features/creator/theme';
import { useBottomSafePadding, useHeaderSafePadding } from '../design/responsive';

const C = CreatorUI.colors;

type HistorySubTab = 'all' | 'earned' | 'redeemed';

export default function PalPointsScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const headerPadTop = useHeaderSafePadding(12);
  const contentPadBottom = useBottomSafePadding(24);
  const { user } = useUserContext();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [wallet, setWallet] = useState<WalletProfile | null>(null);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [historySubTab, setHistorySubTab] = useState<HistorySubTab>('all');
  const [error, setError] = useState(false);

  const [rewardPoints, setRewardPoints] = useState({
    reel: 50,
    collab: 100,
    review: 10,
    daily: 5,
    activity: 100,
    checkpoint: 10,
  });

  const fetchData = useCallback(async () => {
    setError(false);
    try {
      if (DEV_FLAGS.USE_SERVER_API) {
        const [walletRes, txRes] = await Promise.all([
          walletApi.getProfile(),
          walletApi.getTransactions(1, 50),
        ]);
        
        const data: any = walletRes?.data ?? walletRes;
        if (data) {
          setWallet({
            id: data.id || 'wallet',
            userId: data.userId || user?.uid || '',
            palPoints: Number(data.palPoints ?? 0) || 0,
            lifetimeEarned: data.lifetimeEarned ?? 0,
            lifetimeSpent: data.lifetimeSpent ?? 0,
            recentTransactions: data.recentTransactions ?? [],
          });
        }
        
        if (txRes?.success && Array.isArray(txRes.data)) {
          setTransactions(txRes.data);
        } else if (Array.isArray((txRes as any)?.data)) {
          setTransactions((txRes as any).data);
        } else if (data?.recentTransactions) {
          setTransactions(data.recentTransactions);
        }

        try {
          const rulesRes = await pointRulesApi.list();
          const rules = Array.isArray(rulesRes)
            ? rulesRes
            : Array.isArray((rulesRes as any)?.data)
            ? (rulesRes as any).data
            : [];
          
          const byKey = (key: string, fallback: number) => {
            const row = rules.find((r: any) => r.key === key && r.isActive !== false);
            return typeof row?.points === 'number' && row.points > 0 ? row.points : fallback;
          };
          
          setRewardPoints({
            reel: byKey('reel_upload', 50),
            collab: byKey('creator_collab', 100),
            review: byKey('review_write', 10),
            daily: byKey('daily_login', 5),
            activity: byKey('itinerary_completion', 100),
            checkpoint: byKey('itinerary_checkpoint', 10),
          });
        } catch {
          // Keep defaults
        }
      } else {
        setWallet({
          id: 'local',
          userId: user?.uid || '',
          palPoints: user?.totalPoints || 0,
          lifetimeEarned: user?.totalPoints || 0,
          lifetimeSpent: 0,
          recentTransactions: [],
        });
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchData();
  }, [fetchData]);

  const palPoints = wallet?.palPoints ?? 0;
  const lifetimeEarned = wallet?.lifetimeEarned ?? 0;
  const lifetimeSpent = wallet?.lifetimeSpent ?? 0;

  const mapTxIcon = (tx: WalletTransaction) => {
    const reason = (tx.reason || '').toLowerCase();
    if (tx.type === 'SPEND' || reason.includes('redeem') || reason.includes('claim')) {
      return { icon: 'gift-outline' as const, color: '#DC2626', bg: '#FEF2F2', type: 'redeemed' as const, isPositive: false };
    }
    if (reason.includes('reel') || reason.includes('video')) {
      return { icon: 'videocam-outline' as const, color: '#16A34A', bg: '#F0FDF4', type: 'earned' as const, isPositive: true };
    }
    if (reason.includes('collaboration') || reason.includes('collab')) {
      return { icon: 'hand-right-outline' as const, color: '#16A34A', bg: '#F0FDF4', type: 'earned' as const, isPositive: true };
    }
    if (tx.type === 'EARN' || tx.amount > 0) {
      return { icon: 'star-outline' as const, color: '#16A34A', bg: '#F0FDF4', type: 'earned' as const, isPositive: true };
    }
    return { icon: 'remove-circle-outline' as const, color: '#DC2626', bg: '#FEF2F2', type: 'redeemed' as const, isPositive: false };
  };

  const filteredTransactions = useMemo(() => {
    return transactions.filter(tx => {
      const type = mapTxIcon(tx).type;
      if (historySubTab === 'earned') return type === 'earned';
      if (historySubTab === 'redeemed') return type === 'redeemed';
      return true;
    });
  }, [transactions, historySubTab]);

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: headerPadTop }]}>
        <TouchableOpacity style={styles.headerBtn} onPress={() => navigation.goBack()}>
          <Icon name="arrow-back" size={24} color={C.deep} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>PalPoints</Text>
        <View style={styles.headerBtn} />
      </View>

      {loading && !refreshing ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={C.primary} />
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.content, { paddingBottom: contentPadBottom }]}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
        >
          {error && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>Could not load PalPoints data.</Text>
            </View>
          )}

          {/* Hero Section */}
          <View style={styles.heroCard}>
            <Text style={styles.heroLabel}>Your PalPoints</Text>
            <Text style={styles.heroBalance}>{palPoints.toLocaleString()}</Text>
            <Text style={styles.heroSub}>Available PalPoints</Text>

            <View style={styles.statsRow}>
              <View style={styles.statBox}>
                <Text style={styles.statValue}>{lifetimeEarned.toLocaleString()}</Text>
                <Text style={styles.statLabel}>Earned</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statBox}>
                <Text style={styles.statValue}>{lifetimeSpent.toLocaleString()}</Text>
                <Text style={styles.statLabel}>Redeemed</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statBox}>
                <Text style={styles.statValue}>{palPoints.toLocaleString()}</Text>
                <Text style={styles.statLabel}>Available</Text>
              </View>
            </View>
          </View>

          {/* Rewards CTA */}
          <TouchableOpacity style={styles.rewardsCta} onPress={() => navigation.navigate('Rewards')}>
            <View style={styles.rewardsCtaLeft}>
              <View style={styles.rewardsCtaIcon}>
                <Icon name="gift-outline" size={20} color="#FFF" />
              </View>
              <View>
                <Text style={styles.rewardsCtaTitle}>Explore Rewards</Text>
                <Text style={styles.rewardsCtaSub}>Redeem points for exclusive perks</Text>
              </View>
            </View>
            <Icon name="arrow-forward" size={20} color={C.deep} />
          </TouchableOpacity>

          {/* Ways to Earn */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Ways to Earn</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.waysRow}>
              <TouchableOpacity style={styles.wayCard} onPress={() => navigation.navigate('CreateReel')}>
                <Text style={styles.wayPoints}>+{rewardPoints.reel}</Text>
                <Text style={styles.wayTitle}>Publish a Reel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.wayCard} onPress={() => navigation.navigate('CreatorTabs', { screen: 'Collaboration' })}>
                <Text style={styles.wayPoints}>+{rewardPoints.collab}</Text>
                <Text style={styles.wayTitle}>Complete a Collab</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.wayCard}
                onPress={() => navigateToVendorReviewMap(navigation)}
              >
                <Text style={styles.wayPoints}>+{rewardPoints.review}</Text>
                <Text style={styles.wayTitle}>Write a Vendor Review</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.wayCard} onPress={() => navigation.navigate('Wallet')}>
                <Text style={styles.wayPoints}>+{rewardPoints.daily}</Text>
                <Text style={styles.wayTitle}>Daily Login</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.wayCard} onPress={() => navigation.navigate('MyTrips')}>
                <Text style={styles.wayPoints}>+{rewardPoints.activity}</Text>
                <Text style={styles.wayTitle}>Complete Itinerary</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.wayCard} onPress={() => navigation.navigate('HowItWorks')}>
                <Text style={styles.wayPoints}>More</Text>
                <Text style={styles.wayTitle}>Earn More</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>

          {/* History */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>PalPoints History</Text>
            <View style={styles.filterRow}>
              {(['all', 'earned', 'redeemed'] as HistorySubTab[]).map(tab => (
                <TouchableOpacity
                  key={tab}
                  style={[styles.filterChip, historySubTab === tab && styles.filterChipActive]}
                  onPress={() => setHistorySubTab(tab)}
                >
                  <Text style={[styles.filterText, historySubTab === tab && styles.filterTextActive]}>
                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.historyList}>
              {filteredTransactions.length === 0 ? (
                <View style={styles.emptyHistory}>
                  <Text style={styles.emptyHistoryText}>No transactions found.</Text>
                </View>
              ) : (
                filteredTransactions.map((tx, idx) => {
                  const meta = mapTxIcon(tx);
                  const amount = Math.abs(tx.amount);
                  const prefix = meta.isPositive ? '+' : '-';
                  return (
                    <View key={tx.id || idx} style={styles.txRow}>
                      <View style={[styles.txIconWrap, { backgroundColor: meta.bg }]}>
                        <Icon name={meta.icon} size={20} color={meta.color} />
                      </View>
                      <View style={styles.txBody}>
                        <Text style={styles.txTitle} numberOfLines={1}>
                          {tx.reason || (meta.isPositive ? 'Points Earned' : 'Points Redeemed')}
                        </Text>
                        <Text style={styles.txDate}>
                          {new Date(tx.createdAt).toLocaleString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            hour: 'numeric',
                            minute: '2-digit',
                          })}
                        </Text>
                      </View>
                      <View style={styles.txAmountWrap}>
                        <Text style={[styles.txAmount, { color: meta.isPositive ? '#16A34A' : '#DC2626' }]}>
                          {prefix}{amount}
                        </Text>
                        <Text style={styles.txAmountLabel}>PalPoints</Text>
                      </View>
                    </View>
                  );
                })
              )}
            </View>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: C.bg,
  },
  headerBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: C.deep,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingTop: 16,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorBox: {
    marginHorizontal: 20,
    marginBottom: 16,
    padding: 12,
    backgroundColor: '#FEF2F2',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  errorText: {
    color: '#DC2626',
    fontSize: 14,
    textAlign: 'center',
  },
  heroCard: {
    marginHorizontal: 20,
    backgroundColor: C.surface,
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 2,
    marginBottom: 20,
  },
  heroLabel: {
    fontSize: 14,
    color: C.textSecondary,
    fontWeight: '600',
    marginBottom: 8,
  },
  heroBalance: {
    fontSize: 48,
    fontWeight: '800',
    color: C.deep,
    marginBottom: 4,
  },
  heroSub: {
    fontSize: 12,
    color: C.textMuted,
    marginBottom: 24,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    width: 1,
    height: 24,
    backgroundColor: C.border,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '700',
    color: C.deep,
  },
  statLabel: {
    fontSize: 11,
    color: C.textSecondary,
    marginTop: 4,
  },
  rewardsCta: {
    marginHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: C.soft,
    borderRadius: 16,
    padding: 16,
    marginBottom: 32,
    borderWidth: 1,
    borderColor: C.border,
  },
  rewardsCtaLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rewardsCtaIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rewardsCtaTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: C.deep,
  },
  rewardsCtaSub: {
    fontSize: 12,
    color: C.textSecondary,
    marginTop: 2,
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: C.deep,
    marginHorizontal: 20,
    marginBottom: 16,
  },
  waysRow: {
    paddingHorizontal: 20,
    gap: 12,
  },
  wayCard: {
    width: 120,
    backgroundColor: C.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
  },
  wayPoints: {
    fontSize: 20,
    fontWeight: '800',
    color: C.bronze,
    marginBottom: 8,
  },
  wayTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: C.deep,
    textAlign: 'center',
    lineHeight: 16,
  },
  filterRow: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginBottom: 16,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
  },
  filterChipActive: {
    backgroundColor: C.deep,
    borderColor: C.deep,
  },
  filterText: {
    fontSize: 13,
    fontWeight: '600',
    color: C.textSecondary,
  },
  filterTextActive: {
    color: '#FFF',
  },
  historyList: {
    paddingHorizontal: 20,
  },
  emptyHistory: {
    padding: 24,
    alignItems: 'center',
    backgroundColor: C.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
  },
  emptyHistoryText: {
    color: C.textSecondary,
    fontSize: 14,
  },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  txIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  txBody: {
    flex: 1,
    marginRight: 12,
  },
  txTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: C.deep,
    marginBottom: 4,
  },
  txDate: {
    fontSize: 12,
    color: C.textMuted,
  },
  txAmountWrap: {
    alignItems: 'flex-end',
  },
  txAmount: {
    fontSize: 15,
    fontWeight: '700',
  },
  txAmountLabel: {
    fontSize: 10,
    color: C.textMuted,
    marginTop: 2,
  },
});
