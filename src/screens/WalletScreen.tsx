import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Image,
  Dimensions,
  TextInput,
  Alert,
} from "react-native";
import NetInfo from "@react-native-community/netinfo";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { Ionicons } from "../utils/Icons";
import MaterialCommunityIcons from "react-native-vector-icons/MaterialCommunityIcons";
import { useTheme } from "../context/ThemeContext";
import { spacing, borderRadius, shadows } from "../config/theme";
import { UserProfile } from "../types";
import {
  walletApi,
  WalletProfile,
  WalletTransaction,
  rewardsApi,
  pointRulesApi,
} from "../services/api";
import { DEV_FLAGS } from "../config/devFlags";
import { navigateToVendorReviewMap } from "../navigation/vendorReviewFlow";
import { adsService } from "../services/adsService";
import {
  SERIF,
  SANS,
  SANS_BOLD,
  SANS_SEMI,
} from "../components/profile/profileTheme";
import { useHeaderSafePadding } from "../design/responsive";

interface WalletScreenProps {
  user: UserProfile;
  onBack: () => void;
  onNavigateToRewards: () => void;
  onNavigateToScanner?: () => void;
  walletProfile?: WalletProfile;
}

const { width } = Dimensions.get("window");

type MainTab = "vendor" | "history" | "earn";
type HistorySubTab = "all" | "earned" | "redeemed";
type VendorCategory =
  "All" | "Cafes" | "Restaurants" | "Hotels" | "Activities" | "More";

export default function WalletScreen({
  user,
  onBack,
  onNavigateToRewards,
  onNavigateToScanner,
  walletProfile: initialWalletProfile,
}: WalletScreenProps) {
  const { theme } = useTheme();
  const navigation = useNavigation<any>();
  const headerPadTop = useHeaderSafePadding(12);
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [wallet, setWallet] = useState<WalletProfile | null>(
    initialWalletProfile || null,
  );
  const [transactions, setTransactions] = useState<WalletTransaction[]>(
    initialWalletProfile?.recentTransactions ?? [],
  );
  const [historyError, setHistoryError] = useState(false);

  const [activeTab, setActiveTab] = useState<MainTab>("history");
  const [vendorCategory, setVendorCategory] = useState<VendorCategory>("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [historySubTab, setHistorySubTab] = useState<HistorySubTab>("all");
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [dailyStatus, setDailyStatus] = useState<{
    claimedToday: boolean;
    points: number;
    streak: number;
  } | null>(null);
  const [vendorOffers, setVendorOffers] = useState<any[]>([]);
  const [offersLoading, setOffersLoading] = useState(false);
  const [monthEarnedServer, setMonthEarnedServer] = useState<number | null>(null);
  const [monthRedeemedServer, setMonthRedeemedServer] = useState<number | null>(null);
  const [rewardPoints, setRewardPoints] = useState({
    photo: 5,
    ad: 10,
    review: 10,
    daily: 5,
    checkpoint: 10,
    completion: 100,
    hiddenGem: 50,
    hiddenGemMerge: 25,
  });

  const assertOnline = useCallback(async () => {
    const state = await NetInfo.fetch();
    if (!(state.isConnected && state.isInternetReachable !== false)) {
      throw new Error("You're offline. Please reconnect and try again.");
    }
  }, []);

  const palPoints = wallet?.palPoints ?? user.totalPoints ?? 0;
  const lifetimeEarned = wallet?.lifetimeEarned ?? 0;
  const lifetimeSpent = wallet?.lifetimeSpent ?? 0;

  const monthBounds = (() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  })();

  const thisMonthEarned =
    monthEarnedServer ??
    transactions
      .filter((tx) => tx.type === "EARN" && new Date(tx.createdAt) >= monthBounds)
      .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
  const thisMonthRedeemed =
    monthRedeemedServer ??
    transactions
      .filter((tx) => tx.type === "SPEND" && new Date(tx.createdAt) >= monthBounds)
      .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

  const mapTxIcon = (tx: WalletTransaction) => {
    const reason = (tx.reason || "").toLowerCase();
    if (tx.type === "SPEND" || reason.includes("redeem") || reason.includes("claim")) {
      return { icon: "gift" as const, color: "#E53935", bg: "#FFEBEE", type: "redeemed" as const };
    }
    if (reason.includes("hidden")) {
      return { icon: "diamond" as const, color: "#4CAF50", bg: "#E8F5E9", type: "earned" as const };
    }
    if (reason.includes("review")) {
      return { icon: "pencil" as const, color: "#4CAF50", bg: "#E8F5E9", type: "earned" as const };
    }
    if (reason.includes("login") || reason.includes("daily")) {
      return { icon: "calendar-check" as const, color: "#4CAF50", bg: "#E8F5E9", type: "earned" as const };
    }
    if (reason.includes("photo") || reason.includes("image")) {
      return { icon: "camera" as const, color: "#4CAF50", bg: "#E8F5E9", type: "earned" as const };
    }
    if (tx.type === "EARN" || tx.amount > 0) {
      return { icon: "star" as const, color: "#4CAF50", bg: "#E8F5E9", type: "earned" as const };
    }
    return { icon: "cash" as const, color: "#E53935", bg: "#FFEBEE", type: "redeemed" as const };
  };

  const displayTransactions = transactions.map((tx) => {
    const meta = mapTxIcon(tx);
    return {
      id: tx.id,
      title: tx.reason || (meta.type === "earned" ? "Points earned" : "Points spent"),
      desc: tx.referenceType || "Wallet",
      date: new Date(tx.createdAt).toLocaleString(),
      type: meta.type,
      amount: Math.abs(tx.amount),
      icon: meta.icon,
      color: meta.color,
      bg: meta.bg,
    };
  });

  const fetchData = useCallback(async () => {
    setHistoryError(false);
    try {
      if (DEV_FLAGS.USE_SERVER_API) {
        const [walletRes, txRes] = await Promise.all([
          walletApi.getProfile(),
          walletApi.getTransactions(1, 50),
        ]);
        const data: any = walletRes?.data ?? walletRes;
        if (data) {
          setWallet({
            id: data.id || "wallet",
            userId: data.userId || user.uid,
            palPoints: Number(data.palPoints ?? 0) || 0,
            lifetimeEarned: data.lifetimeEarned ?? 0,
            lifetimeSpent: data.lifetimeSpent ?? 0,
            recentTransactions: data.recentTransactions ?? [],
            thisMonthEarned: data.thisMonthEarned,
            thisMonthRedeemed: data.thisMonthRedeemed,
          });
          if (typeof data.thisMonthEarned === "number") setMonthEarnedServer(data.thisMonthEarned);
          if (typeof data.thisMonthRedeemed === "number") setMonthRedeemedServer(data.thisMonthRedeemed);
        }
        if (txRes?.success && Array.isArray(txRes.data)) {
          setTransactions(txRes.data);
        } else if (Array.isArray((txRes as any)?.data)) {
          setTransactions((txRes as any).data);
        } else if (data?.recentTransactions) {
          setTransactions(data.recentTransactions);
        }
        try {
          const daily = await walletApi.getDailyLoginStatus();
          if (daily) setDailyStatus(daily);
        } catch {
          /* optional */
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
            return typeof row?.points === "number" && row.points > 0 ? row.points : fallback;
          };
          setRewardPoints({
            photo: byKey("place_image_approved", 5),
            ad: byKey("rewarded_ad", 10),
            review: byKey("review_write", 10),
            daily: byKey("daily_login", 5),
            checkpoint: byKey("itinerary_checkpoint", 10),
            completion: byKey("itinerary_completion", 100),
            hiddenGem: byKey("hidden_gem", 50),
            hiddenGemMerge: byKey("hidden_gem_merge", 25),
          });
        } catch {
          /* keep defaults aligned with product rules */
        }
      } else {
        setWallet(
          initialWalletProfile || {
            id: "local",
            userId: user.uid,
            palPoints: user.totalPoints || 0,
            lifetimeEarned: user.totalPoints || 0,
            lifetimeSpent: 0,
            recentTransactions: [],
          },
        );
        setTransactions(initialWalletProfile?.recentTransactions ?? []);
      }
    } catch {
      setHistoryError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [initialWalletProfile, user.uid, user.totalPoints]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchData();
  }, [fetchData]);

  const loadVendorOffers = useCallback(async () => {
    if (!DEV_FLAGS.USE_SERVER_API) return;
    setOffersLoading(true);
    try {
      const res = await rewardsApi.listOffers({ page: 1, limit: 20 });
      const rows = (res as any)?.data ?? res ?? [];
      setVendorOffers(Array.isArray(rows) ? rows : []);
    } catch {
      setVendorOffers([]);
    } finally {
      setOffersLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "vendor") void loadVendorOffers();
  }, [activeTab, loadVendorOffers]);

  const handleWatchAd = useCallback(async () => {
    if (actionBusy) return;
    setActionBusy("ad");
    try {
      await assertOnline();
      await adsService.refreshConfig();
      await adsService.init();
      const result = await adsService.showRewarded();
      if (!result.watched) {
        Alert.alert("Ad unavailable", "Ad unavailable. Please try again.");
        return;
      }
      Alert.alert(
        "Reward processing",
        "Your PalPoints are being processed and will be credited to your wallet shortly."
      );
      await fetchData();
    } catch (err: any) {
      Alert.alert(
        "Unable to process reward",
        err?.message || "Unable to process your reward. Please try again.",
      );
    } finally {
      setActionBusy(null);
    }
  }, [actionBusy, assertOnline, fetchData]);

  const handleClaimDaily = useCallback(async () => {
    if (actionBusy) return;
    if (dailyStatus?.claimedToday) {
      Alert.alert("Already claimed today", "Come back tomorrow for your next login reward.");
      return;
    }
    setActionBusy("daily");
    try {
      await assertOnline();
      const result = await walletApi.claimDailyLogin();
      if (result?.alreadyClaimed) {
        Alert.alert("Already claimed today", "Come back tomorrow for your next login reward.");
      } else if (result?.awarded) {
        Alert.alert("Daily reward", `+${result.points} PalPoints · Streak ${result.streak}`);
      }
      await fetchData();
    } catch (err: any) {
      Alert.alert(
        "Unable to process reward",
        err?.message || "Unable to process your reward. Please try again.",
      );
    } finally {
      setActionBusy(null);
    }
  }, [actionBusy, assertOnline, dailyStatus?.claimedToday, fetchData]);

  const renderEarnTask = (
    icon: string,
    iconColor: string,
    iconBg: string,
    title: string,
    subtitle: string,
    pointsLeft: any,
    pointsRight: string,
    btnText: string,
    btnColor: string,
    extraContent?: React.ReactNode,
    onPress?: () => void,
  ) => {
    return (
      <View style={styles.earnCard}>
        <View style={styles.earnCardLeft}>
          <View style={[styles.earnIconWrap, { backgroundColor: iconBg }]}>
            <MaterialCommunityIcons name={icon} size={28} color={iconColor} />
          </View>
          <View style={styles.earnContent}>
            <Text style={styles.earnTitle}>{title}</Text>
            <Text style={styles.earnSubtitle}>{subtitle}</Text>
            {extraContent}
          </View>
        </View>
        <View style={styles.earnCardRight}>
          <View style={styles.earnPointsCol}>
            {typeof pointsLeft === "string" ? (
              <Text style={styles.earnPointsValue}>{pointsLeft}</Text>
            ) : (
              pointsLeft
            )}
            <Text style={styles.earnPointsLabel}>{pointsRight}</Text>
          </View>
          <TouchableOpacity
            style={[
              styles.earnBtn,
              { borderColor: btnColor },
              (!!actionBusy || !onPress) && { opacity: 0.55 },
            ]}
            onPress={onPress}
            disabled={!!actionBusy || !onPress}
          >
            <Text style={[styles.earnBtnText, { color: btnColor }]}>
              {btnText}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderHistoryTab = () => {
    const filteredTx = displayTransactions.filter(
      (tx) => historySubTab === "all" || tx.type === historySubTab,
    );
    return (
      <View style={styles.historyTabContainer}>
        {/* Point summary removed from here, moved to main layout */}

        <View style={styles.subTabRow}>
          <TouchableOpacity
            style={[
              styles.subTab,
              historySubTab === "all" && styles.subTabActive,
            ]}
            onPress={() => setHistorySubTab("all")}
          >
            <Text
              style={[
                styles.subTabText,
                historySubTab === "all" && styles.subTabTextActive,
              ]}
            >
              All Transactions
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.subTab,
              historySubTab === "earned" && styles.subTabActive,
            ]}
            onPress={() => setHistorySubTab("earned")}
          >
            <Text
              style={[
                styles.subTabText,
                historySubTab === "earned" && { color: "#4CAF50" },
              ]}
            >
              Earned
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.subTab,
              historySubTab === "redeemed" && styles.subTabActive,
            ]}
            onPress={() => setHistorySubTab("redeemed")}
          >
            <Text
              style={[
                styles.subTabText,
                historySubTab === "redeemed" && { color: "#E53935" },
              ]}
            >
              Redeemed
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.txListHeader}>
          <Text style={styles.sectionHeader}>Transaction History</Text>
          <TouchableOpacity style={styles.filterBtn}>
            <Ionicons
              name="calendar-outline"
              size={16}
              color="#3E2723"
              style={{ marginRight: 4 }}
            />
            <Text style={styles.filterBtnText}>Filter</Text>
            <Ionicons
              name="chevron-down"
              size={16}
              color="#3E2723"
              style={{ marginLeft: 4 }}
            />
          </TouchableOpacity>
        </View>

        {historyError ? (
          <View style={{ paddingVertical: 24, alignItems: "center" }}>
            <Text style={styles.earnSubtitle}>Could not load transactions. Pull to refresh.</Text>
          </View>
        ) : filteredTx.length === 0 ? (
          <View style={{ paddingVertical: 24, alignItems: "center" }}>
            <Text style={styles.earnSubtitle}>No transactions yet. Explore and earn Pal Points!</Text>
          </View>
        ) : (
          filteredTx.map((tx) => (
          <View key={tx.id} style={styles.txItem}>
            <View style={[styles.txIcon, { backgroundColor: tx.bg }]}>
              <MaterialCommunityIcons
                name={tx.icon}
                size={24}
                color={tx.color}
              />
            </View>
            <View style={styles.txInfo}>
              <Text style={styles.txTitle}>{tx.title}</Text>
              <Text style={styles.txDesc}>{tx.desc}</Text>
              <View style={styles.txDateRow}>
                <Ionicons
                  name="calendar-outline"
                  size={12}
                  color="#8D8177"
                  style={{ marginRight: 4 }}
                />
                <Text style={styles.txDate}>{tx.date}</Text>
              </View>
            </View>
            <View style={styles.txRight}>
              <Text
                style={[
                  styles.txAmount,
                  { color: tx.type === "earned" ? "#4CAF50" : "#E53935" },
                ]}
              >
                {tx.type === "earned" ? "+" : "-"}
                {tx.amount}
              </Text>
              <Text style={styles.txLabel}>
                {tx.type === "earned" ? "Earned" : "Redeemed"}
              </Text>
            </View>
            <Ionicons
              name="chevron-forward"
              size={20}
              color="#8D8177"
              style={{ marginLeft: 8 }}
            />
          </View>
          ))
        )}
      </View>
    );
  };

  const renderEarnTab = () => {
    return (
      <View style={styles.earnTabContainer}>
        <View style={styles.earnHeaderBanner}>
          <View style={styles.earnHeaderContent}>
            <Text style={styles.earnHeaderTitle}>
              Ways to Earn PalPoints{" "}
              <Ionicons name="sparkles" size={18} color="#D4A87A" />
            </Text>
            <Text style={styles.earnHeaderSubtitle}>
              Complete actions and earn exciting rewards!
            </Text>
          </View>
          <MaterialCommunityIcons
            name="gift-outline"
            size={48}
            color="#388E3C"
            style={{ position: "absolute", right: 20, top: 10, opacity: 0.2 }}
          />
        </View>

        {renderEarnTask(
          "diamond-outline",
          "#388E3C",
          "#E8F5E9",
          "Earn by submitting hidden gem",
          "Share hidden gems and get rewarded",
          `+${rewardPoints.hiddenGemMerge} to +${rewardPoints.hiddenGem}`,
          "PalPoints",
          "Submit now",
          "#388E3C",
          undefined,
          () => navigation.navigate("AddHiddenGem"),
        )}
        {renderEarnTask(
          "pencil-outline",
          "#388E3C",
          "#E8F5E9",
          "Earn by submitting Review",
          "Write reviews and help others",
          `+${rewardPoints.review}`,
          "PalPoints",
          "Write now",
          "#388E3C",
          undefined,
          () => navigateToVendorReviewMap(navigation),
        )}
        {renderEarnTask(
          "play-circle-outline",
          "#1976D2",
          "#E3F2FD",
          "Earn by watching Ads",
          "Watch ads and earn PalPoints",
          `+${rewardPoints.ad}`,
          "PalPoints",
          actionBusy === "ad" ? "Loading ad…" : "Watch now",
          "#1976D2",
          undefined,
          () => { void handleWatchAd(); },
        )}
        {renderEarnTask(
          "camera-outline",
          "#7B1FA2",
          "#F3E5F5",
          "Earn by uploading place photo",
          "Upload photos of places you visit",
          `+${rewardPoints.photo}`,
          "PalPoints",
          "Upload now",
          "#7B1FA2",
          undefined,
          () => navigation.navigate("UploadPlacePhoto")
        )}

        {renderEarnTask(
          "source-branch",
          "#E64A19",
          "#FBE9E7",
          "Earn by completing Itinerary",
          "Visit places in your itinerary",
          <View style={styles.itineraryPoints}>
            <Text style={styles.itineraryPointsText}>
              <Text style={{ color: "#388E3C" }}>+{rewardPoints.checkpoint}</Text> / place
            </Text>
            <Text style={styles.itineraryPointsText}>
              <Text style={{ color: "#388E3C" }}>+{rewardPoints.completion}</Text> bonus
            </Text>
          </View>,
          "PalPoints",
          "Explore now",
          "#E64A19",
          <View style={styles.itineraryExtra}>
            <Ionicons name="star" size={12} color="#F57C00" />
            <Text style={styles.itineraryExtraText}>
              +{rewardPoints.checkpoint} per place • +{rewardPoints.completion} bonus on completion
            </Text>
          </View>,
          () => navigation.navigate("MyTrips"),
        )}

        {renderEarnTask(
          "calendar-check-outline",
          "#F57C00",
          "#FFF3E0",
          "Earn by daily login",
          "Login daily and build your streak",
          `+${dailyStatus?.points ?? rewardPoints.daily}`,
          "PalPoints",
          dailyStatus?.claimedToday
            ? "Claimed"
            : actionBusy === "daily"
              ? "Claiming…"
              : "Claim now",
          "#F57C00",
          <View style={styles.dailyLoginExtra}>
            <Text style={styles.dailyStreakText}>
              Day streak: {dailyStatus?.streak ?? 0}
            </Text>
            <Text style={styles.dailyRewardText}>
              {dailyStatus?.claimedToday
                ? "Already claimed today"
                : `+${dailyStatus?.points ?? rewardPoints.daily}`}
            </Text>
          </View>,
          () => { void handleClaimDaily(); },
        )}

        <View style={styles.infoBanner}>
          <Ionicons name="information-circle" size={16} color="#BCAAA4" />
          <Text style={styles.infoBannerText}>
            PalPoints will be added to your account once the action is
            completed.
          </Text>
          <Ionicons
            name="sparkles"
            size={16}
            color="#D4A87A"
            style={{ marginLeft: "auto" }}
          />
        </View>
      </View>
    );
  };

  const vendorCategories: {
    id: VendorCategory;
    icon: string;
    lib: "ion" | "mci";
  }[] = [
    { id: "All", icon: "apps-outline", lib: "ion" },
    { id: "Cafes", icon: "coffee-outline", lib: "mci" },
    { id: "Restaurants", icon: "silverware-fork-knife", lib: "mci" },
    { id: "Hotels", icon: "bed-outline", lib: "ion" },
    { id: "Activities", icon: "hiking", lib: "mci" },
    { id: "More", icon: "ellipsis-horizontal", lib: "ion" },
  ];

  const vendorOffersData = [
    {
      id: "1",
      type: "Cafe",
      name: "Cafe Coffee Day",
      rating: 4.5,
      offer: "20% OFF on total bill",
      location: "3.2 km away • Napier Town, Jabalpur",
      valid: "31 May 2025",
      points: 500,
      save: "₹120",
      bg: "#4E342E",
    },
    {
      id: "2",
      type: "Restaurant",
      name: "Burger Point",
      rating: 4.3,
      offer: "Flat ₹200 OFF on orders above ₹999",
      location: "2.1 km away • Wright Town, Jabalpur",
      valid: "25 May 2025",
      points: 800,
      save: "₹200",
      bg: "#E65100",
    },
    {
      id: "3",
      type: "Hotel",
      name: "Hotel Samdareeya Palace",
      rating: 4.6,
      offer: "Flat ₹1000 OFF on room booking",
      location: "5.4 km away • South Civil Lines, Jabalpur",
      valid: "30 Jun 2025",
      points: 2500,
      save: "₹1000",
      bg: "#3E2723",
    },
    {
      id: "4",
      type: "Activity",
      name: "Mad Adventures",
      rating: 4.4,
      offer: "10% OFF on all adventure activities",
      location: "7.0 km away • Bhedaghat, Jabalpur",
      valid: "20 May 2025",
      points: 300,
      save: "₹80",
      bg: "#1B5E20",
    },
  ];

  const renderVendorTab = () => {
    return (
      <View style={styles.vendorTabContainer}>
        <View style={styles.searchContainer}>
          <Ionicons
            name="search-outline"
            size={20}
            color="#8D8177"
            style={{ marginRight: 8 }}
          />
          <TextInput
            style={styles.searchInput}
            placeholder="Search for offers, cafes, hotels..."
            placeholderTextColor="#8D8177"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.categoryScroll}
          contentContainerStyle={styles.categoryScrollContent}
        >
          {vendorCategories.map((cat) => {
            const isActive = vendorCategory === cat.id;
            return (
              <TouchableOpacity
                key={cat.id}
                style={[styles.catBadge, isActive && styles.catBadgeActive]}
                onPress={() => setVendorCategory(cat.id)}
              >
                {cat.lib === "ion" ? (
                  <Ionicons
                    name={cat.icon as any}
                    size={14}
                    color={isActive ? "#FFF" : "#3E2723"}
                    style={{ marginRight: 6 }}
                  />
                ) : (
                  <MaterialCommunityIcons
                    name={cat.icon as any}
                    size={14}
                    color={isActive ? "#FFF" : "#3E2723"}
                    style={{ marginRight: 6 }}
                  />
                )}
                <Text
                  style={[
                    styles.catBadgeText,
                    isActive && styles.catBadgeTextActive,
                  ]}
                >
                  {cat.id}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <View style={styles.topDealsBanner}>
          <View style={styles.topDealsLeft}>
            <View style={styles.crownWrap}>
              <MaterialCommunityIcons name="crown" size={28} color="#F57C00" />
            </View>
            <View style={styles.topDealsContent}>
              <Text style={styles.topDealsTitle}>Top Deals Just for You!</Text>
              <Text style={styles.topDealsDesc}>
                Handpicked offers you don't want to miss.
              </Text>
            </View>
          </View>
          <TouchableOpacity
            style={styles.topDealsBtn}
            onPress={() => {
              if (onNavigateToRewards) onNavigateToRewards();
              else navigation.navigate("Rewards");
            }}
            accessibilityLabel="View top vendor deals"
          >
            <Text style={styles.topDealsBtnText}>View Top Deals</Text>
            <Ionicons
              name="chevron-forward"
              size={12}
              color="#FFF"
              style={{ marginLeft: 4 }}
            />
          </TouchableOpacity>
        </View>

        <View style={styles.offersList}>
          {offersLoading ? (
            <ActivityIndicator color="#E64A19" style={{ marginVertical: 24 }} />
          ) : null}
          {(vendorOffers.length
            ? vendorOffers.map((o: any) => ({
                id: o.id,
                type: o.category || o.vendorType || "Offer",
                name: o.vendor?.businessName || o.title || o.name || "Vendor offer",
                rating: o.vendor?.rating ?? 0,
                offer: o.title || o.description || "Special offer",
                location: [o.vendor?.city, o.vendor?.state].filter(Boolean).join(", ") || "Nearby",
                valid: o.validUntil ? new Date(o.validUntil).toLocaleDateString() : "Limited time",
                points: o.pointsCost ?? o.palPointsCost ?? 0,
                save: o.savingsLabel || "",
                bg: "#4E342E",
              }))
            : vendorOffersData
          ).map((offer: any) => (
            <View key={offer.id} style={styles.offerCard}>
              <View
                style={[
                  styles.offerImagePlaceholder,
                  { backgroundColor: offer.bg },
                ]}
              >
                <Ionicons
                  name="image-outline"
                  size={32}
                  color="rgba(255,255,255,0.5)"
                />
              </View>

              <View style={styles.offerMid}>
                <View style={styles.offerTypeRow}>
                  <View style={styles.offerTypeBadge}>
                    <Text style={styles.offerTypeText}>{offer.type}</Text>
                  </View>
                  <Text style={styles.offerName} numberOfLines={1}>
                    {offer.name}
                  </Text>
                  <Ionicons
                    name="star"
                    size={12}
                    color="#F57C00"
                    style={{ marginLeft: 6, marginRight: 2 }}
                  />
                  <Text style={styles.offerRating}>{offer.rating}</Text>
                </View>
                <Text style={styles.offerDesc}>{offer.offer}</Text>
                <View style={styles.offerLocRow}>
                  <Ionicons
                    name="location-outline"
                    size={10}
                    color="#8D8177"
                    style={{ marginRight: 4 }}
                  />
                  <Text style={styles.offerLocText}>{offer.location}</Text>
                </View>
                <View style={styles.offerValidBadge}>
                  <Text style={styles.offerValidText}>
                    Valid till {offer.valid}
                  </Text>
                </View>
              </View>

              <View style={styles.offerRight}>
                <View style={styles.offerPointsWrap}>
                  <Text style={styles.offerPointsVal}>
                    {offer.points.toLocaleString()}
                  </Text>
                  <Text style={styles.offerPointsLabel}>PalPoints</Text>
                </View>
                <Text style={styles.offerSaveText}>You save {offer.save}</Text>
                <TouchableOpacity
                  style={styles.redeemBtn}
                  onPress={() => {
                    if (String(offer.id).length > 8) {
                      navigation.navigate("VendorOfferDetail", { offerId: offer.id });
                    } else if (onNavigateToRewards) {
                      onNavigateToRewards();
                    } else {
                      navigation.navigate("Rewards");
                    }
                  }}
                  accessibilityLabel={`Redeem ${offer.name}`}
                >
                  <Text style={styles.redeemBtnText}>Redeem</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.offerChevronWrap}>
                <Ionicons name="chevron-forward" size={16} color="#8D8177" />
              </View>
            </View>
          ))}
        </View>

        <View style={styles.vendorFooter}>
          <Ionicons
            name="information-circle-outline"
            size={16}
            color="#8D8177"
            style={{ marginRight: 6 }}
          />
          <Text style={styles.vendorFooterText}>
            Offers are limited and can be redeemed using your PalPoints.
          </Text>
          <TouchableOpacity>
            <Text style={styles.vendorFooterLink}>
              View Terms & Conditions{" "}
              <Ionicons name="chevron-forward" size={10} />
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  if (loading && !refreshing) {
    return (
      <View style={[styles.container, { backgroundColor: "#FDF9F1" }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3A1F13" />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: "#FDF9F1" }]}>
      {/* Header Section */}
      <View style={[styles.header, { paddingTop: headerPadTop }]}>
        <View style={styles.headerLeftRow}>
          <TouchableOpacity onPress={onBack} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="chevron-back" size={28} color="#1E1B18" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>PalPoints</Text>
        </View>
        <TouchableOpacity style={styles.earnMoreBtn} onPress={() => navigation.navigate("HowItWorks")}>
          <MaterialCommunityIcons name="gift-outline" size={16} color="#4E3316" style={{ marginRight: 6 }} />
          <Text style={styles.earnMoreText}>Earn More</Text>
          <Ionicons name="chevron-forward" size={16} color="#4E3316" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 24) + 80 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#3A1F13"
          />
        }
      >
        {/* Balance Card */}
        <View style={styles.balanceCardWrap}>
          <View style={styles.balanceCard}>
            {/* Soft Glow Effect */}
            <View style={styles.balanceCardGlow} />

            <View style={styles.balanceCardLeft}>
              <View style={styles.coinGraphicWrap}>
                <Image source={require('../assets/palpoint icon.png')} style={styles.coinGraphic} />
                <Ionicons name="sparkles" size={14} color="#FFE082" style={styles.sparkle1} />
                <Ionicons name="sparkles" size={10} color="#FFE082" style={styles.sparkle2} />
                <Ionicons name="sparkles" size={18} color="#FFE082" style={styles.sparkle3} />
                <Ionicons name="sparkles" size={12} color="#FFE082" style={styles.sparkle4} />
              </View>
              <View style={styles.balanceTextWrap}>
                <Text style={styles.balanceTitle}>Total PalPoint{'\n'}Balance</Text>
                <Text style={styles.balanceValue}>
                  {palPoints.toLocaleString()}
                </Text>
                <Text style={styles.balanceLabel}>PalPoints</Text>
              </View>
            </View>

            <View style={styles.balanceCardDivider} />

            <View style={styles.balanceCardRight}>
              <View style={styles.statRow}>
                <View style={[styles.statIconWrap, { backgroundColor: 'rgba(76, 175, 80, 0.2)' }]}>
                  <Ionicons name="trending-up" size={16} color="#81C784" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.statTitle}>This Month Earned</Text>
                  <Text style={styles.statValuePositive}>
                    +{thisMonthEarned.toLocaleString()} <Text style={styles.statLabelSm}>PalPoints</Text>
                  </Text>
                </View>
              </View>

              <View style={styles.statRowSpace} />

              <View style={styles.statRow}>
                <View style={[styles.statIconWrap, { backgroundColor: 'rgba(229, 57, 53, 0.2)' }]}>
                  <Ionicons name="arrow-down" size={16} color="#E57373" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.statTitle}>This Month Redeemed</Text>
                  <Text style={styles.statValueNegative}>
                    -{thisMonthRedeemed.toLocaleString()} <Text style={styles.statLabelSm}>PalPoints</Text>
                  </Text>
                </View>
              </View>
            </View>
          </View>
        </View>

        {/* Quick Actions */}
        <View style={styles.quickActionsContainer}>
          <TouchableOpacity 
            style={activeTab === "history" ? styles.actionBtnDark : styles.actionBtnLight} 
            onPress={() => setActiveTab("history")}
          >
            <MaterialCommunityIcons 
              name="clock-outline" 
              size={20} 
              color={activeTab === "history" ? "#FFF" : "#3E2723"} 
              style={{ marginRight: 8 }} 
            />
            <Text style={activeTab === "history" ? styles.actionBtnDarkText : styles.actionBtnLightText}>
              PalPoint History
            </Text>
            <View style={{ flex: 1 }} />
            <Ionicons 
              name="chevron-forward" 
              size={18} 
              color={activeTab === "history" ? "#FFF" : "#3E2723"} 
            />
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={activeTab === "earn" ? styles.actionBtnDark : styles.actionBtnLight} 
            onPress={() => setActiveTab("earn")}
          >
            <MaterialCommunityIcons 
              name="gift-outline" 
              size={20} 
              color={activeTab === "earn" ? "#FFF" : "#3E2723"} 
              style={{ marginRight: 8 }} 
            />
            <Text style={activeTab === "earn" ? styles.actionBtnDarkText : styles.actionBtnLightText}>
              Earn PalPoints
            </Text>
            <View style={{ flex: 1 }} />
            <Ionicons 
              name="chevron-forward" 
              size={18} 
              color={activeTab === "earn" ? "#FFF" : "#3E2723"} 
            />
          </TouchableOpacity>
        </View>

        {/* Point Summary */}
        <View style={styles.sectionHeaderWrap}>
          <Text style={styles.sectionTitle}>Point Summary</Text>
        </View>
        
        <View style={styles.summaryCard}>
          <View style={styles.summaryCol}>
            <View style={[styles.summaryIcon, { backgroundColor: '#E8F5E9' }]}>
              <Ionicons name="arrow-up" size={20} color="#4CAF50" />
            </View>
            <Text style={styles.summaryTitle}>Total Earned</Text>
            <Text style={[styles.summaryVal, { color: '#4CAF50' }]}>{lifetimeEarned.toLocaleString()}</Text>
          </View>
          <View style={styles.summaryDiv} />
          
          <View style={styles.summaryCol}>
            <View style={[styles.summaryIcon, { backgroundColor: '#FFEBEE' }]}>
              <Ionicons name="arrow-down" size={20} color="#E53935" />
            </View>
            <Text style={styles.summaryTitle}>Total Redeemed</Text>
            <Text style={[styles.summaryVal, { color: '#E53935' }]}>{lifetimeSpent.toLocaleString()}</Text>
          </View>
          <View style={styles.summaryDiv} />

          <View style={styles.summaryCol}>
            <View style={[styles.summaryIcon, { backgroundColor: '#FFF3E0' }]}>
              <Ionicons name="wallet-outline" size={20} color="#FF9800" />
            </View>
            <Text style={styles.summaryTitle}>Available{'\n'}Balance</Text>
            <Text style={styles.summaryVal}>{palPoints.toLocaleString()}</Text>
          </View>
          <View style={styles.summaryDiv} />

          <View style={styles.summaryCol}>
            <View style={[styles.summaryIcon, { backgroundColor: '#E3F2FD' }]}>
              <Ionicons name="calendar-outline" size={20} color="#2196F3" />
            </View>
            <Text style={styles.summaryTitle}>This Month{'\n'}Earned</Text>
            <Text style={[styles.summaryVal, { color: '#2196F3' }]}>{thisMonthEarned.toLocaleString()}</Text>
          </View>
        </View>

        {/* Tab Content */}
        {activeTab === "history" && renderHistoryTab()}
        {activeTab === "earn" && renderEarnTab()}

        <View style={{ height: Math.max(insets.bottom, 24) + 80 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 16,
    backgroundColor: "#FDF9F1",
  },
  headerLeft: {
    flex: 1,
  },
  headerTitle: {
    fontFamily: SERIF,
    fontSize: 28,
    fontWeight: "800",
    color: "#2C1810",
  },
  headerSubtitle: {
    fontFamily: SANS,
    fontSize: 12,
    color: "#70685D",
    marginTop: 2,
  },
  howItWorksBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFDF9",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#E8D2BB",
    marginTop: 4,
  },
  howItWorksText: {
    fontFamily: SANS_SEMI,
    fontSize: 10,
    color: "#2C1810",
    marginLeft: 4,
  },
  content: {
    flex: 1,
  },
  balanceCardWrap: {
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  balanceCard: {
    flexDirection: "row",
    backgroundColor: "#2B2118",
    borderRadius: 16,
    padding: 24,
    position: "relative",
    overflow: "hidden",
    ...shadows.md,
  },
  balanceCardGlow: {
    position: "absolute",
    top: -60,
    right: -40,
    width: 250,
    height: 250,
    borderRadius: 125,
    backgroundColor: "rgba(180, 130, 80, 0.4)",
    opacity: 0.5,
  },
  balanceCardLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1.1,
    zIndex: 2,
  },
  coinGraphicWrap: {
    position: "relative",
    width: 72,
    height: 72,
    marginRight: 16,
  },
  coinGraphic: {
    width: 72,
    height: 72,
    resizeMode: "contain",
  },
  sparkle1: { position: "absolute", top: 0, left: -5 },
  sparkle2: { position: "absolute", top: 15, right: -5 },
  sparkle3: { position: "absolute", bottom: -5, right: 0 },
  sparkle4: { position: "absolute", bottom: 10, left: -10 },
  balanceTextWrap: {
    flex: 1,
  },
  balanceTitle: {
    fontFamily: SANS,
    fontSize: 12,
    color: "#FFF",
    marginBottom: 4,
  },
  balanceValue: {
    fontFamily: SANS_BOLD,
    fontSize: 36,
    color: "#FFF",
    lineHeight: 40,
  },
  balanceLabel: {
    fontFamily: SANS,
    fontSize: 11,
    color: "#A79D96",
  },
  balanceCardDivider: {
    width: 1,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    marginHorizontal: 16,
    marginVertical: 4,
  },
  balanceCardRight: {
    flex: 1,
    justifyContent: "center",
    zIndex: 2,
  },
  statRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  statTitle: {
    fontFamily: SANS,
    fontSize: 11,
    color: "#FFF",
    marginBottom: 2,
  },
  statValuePositive: {
    fontFamily: SANS_BOLD,
    fontSize: 18,
    color: "#81C784",
  },
  statValueNegative: {
    fontFamily: SANS_BOLD,
    fontSize: 18,
    color: "#E57373",
  },
  statLabel: {
    fontFamily: SANS,
    fontSize: 9,
    color: "#70685D",
  },
  walletGraphic: {
    position: "absolute",
    right: -30,
    bottom: -20,
    width: 160,
    height: 160,
    opacity: 0.25,
    zIndex: 1,
  },
  mainTabsContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FDF7EB",
    marginHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E8D2BB",
    padding: 4,
    marginBottom: 24,
  },
  mainTab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    paddingHorizontal: 2,
    borderRadius: 8,
  },
  mainTabActive: {
    backgroundColor: "#3E2723",
  },
  mainTabText: {
    fontFamily: SANS_SEMI,
    fontSize: 10,
    color: "#3E2723",
  },
  mainTabTextActive: {
    color: "#FFF",
  },
  tabSeparator: {
    width: 1,
    height: 20,
    backgroundColor: "#E8D2BB",
  },
  // History Tab Styles
  historyTabContainer: {
    paddingHorizontal: 16,
  },
  sectionHeader: {
    fontFamily: SERIF,
    fontSize: 16,
    fontWeight: "800",
    color: "#3E2723",
    marginBottom: 12,
  },
  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    backgroundColor: "#FFF",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#F3E9DD",
    marginBottom: 16,
  },
  summaryItem: {
    width: "23%",
    alignItems: "center",
  },
  summaryIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  summaryLabel: {
    fontFamily: SANS,
    fontSize: 9,
    color: "#70685D",
    textAlign: "center",
    lineHeight: 12,
    marginBottom: 4,
    height: 24,
  },
  summaryValue: {
    fontFamily: SANS_BOLD,
    fontSize: 14,
  },
  subTabRow: {
    flexDirection: "row",
    backgroundColor: "#FDF5E6",
    borderRadius: 8,
    padding: 4,
    marginHorizontal: 20,
    marginBottom: 24,
  },
  subTab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: 6,
  },
  subTabActive: {
    backgroundColor: "#3E2723",
  },
  subTabText: {
    fontFamily: SANS_SEMI,
    fontSize: 12,
    color: "#70685D",
  },
  subTabTextActive: {
    color: "#FFF",
  },
  txListHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginHorizontal: 20,
    marginBottom: 12,
  },
  filterBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#EAD6C3",
  },
  filterBtnText: {
    fontFamily: SANS_SEMI,
    fontSize: 11,
    color: "#3E2723",
  },
  txItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF",
    marginHorizontal: 20,
    marginBottom: 12,
    padding: 16,
    borderRadius: 16,
    ...shadows.sm,
  },
  txIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  txInfo: {
    flex: 1,
  },
  txTitle: {
    fontFamily: SANS_BOLD,
    fontSize: 13,
    color: "#1E1B18",
    marginBottom: 2,
  },
  txDesc: {
    fontFamily: SANS,
    fontSize: 11,
    color: "#70685D",
    marginBottom: 4,
  },
  txDateRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  txDate: {
    fontFamily: SANS,
    fontSize: 10,
    color: "#8D8177",
  },
  txRight: {
    alignItems: "flex-end",
  },
  txAmount: {
    fontFamily: SANS_BOLD,
    fontSize: 14,
  },
  txLabel: {
    fontFamily: SANS,
    fontSize: 10,
    color: "#70685D",
  },
  // Earn Tab Styles
  earnTabContainer: {
    paddingHorizontal: 16,
  },
  earnHeaderBanner: {
    backgroundColor: "#FFF9F0",
    borderRadius: 16,
    padding: 16,
    flexDirection: "row",
    borderWidth: 1,
    borderColor: "#F3E9DD",
    marginBottom: 16,
    position: "relative",
    overflow: "hidden",
  },
  earnHeaderContent: {
    flex: 1,
  },
  earnHeaderTitle: {
    fontFamily: SERIF,
    fontSize: 18,
    fontWeight: "800",
    color: "#3E2723",
    marginBottom: 4,
  },
  earnHeaderSubtitle: {
    fontFamily: SANS,
    fontSize: 12,
    color: "#70685D",
  },
  earnCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF",
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#F3E9DD",
  },
  earnCardLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  earnIconWrap: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  earnContent: {
    flex: 1,
    paddingRight: 8,
  },
  earnTitle: {
    fontFamily: SANS_BOLD,
    fontSize: 13,
    color: "#1E1B18",
    marginBottom: 2,
  },
  earnSubtitle: {
    fontFamily: SANS,
    fontSize: 11,
    color: "#70685D",
  },
  earnCardRight: {
    alignItems: "center",
    justifyContent: "center",
    width: 85,
  },
  earnPointsCol: {
    alignItems: "center",
    marginBottom: 8,
  },
  earnPointsValue: {
    fontFamily: SANS_BOLD,
    fontSize: 14,
    color: "#388E3C",
  },
  earnPointsLabel: {
    fontFamily: SANS,
    fontSize: 10,
    color: "#70685D",
  },
  earnBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    width: "100%",
    alignItems: "center",
  },
  earnBtnText: {
    fontFamily: SANS_SEMI,
    fontSize: 10,
  },
  itineraryExtra: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF3E0",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 6,
    alignSelf: "flex-start",
  },
  itineraryExtraText: {
    fontFamily: SANS_SEMI,
    fontSize: 9,
    color: "#F57C00",
    marginLeft: 4,
  },
  itineraryPoints: {
    alignItems: "center",
  },
  itineraryPointsText: {
    fontFamily: SANS_BOLD,
    fontSize: 11,
    color: "#70685D",
  },
  dailyLoginExtra: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 6,
  },
  dailyStreakText: {
    fontFamily: SANS_SEMI,
    fontSize: 10,
    color: "#E64A19",
    backgroundColor: "#FBE9E7",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginRight: 6,
  },
  dailyRewardText: {
    fontFamily: SANS_SEMI,
    fontSize: 10,
    color: "#F57C00",
  },
  infoBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FDF7EB",
    padding: 12,
    borderRadius: 8,
    marginTop: 4,
  },
  infoBannerText: {
    fontFamily: SANS,
    fontSize: 10,
    color: "#70685D",
    marginLeft: 6,
    flex: 1,
  },

  // Vendor Tab Styles
  vendorTabContainer: {
    paddingHorizontal: 16,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#E8D2BB",
    marginBottom: 16,
  },
  searchInput: {
    flex: 1,
    fontFamily: SANS,
    fontSize: 14,
    color: "#3E2723",
    padding: 0,
  },
  categoryScroll: {
    marginBottom: 16,
  },
  categoryScrollContent: {
    paddingRight: 16,
  },
  catBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginRight: 8,
    borderWidth: 1,
    borderColor: "#E8D2BB",
  },
  catBadgeActive: {
    backgroundColor: "#3E2723",
    borderColor: "#3E2723",
  },
  catBadgeText: {
    fontFamily: SANS_SEMI,
    fontSize: 12,
    color: "#3E2723",
  },
  catBadgeTextActive: {
    color: "#FFF",
  },
  topDealsBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FDF7EB",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#F3E9DD",
    marginBottom: 16,
  },
  topDealsLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  crownWrap: {
    width: 48,
    height: 48,
    backgroundColor: "#FFF3E0",
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  topDealsContent: {
    flex: 1,
  },
  topDealsTitle: {
    fontFamily: SERIF,
    fontSize: 15,
    fontWeight: "800",
    color: "#3E2723",
    marginBottom: 4,
  },
  topDealsDesc: {
    fontFamily: SANS,
    fontSize: 11,
    color: "#70685D",
  },
  topDealsBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#3E2723",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  topDealsBtnText: {
    fontFamily: SANS_SEMI,
    fontSize: 11,
    color: "#FFF",
  },
  offersList: {
    marginBottom: 16,
  },
  offerCard: {
    flexDirection: "row",
    backgroundColor: "#FFF",
    borderRadius: 16,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#F3E9DD",
  },
  offerImagePlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  offerMid: {
    flex: 1,
    paddingRight: 8,
  },
  offerTypeRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  offerTypeBadge: {
    backgroundColor: "#5D4037",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginRight: 6,
  },
  offerTypeText: {
    fontFamily: SANS_SEMI,
    fontSize: 9,
    color: "#FFF",
  },
  offerName: {
    fontFamily: SANS_BOLD,
    fontSize: 13,
    color: "#1E1B18",
    flex: 1,
    marginRight: 4,
  },
  offerRating: {
    fontFamily: SANS_BOLD,
    fontSize: 10,
    color: "#F57C00",
  },
  offerDesc: {
    fontFamily: SANS_BOLD,
    fontSize: 11,
    color: "#3E2723",
    marginBottom: 6,
  },
  offerLocRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  offerLocText: {
    fontFamily: SANS,
    fontSize: 10,
    color: "#8D8177",
  },
  offerValidBadge: {
    backgroundColor: "#E8F5E9",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: "flex-start",
  },
  offerValidText: {
    fontFamily: SANS_SEMI,
    fontSize: 9,
    color: "#388E3C",
  },
  offerRight: {
    width: 75,
    alignItems: "center",
    justifyContent: "center",
  },
  offerChevronWrap: {
    justifyContent: "center",
    alignItems: "center",
    paddingLeft: 4,
  },
  offerPointsWrap: {
    alignItems: "center",
    marginBottom: 4,
  },
  offerPointsVal: {
    fontFamily: SANS_BOLD,
    fontSize: 16,
    color: "#3E2723",
  },
  offerPointsLabel: {
    fontFamily: SANS_SEMI,
    fontSize: 10,
    color: "#70685D",
  },
  offerSaveText: {
    fontFamily: SANS_SEMI,
    fontSize: 9,
    color: "#388E3C",
    marginBottom: 8,
  },
  redeemBtn: {
    backgroundColor: "#388E3C",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    width: "100%",
    alignItems: "center",
  },
  redeemBtnText: {
    fontFamily: SANS_SEMI,
    fontSize: 11,
    color: "#FFF",
  },
  vendorFooter: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FDF7EB",
    padding: 12,
    borderRadius: 8,
  },
  vendorFooterText: {
    flex: 1,
    fontFamily: SANS,
    fontSize: 10,
    color: "#70685D",
  },
  vendorFooterLink: {
    fontFamily: SANS_BOLD,
    fontSize: 10,
    color: "#3E2723",
  },
  headerLeftRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  earnMoreBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FDF5E6",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#EAD6C3",
  },
  earnMoreText: {
    fontFamily: SANS_SEMI,
    fontSize: 12,
    color: "#4E3316",
    marginRight: 4,
  },
  statIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  statRowSpace: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.1)",
    marginVertical: 12,
  },
  statLabelSm: {
    fontFamily: SANS,
    fontSize: 10,
    color: "#A79D96",
    marginLeft: 4,
  },
  quickActionsContainer: {
    flexDirection: "row",
    paddingHorizontal: 20,
    marginBottom: 24,
    gap: 12,
  },
  actionBtnDark: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#3E2723",
    padding: 16,
    borderRadius: 12,
    ...shadows.sm,
  },
  actionBtnDarkText: {
    fontFamily: SANS_SEMI,
    fontSize: 13,
    color: "#FFF",
  },
  actionBtnLight: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF",
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#F0EAE1",
    ...shadows.sm,
  },
  actionBtnLightText: {
    fontFamily: SANS_SEMI,
    fontSize: 13,
    color: "#3E2723",
  },
  sectionHeaderWrap: {
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  sectionTitle: {
    fontFamily: SANS_BOLD,
    fontSize: 18,
    color: "#1E1B18",
  },
  summaryCard: {
    flexDirection: "row",
    backgroundColor: "#FFF",
    marginHorizontal: 20,
    paddingVertical: 20,
    borderRadius: 16,
    alignItems: "flex-start",
    marginBottom: 32,
    ...shadows.sm,
  },
  summaryCol: {
    flex: 1,
    alignItems: "center",
  },
  summaryIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  summaryTitle: {
    fontFamily: SANS,
    fontSize: 10,
    color: "#70685D",
    textAlign: "center",
    marginBottom: 8,
  },
  summaryVal: {
    fontFamily: SANS_BOLD,
    fontSize: 20,
    color: "#1E1B18",
  },
  summaryDiv: {
    width: 1,
    height: "100%",
    backgroundColor: "#F0EAE1",
  },
});
