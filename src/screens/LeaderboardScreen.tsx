import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  StatusBar,
  Image,
  ImageBackground,
  ScrollView,
  useWindowDimensions,
  Alert,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import { LeaderboardHowItWorksModal } from '../components/ui/LeaderboardHowItWorksModal';
import { PalPointsIcon } from '../components/PalPointsIcon';
import { useUserContext } from '../context/UserContext';
import { gamificationApi, walletApi } from '../services/api';
import type { LeaderboardEntry } from '../services/api/gamification';
import { claimReward, getCampaigns } from '../services/api/campaigns';
import type { Campaign } from '../services/api/campaigns';
import { useHeaderSafePadding } from '../design/responsive';
import { isRewardCampaignLive } from '../utils/rewardCampaignUtils';

const H_PAD = 16;

const C = {
  bg: '#FFFFFF',
  surface: '#FFFFFF',
  card: '#FFFFFF',
  ink: '#63300E',
  gold: '#B9834B',
  text: '#2C1810',
  textSub: '#8B7355',
  textMuted: '#B8A88A',
  border: 'rgba(200, 155, 60, 0.18)',
  navy: '#1F3354',
  orange: '#E8923B',
};

const TIER_LABELS = [
  'Grand Champion Reward',
  'Elite Explorer Reward',
  'Explorer Reward',
  'PalSafar Reward',
];

const CLAIM_BTN_COLORS = [C.orange, C.navy, C.gold, '#4C7043'];

type LeaderboardTab = 'month' | 'all' | 'friends';

function formatPts(n: number): string {
  return `${Math.round(n).toLocaleString('en-IN')}`;
}

function eligibilityLabel(campaign: Campaign): string {
  const slots = campaign.totalWinnerSlots || 1;
  if (slots <= 1) return 'Only 1 user can claim this reward';
  return `Top ${slots} users can claim this reward`;
}

function rankRibbonStyle(index: number) {
  if (index === 0) return { bg: '#FEF3C7', text: '#B45309', border: '#F59E0B' };
  if (index === 1) return { bg: '#F1F5F9', text: '#64748B', border: '#94A3B8' };
  return { bg: '#FFEDD5', text: '#C2410C', border: '#FB923C' };
}

export default function LeaderboardScreen() {
  const { user, isGuest, onLogout } = useUserContext();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { width: SCREEN_W } = useWindowDimensions();
  const REWARD_CARD_W = Math.min(SCREEN_W * 0.75, 260);
  const headerPadTop = useHeaderSafePadding(8);

  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [myPoints, setMyPoints] = useState(Number(user?.totalPoints) || 0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);


  const [claimModalCampaign, setClaimModalCampaign] = useState<Campaign | null>(null);
  const [claimName, setClaimName] = useState('');
  const [claimPhone, setClaimPhone] = useState('');
  const [claimAddress, setClaimAddress] = useState('');
  const [claimCity, setClaimCity] = useState('');
  const [claimPincode, setClaimPincode] = useState('');
  const [claimNotes, setClaimNotes] = useState('');
  const [claiming, setClaiming] = useState(false);
  const [isHowItWorksVisible, setIsHowItWorksVisible] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [lbRes, campRes, walletRes] = await Promise.allSettled([
        gamificationApi.getLeaderboard(1, 100),
        getCampaigns({ limit: 50 }),
        isGuest ? Promise.resolve(null) : walletApi.getProfile(),
      ]);

      if (lbRes.status === 'fulfilled') {
        setLeaderboard(Array.isArray(lbRes.value.entries) ? lbRes.value.entries : []);
      }

      if (campRes.status === 'fulfilled') {
        const list = Array.isArray(campRes.value) ? campRes.value : [];
        setCampaigns(list);
      } else {
        setCampaigns([]);
      }

      if (!isGuest && walletRes.status === 'fulfilled' && walletRes.value) {
        const w: any = walletRes.value;
        const profile = w?.data ?? w;
        const pts = Number(
          profile?.palPoints ?? profile?.data?.palPoints ?? user?.totalPoints ?? 0,
        );
        if (!Number.isNaN(pts)) setMyPoints(pts);
      } else if (user?.totalPoints != null) {
        setMyPoints(Number(user.totalPoints) || 0);
      }
    } catch {
      if (user?.totalPoints != null) setMyPoints(Number(user.totalPoints) || 0);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.totalPoints, isGuest]);

  useEffect(() => {
    setLoading(true);
    fetchData();
  }, [fetchData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchData();
  }, [fetchData]);

  const myEntry = useMemo(
    () => leaderboard.find(item => item.userId === user?.uid),
    [leaderboard, user?.uid],
  );

  const myRank = myEntry?.rank ?? (isGuest ? null : leaderboard.length + 1);

  const pointsToNextRank = useMemo(() => {
    if (!myRank || myRank <= 1) return 0;
    const above = leaderboard.find(item => item.rank === myRank - 1);
    if (!above) return 0;
    return Math.max(1, above.palPoints - myPoints + 1);
  }, [leaderboard, myPoints, myRank]);

  const leaderboardCampaigns = useMemo(
    () => [...campaigns]
      .sort((a, b) => (b.pointsRequired || 0) - (a.pointsRequired || 0)),
    [campaigns],
  );

  const visibleLeaderboard = useMemo(() => {
    const sorted = [...leaderboard].sort((a, b) => a.rank - b.rank);

    if (isGuest || !myRank || !myEntry) return sorted.slice(0, 10);

    const start = Math.max(0, myRank - 4);
    const end = Math.min(sorted.length, start + 7);
    const slice = sorted.slice(start, end);
    if (slice.some(item => item.userId === user?.uid)) return slice;
    return [...slice, myEntry].sort((a, b) => a.rank - b.rank);
  }, [leaderboard, isGuest, myEntry, myRank, user?.uid]);

  const handleHowItWorks = () => {
    setIsHowItWorksVisible(true);
  };

  const handleClaimCampaign = useCallback((campaign: Campaign) => {
    if (isGuest) {
      Alert.alert('Sign In Required', 'Please sign in to claim reward campaigns.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign In', onPress: () => onLogout() },
      ]);
      return;
    }

    const required = campaign.pointsRequired || 0;
    if (myPoints < required) {
      Alert.alert(
        'Insufficient PalPoints',
        `You need ${formatPts(required)} PalPoints to claim this reward. You currently have ${formatPts(myPoints)} pts.`,
      );
      return;
    }

    setClaimName(user?.displayName || '');
    setClaimPhone('');
    setClaimAddress('');
    setClaimCity('');
    setClaimPincode('');
    setClaimNotes('');
    setClaimModalCampaign(campaign);
  }, [isGuest, myPoints, onLogout, user?.displayName]);

  const handleSubmitClaim = useCallback(async () => {
    if (!claimModalCampaign) return;
    if (!claimName.trim() || !claimPhone.trim() || !claimAddress.trim() || !claimCity.trim() || !claimPincode.trim()) {
      Alert.alert('Required Fields', 'Please fill in all required fields before submitting.');
      return;
    }
    setClaiming(true);
    const notes = `Name: ${claimName.trim()} | Phone: ${claimPhone.trim()} | Address: ${claimAddress.trim()}, ${claimCity.trim()} - ${claimPincode.trim()}${claimNotes.trim() ? ' | Notes: ' + claimNotes.trim() : ''}`;
    try {
      await claimReward(claimModalCampaign.id, notes);
      const required = claimModalCampaign.pointsRequired || 0;
      setMyPoints(prev => Math.max(0, prev - required));
      setCampaigns(prev => prev.map(item => {
        if (item.id === claimModalCampaign.id) {
          const rem = Math.max(0, (item.remainingWinnerSlots || 1) - 1);
          return { ...item, remainingWinnerSlots: rem };
        }
        return item;
      }));
      setClaimModalCampaign(null);
      Alert.alert(
        'Claim Submitted',
        `Your claim for "${claimModalCampaign.name}" has been submitted. Our team will review your details and dispatch your reward shortly.`,
      );
    } catch (err: any) {
      Alert.alert('Claim Request Received', err?.message || 'Your claim request has been recorded. Our team will contact you.');
      setClaimModalCampaign(null);
    } finally {
      setClaiming(false);
    }
  }, [claimModalCampaign, claimName, claimPhone, claimAddress, claimCity, claimPincode, claimNotes]);

  const renderRewardCard = (campaign: Campaign, index: number) => {
    const ribbon = rankRibbonStyle(index);
    const available = campaign.remainingWinnerSlots ?? 0;
    const tierLabel = TIER_LABELS[index] || campaign.description?.split('\n')[0]?.slice(0, 40) || 'Leaderboard Reward';
    const btnColor = CLAIM_BTN_COLORS[index % CLAIM_BTN_COLORS.length];

    return (
      <View key={campaign.id} style={[styles.rewardCard, { width: REWARD_CARD_W }]}>
        <View style={styles.rewardImageWrap}>
          {campaign.imageUrl ? (
            <Image source={{ uri: campaign.imageUrl }} style={styles.rewardImage} resizeMode="contain" />
          ) : (
            <View style={[styles.rewardImage, styles.rewardImageFallback]}>
              <Icon name="gift-outline" size={36} color={C.gold} />
            </View>
          )}
          <View style={[styles.rankRibbon, { backgroundColor: ribbon.bg, borderColor: ribbon.border }]}>
            <Text style={[styles.rankRibbonText, { color: ribbon.text }]}>{index + 1}</Text>
          </View>
        </View>

        <View style={styles.rewardBody}>
          <Text style={styles.rewardTitle} numberOfLines={1}>{campaign.name}</Text>
          <View style={styles.rewardPtsRow}>
            <PalPointsIcon size={16} />
            <Text style={styles.rewardPtsText}>
              {formatPts(campaign.pointsRequired || 0)}
              <Text style={styles.rewardPtsSuffix}> PalPoints</Text>
            </Text>
          </View>
          <View style={styles.tierPill}>
            <Text style={styles.tierPillText} numberOfLines={1}>{tierLabel}</Text>
          </View>
          <View style={styles.eligibilityRow}>
            <Icon name="person-outline" size={13} color={C.textSub} />
            <Text style={styles.eligibilityText} numberOfLines={2}>{eligibilityLabel(campaign)}</Text>
          </View>
          <TouchableOpacity
            style={[styles.claimBtn, { backgroundColor: btnColor }, available <= 0 && styles.claimBtnDisabled]}
            disabled={available <= 0}
            onPress={() => handleClaimCampaign(campaign)}
            activeOpacity={0.88}
          >
            <Icon name="gift-outline" size={15} color="#FFF" />
            <Text style={styles.claimBtnText}>{available <= 0 ? 'Out of Stock' : 'Claim Reward'}</Text>
            {available > 0 ? <Icon name="arrow-forward" size={14} color="#FFF" /> : null}
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderLeaderRow = (item: LeaderboardEntry) => {
    const isCurrentUser = item.userId === user?.uid;

    return (
      <View
        key={`leader-${item.userId}-${item.rank}`}
        style={[styles.tableRow, isCurrentUser && styles.tableRowYou]}
      >
        <View style={styles.tableRankCol}>
          <Text style={[styles.tableRank, isCurrentUser && styles.tableRankYou]}>{item.rank}</Text>
        </View>

        <View style={styles.tablePlayerCol}>
          <View style={[styles.avatar, isCurrentUser && styles.avatarYou]}>
            <Text style={[styles.avatarLetter, isCurrentUser && styles.avatarLetterYou]}>
              {item.name?.charAt(0)?.toUpperCase() || 'U'}
            </Text>
          </View>
          <View style={styles.playerTextWrap}>
            <Text style={styles.playerName} numberOfLines={1}>
              {isCurrentUser ? 'You' : item.name || 'Anonymous'}
            </Text>
            <Text style={styles.playerMeta} numberOfLines={1}>
              {item.roleLabel || 'Traveller'}
            </Text>
          </View>
        </View>

        <View style={styles.tablePointsCol}>
          <Text style={styles.tablePointsValue} numberOfLines={1}>
            {formatPts(item.palPoints || 0)}
          </Text>
          <Text style={styles.tablePointsLabel}>PalPoints</Text>
        </View>
      </View>
    );
  };

  if (loading && !refreshing) {
    return (
      <View style={[styles.screen, { paddingTop: headerPadTop }]}>
        <View style={styles.loader}>
          <ActivityIndicator size="large" color={C.gold} />
        </View>
      </View>
    );
  }

  return (
    <>
      <View style={styles.screen}>
        <StatusBar barStyle="dark-content" backgroundColor={C.bg} />

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.gold} />
          }
        >
          <ImageBackground
            source={require('../assets/leaderboard.png')}
            style={[styles.heroBg, { paddingTop: headerPadTop }]}
            imageStyle={styles.heroBgImage}
          >
            <View style={styles.heroOverlay} />
            <View style={styles.heroContent}>
            <View style={styles.heroTopRow}>
              <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
                <Icon name="arrow-back" size={22} color={C.text} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.howBtn} onPress={handleHowItWorks} activeOpacity={0.88}>
                <Icon name="help-circle-outline" size={15} color={C.ink} />
                <Text style={styles.howBtnText}>How it works?</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.heroTitleRow}>
              <Text style={styles.heroTitle}>Leaderboard</Text>
              <Text style={styles.heroCrown}>👑</Text>
            </View>
            <Text style={styles.heroSub}>Earn more PalPoints and climb the ranks!</Text>
            </View>
          </ImageBackground>

          <View style={styles.statsCard}>
            <View style={styles.statsCol}>
              <View style={styles.statsMedalWrap}>
                <PalPointsIcon size={28} />
              </View>
              <Text style={styles.statsLabel}>YOUR RANK</Text>
              <View style={styles.rankValueRow}>
                <Text style={styles.statsValue}>{myRank ?? '—'}</Text>
                {pointsToNextRank > 0 && myRank && myRank > 1 ? (
                  <View style={styles.rankUpBadge}>
                    <Icon name="trending-up" size={12} color="#059669" />
                  </View>
                ) : null}
              </View>
              <Text style={styles.statsHint}>Keep earning to rank higher!</Text>
            </View>

            <View style={styles.statsDivider} />

            <View style={styles.statsCol}>
              <Text style={[styles.statsLabel, styles.statsLabelSpaced]}>YOUR PALPOINTS</Text>
              <View style={styles.pointsValueRow}>
                <Text style={styles.statsValue}>{formatPts(myPoints)}</Text>
                <PalPointsIcon size={20} />
              </View>
              <Text style={styles.statsHint}>Total Points</Text>
            </View>
          </View>

          <View style={styles.tipRow}>
            <View style={styles.tipCard}>
              <View style={styles.tipIconWrap}>
                <Icon name="stats-chart" size={16} color={C.gold} />
              </View>
              <Text style={styles.tipText}>
                {pointsToNextRank > 0 && myRank && myRank > 1
                  ? `You're only ${formatPts(pointsToNextRank)} points away from Rank #${myRank - 1}.`
                  : 'You are at the top of the leaderboard!'}
              </Text>
            </View>
            <View style={styles.tipCard}>
              <View style={styles.tipIconWrap}>
                <Icon name="star" size={16} color={C.gold} />
              </View>
              <Text style={styles.tipText}>
                Check in at places and share reels to move up faster.
              </Text>
            </View>
          </View>

          <View style={styles.sectionHead}>
            <View style={styles.sectionIconWrap}>
              <Icon name="trophy" size={16} color={C.gold} />
            </View>
            <View style={styles.sectionHeadCopy}>
              <Text style={styles.sectionTitle}>LEADERBOARD REWARDS</Text>
              <Text style={styles.sectionSub}>Earn big by climbing higher!</Text>
            </View>
          </View>

          {leaderboardCampaigns.length > 0 ? (
            <ScrollView
              horizontal
              nestedScrollEnabled
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.rewardScroll}
            >
              {leaderboardCampaigns.map((campaign, index) => renderRewardCard(campaign, index))}
            </ScrollView>
          ) : (
            <View style={styles.emptyRewards}>
              <Icon name="gift-outline" size={32} color={C.gold} />
              <Text style={styles.emptyRewardsTitle}>No active reward campaigns</Text>
              <Text style={styles.emptyRewardsSub}>
                Admin reward campaigns will appear here when published.
              </Text>
            </View>
          )}

          <View style={styles.rewardFooter}>
            <Icon name="information-circle-outline" size={14} color={C.textSub} />
            <Text style={styles.rewardFooterText}>
              Rewards will be given at the end of the leaderboard season.
            </Text>
            <Text style={styles.rewardFooterLink}>T&C Apply*</Text>
          </View>

          <Text style={styles.rankingsTitle}>Rankings</Text>



          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeadCell, styles.tableRankHead]}>Rank</Text>
            <Text style={[styles.tableHeadCell, styles.tablePlayerHead]}>Player</Text>
            <Text style={[styles.tableHeadCell, styles.tablePointsHead]}>PalPoints</Text>
          </View>

          <View style={styles.tableBody}>
            {visibleLeaderboard.length > 0 ? (
              visibleLeaderboard.map(renderLeaderRow)
            ) : (
              <View style={styles.emptyLeader}>
                <Icon name="trophy-outline" size={36} color={C.textMuted} />
                <Text style={styles.emptyLeaderText}>No leaderboard data yet</Text>
              </View>
            )}
          </View>
        </ScrollView>
      </View>

      <Modal
        visible={!!claimModalCampaign}
        animationType="slide"
        transparent
        onRequestClose={() => setClaimModalCampaign(null)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.claimModalSheet}>
            <View style={styles.claimModalHandle} />
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.claimModalHeader}>
                <Icon name="gift-outline" size={28} color={C.gold} />
                <Text style={styles.claimModalTitle}>Claim Reward</Text>
                <TouchableOpacity onPress={() => setClaimModalCampaign(null)} hitSlop={10}>
                  <Icon name="close" size={22} color={C.ink} />
                </TouchableOpacity>
              </View>

              {claimModalCampaign ? (
                <View style={styles.claimCampaignSummary}>
                  <Text style={styles.claimCampaignName}>{claimModalCampaign.name}</Text>
                  <Text style={styles.claimCampaignPts}>
                    {formatPts(claimModalCampaign.pointsRequired || 0)} PalPoints will be deducted
                  </Text>
                </View>
              ) : null}

              <Text style={styles.claimFormLabel}>Delivery / Shipping Details</Text>
              <Text style={styles.claimFormSub}>These details will be shared with our admin to dispatch your reward.</Text>

              <Text style={styles.claimFieldLabel}>Full Name <Text style={{ color: '#EF4444' }}>*</Text></Text>
              <TextInput
                style={styles.claimInput}
                placeholder="Your full name"
                placeholderTextColor={C.textMuted}
                value={claimName}
                onChangeText={setClaimName}
              />

              <Text style={styles.claimFieldLabel}>Phone Number <Text style={{ color: '#EF4444' }}>*</Text></Text>
              <TextInput
                style={styles.claimInput}
                placeholder="10-digit mobile number"
                placeholderTextColor={C.textMuted}
                value={claimPhone}
                onChangeText={setClaimPhone}
                keyboardType="phone-pad"
                maxLength={15}
              />

              <Text style={styles.claimFieldLabel}>Street Address <Text style={{ color: '#EF4444' }}>*</Text></Text>
              <TextInput
                style={[styles.claimInput, { minHeight: 64, textAlignVertical: 'top' }]}
                placeholder="House no., street, locality"
                placeholderTextColor={C.textMuted}
                value={claimAddress}
                onChangeText={setClaimAddress}
                multiline
              />

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.claimFieldLabel}>City <Text style={{ color: '#EF4444' }}>*</Text></Text>
                  <TextInput
                    style={styles.claimInput}
                    placeholder="City"
                    placeholderTextColor={C.textMuted}
                    value={claimCity}
                    onChangeText={setClaimCity}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.claimFieldLabel}>Pincode <Text style={{ color: '#EF4444' }}>*</Text></Text>
                  <TextInput
                    style={styles.claimInput}
                    placeholder="Pincode"
                    placeholderTextColor={C.textMuted}
                    value={claimPincode}
                    onChangeText={setClaimPincode}
                    keyboardType="numeric"
                    maxLength={6}
                  />
                </View>
              </View>

              <Text style={styles.claimFieldLabel}>Additional Notes (optional)</Text>
              <TextInput
                style={[styles.claimInput, { minHeight: 56, textAlignVertical: 'top' }]}
                placeholder="Any special delivery instructions..."
                placeholderTextColor={C.textMuted}
                value={claimNotes}
                onChangeText={setClaimNotes}
                multiline
              />

              <TouchableOpacity
                style={[styles.claimSubmitBtn, claiming && { opacity: 0.7 }]}
                onPress={handleSubmitClaim}
                disabled={claiming}
                activeOpacity={0.88}
              >
                {claiming ? (
                  <ActivityIndicator color="#FFF" size="small" />
                ) : (
                  <Text style={styles.claimSubmitText}>Submit Claim</Text>
                )}
              </TouchableOpacity>

              <View style={{ height: 24 }} />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      <LeaderboardHowItWorksModal
        visible={isHowItWorksVisible}
        onClose={() => setIsHowItWorksVisible(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  heroBg: {
    paddingHorizontal: H_PAD,
    paddingBottom: 22,
    minHeight: 148,
    overflow: 'hidden',
  },
  heroBgImage: {
    resizeMode: 'cover',
    opacity: 0.28,
  },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(248,244,236,0.72)',
  },
  heroContent: {
    position: 'relative',
    zIndex: 2,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  howBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
  },
  howBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: C.ink,
  },
  heroTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  heroTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: C.text,
    letterSpacing: -0.3,
  },
  heroCrown: {
    fontSize: 22,
    marginTop: -2,
  },
  heroSub: {
    fontSize: 13,
    fontWeight: '600',
    color: C.textSub,
    marginTop: 4,
  },

  statsCard: {
    marginHorizontal: H_PAD,
    marginTop: -14,
    backgroundColor: C.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.border,
    paddingVertical: 14,
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#2B1D15',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 4,
  },
  statsCol: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
    minHeight: 118,
  },
  statsColRewards: {
    gap: 10,
  },
  statsDivider: {
    width: 1,
    alignSelf: 'stretch',
    backgroundColor: C.border,
    marginVertical: 8,
  },
  statsMedalWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  statsLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: C.textSub,
    letterSpacing: 0.8,
    textAlign: 'center',
  },
  statsLabelSpaced: {
    marginTop: 18,
  },
  rankValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginTop: 2,
  },
  statsValue: {
    fontSize: 24,
    fontWeight: '800',
    color: C.text,
    lineHeight: 28,
  },
  rankUpBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#D1FAE5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statsHint: {
    fontSize: 10,
    fontWeight: '600',
    color: C.textSub,
    marginTop: 4,
    textAlign: 'center',
    lineHeight: 13,
    paddingHorizontal: 2,
  },
  pointsValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginTop: 2,
  },
  viewRewardsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: C.ink,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  viewRewardsText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
  },

  tipRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: H_PAD,
    marginTop: 16,
  },
  tipCard: {
    flex: 1,
    backgroundColor: C.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    padding: 12,
    minHeight: 92,
    justifyContent: 'flex-start',
  },
  tipIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  tipText: {
    fontSize: 11,
    fontWeight: '600',
    color: C.textSub,
    lineHeight: 16,
  },

  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: H_PAD,
    marginTop: 24,
    marginBottom: 14,
  },
  sectionIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionHeadCopy: { flex: 1 },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: C.text,
    letterSpacing: 0.4,
  },
  sectionSub: {
    fontSize: 11,
    fontWeight: '600',
    color: C.textSub,
    marginTop: 2,
  },

  rewardScroll: {
    paddingHorizontal: H_PAD,
    gap: 12,
    paddingBottom: 6,
  },
  rewardCard: {
    backgroundColor: C.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.border,
    overflow: 'hidden',
    shadowColor: '#2B1D15',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  rewardImageWrap: {
    height: 132,
    backgroundColor: '#F5EDE3',
    position: 'relative',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
  },
  rewardImage: { width: '100%', height: '100%' },
  rewardImageFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankRibbon: {
    position: 'absolute',
    top: 10,
    left: 10,
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankRibbonText: {
    fontSize: 16,
    fontWeight: '900',
  },
  rewardBody: { padding: 12, gap: 8 },
  rewardTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: C.text,
  },
  rewardPtsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  rewardPtsText: {
    fontSize: 14,
    fontWeight: '800',
    color: C.ink,
  },
  rewardPtsSuffix: {
    fontSize: 12,
    fontWeight: '600',
    color: C.textSub,
  },
  tierPill: {
    alignSelf: 'flex-start',
    backgroundColor: '#FEF3C7',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  tierPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#B45309',
  },
  eligibilityRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  eligibilityText: {
    flex: 1,
    fontSize: 10,
    fontWeight: '600',
    color: C.textSub,
    lineHeight: 14,
  },
  claimBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 12,
    paddingVertical: 11,
    marginTop: 2,
  },
  claimBtnDisabled: { opacity: 0.45 },
  claimBtnText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '800',
  },

  emptyRewards: {
    marginHorizontal: H_PAD,
    backgroundColor: C.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    padding: 20,
    alignItems: 'center',
    gap: 6,
  },
  emptyRewardsTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: C.text,
    marginTop: 4,
  },
  emptyRewardsSub: {
    fontSize: 12,
    fontWeight: '600',
    color: C.textSub,
    textAlign: 'center',
    lineHeight: 17,
  },

  rewardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: H_PAD,
    marginTop: 12,
    marginBottom: 6,
  },
  rewardFooterText: {
    flex: 1,
    fontSize: 10,
    fontWeight: '600',
    color: C.textSub,
    lineHeight: 14,
  },
  rewardFooterLink: {
    fontSize: 10,
    fontWeight: '700',
    color: C.gold,
  },

  rankingsTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: C.text,
    paddingHorizontal: H_PAD,
    marginTop: 18,
    marginBottom: 10,
  },
  segmentWrap: {
    flexDirection: 'row',
    marginHorizontal: H_PAD,
    marginBottom: 14,
    backgroundColor: C.surface,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: C.border,
    padding: 4,
  },
  tabBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: 18,
  },
  tabBtnActive: {
    backgroundColor: C.ink,
  },
  tabBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: C.textSub,
  },
  tabBtnTextActive: {
    color: '#FFFFFF',
  },

  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: H_PAD + 4,
    paddingVertical: 8,
    marginBottom: 4,
  },
  tableHeadCell: {
    fontSize: 10,
    fontWeight: '800',
    color: C.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tableRankHead: { width: 44 },
  tablePlayerHead: { flex: 1, paddingLeft: 4 },
  tablePointsHead: { width: 78, textAlign: 'right' },

  tableBody: {
    paddingHorizontal: H_PAD,
    gap: 8,
    paddingBottom: 8,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  tableRowYou: {
    backgroundColor: '#FFF7ED',
    borderColor: '#E8C99A',
  },
  tableRankCol: {
    width: 44,
    alignItems: 'center',
  },
  tableRank: {
    fontSize: 15,
    fontWeight: '800',
    color: C.text,
  },
  tableRankYou: { color: C.ink },
  tablePlayerCol: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
    paddingRight: 6,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E8DDD0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarYou: { backgroundColor: C.gold },
  avatarLetter: {
    fontSize: 14,
    fontWeight: '800',
    color: C.textSub,
  },
  avatarLetterYou: { color: '#FFF' },
  playerTextWrap: { flex: 1, minWidth: 0 },
  playerName: {
    fontSize: 13,
    fontWeight: '800',
    color: C.text,
  },
  playerMeta: {
    fontSize: 10,
    fontWeight: '600',
    color: C.textMuted,
    marginTop: 1,
  },
  tablePointsCol: {
    width: 78,
    alignItems: 'flex-end',
  },
  tablePointsValue: {
    fontSize: 12,
    fontWeight: '800',
    color: C.text,
  },
  tablePointsLabel: {
    fontSize: 9,
    fontWeight: '600',
    color: C.textMuted,
    marginTop: 1,
  },

  emptyLeader: {
    alignItems: 'center',
    paddingVertical: 28,
    gap: 8,
  },
  emptyLeaderText: {
    fontSize: 13,
    fontWeight: '600',
    color: C.textMuted,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  claimModalSheet: {
    backgroundColor: C.bg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingBottom: 16,
    maxHeight: '90%',
  },
  claimModalHandle: {
    width: 40,
    height: 4,
    backgroundColor: 'rgba(99,48,14,0.18)',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 8,
  },
  claimModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
  },
  claimModalTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '800',
    color: C.ink,
  },
  claimCampaignSummary: {
    backgroundColor: C.card,
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: C.border,
  },
  claimCampaignName: {
    fontSize: 15,
    fontWeight: '800',
    color: C.text,
    marginBottom: 4,
  },
  claimCampaignPts: {
    fontSize: 12,
    fontWeight: '600',
    color: C.gold,
  },
  claimFormLabel: {
    fontSize: 15,
    fontWeight: '800',
    color: C.text,
    marginBottom: 2,
  },
  claimFormSub: {
    fontSize: 12,
    color: C.textSub,
    marginBottom: 16,
    lineHeight: 18,
  },
  claimFieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: C.textSub,
    marginBottom: 6,
    marginTop: 12,
  },
  claimInput: {
    backgroundColor: C.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 14,
    color: C.text,
  },
  claimSubmitBtn: {
    backgroundColor: C.gold,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
  },
  claimSubmitText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '800',
  },
});
