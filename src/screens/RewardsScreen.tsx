import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Text,
  RefreshControl,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { rewardsApi, VendorOfferItem, NearbyReward } from '../services/api';
import { UserProfile } from '../types';
import { useUserContext } from '../context/UserContext';
import HomeSidebar from '../components/HomeSidebar';

import { RewardsHeader } from '../components/rewards/RewardsHeader';
import { HeroBanner } from '../components/rewards/HeroBanner';
import { CategoryTabs } from '../components/rewards/CategoryTabs';
import { FeaturedOfferCard } from '../components/rewards/FeaturedOfferCard';
import { OfferCard } from '../components/rewards/OfferCard';

const COLORS = {
  background: '#FFFFFF',
  white: '#FFFFFF',
  text: '#202020',
  textMuted: '#6D6D6D',
  gold: '#D9A441',
};

interface RewardsScreenProps {
  user: UserProfile;
  onBack: () => void;
  onSelectOffer: (offerId: string) => void;
}

export default function RewardsScreen({
  user,
  onBack,
  onSelectOffer,
}: RewardsScreenProps) {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  
  const [offers, setOffers] = useState<NearbyReward[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [category, setCategory] = useState('all');
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { onLogout } = useUserContext();

  const fetchOffers = useCallback(async (cat: string) => {
    try {
      const params: Record<string, any> = { limit: 50 };
      if (cat !== 'all') params.category = cat;
      
      // Use existing API call pattern
      const res = await rewardsApi.listOffers(params);
      const data = res.data || res;
      const items = Array.isArray(data) ? data : (data as any).offers || (data as any).items || [];
      
      // We typecast to NearbyReward just to satisfy the OfferCard props safely.
      // If the backend doesn't provide distance here, it will just not show distance.
      setOffers(items as NearbyReward[]);
    } catch (err: any) {
      setError(err?.message || 'Failed to load offers');
    }
  }, []);

  const loadInitial = useCallback(async () => {
    setLoading(true);
    setError(null);
    await fetchOffers(category);
    setLoading(false);
  }, [category, fetchOffers]);

  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchOffers(category);
    setRefreshing(false);
  };

  const handleCategoryChange = (newCat: string) => {
    setCategory(newCat);
  };

  const featuredOffers = offers.filter(o => o.isFeatured);
  const trendingOffers = [...offers].sort((a, b) => (b.currentRedemptions || 0) - (a.currentRedemptions || 0)).slice(0, 5);
  const recentOffers = [...offers].reverse().slice(0, 5);
  const recommendedOffers = offers.slice(0, 5); // Fallback for Recommended

  const renderSection = (title: string, data: NearbyReward[], CardComponent: any) => {
    if (!data.length) return null;
    return (
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{title}</Text>
          <Text style={styles.viewAllText}>View All</Text>
        </View>
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.horizontalList}
        >
          {data.map(offer => (
            <CardComponent 
              key={offer.id} 
              offer={offer} 
              onPress={onSelectOffer}
              isSaved={false} // Would hook into user's saved offers array
            />
          ))}
        </ScrollView>
      </View>
    );
  };

  return (
    <View style={styles.root}>
      <RewardsHeader 
        onMenuPress={() => setSidebarOpen(true)} 
      />

      <ScrollView 
        style={styles.scrollFlex} 
        contentContainerStyle={[styles.scrollContent, { paddingBottom: Math.max(insets.bottom, 24) }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={COLORS.gold} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.titleContainer}>
          <Text style={styles.mainTitle}>Exclusive Offers ✨</Text>
          <Text style={styles.mainSubtitle}>Discover amazing offers from local businesses around you.</Text>
        </View>

        <HeroBanner />
        
        <CategoryTabs 
          selectedCategory={category}
          onSelectCategory={handleCategoryChange}
        />

        {loading ? (
          <ActivityIndicator size="large" color={COLORS.gold} style={styles.loader} />
        ) : error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : offers.length === 0 ? (
          <Text style={styles.emptyText}>No offers available in this category yet.</Text>
        ) : (
          <>
            {renderSection('Featured Offers', featuredOffers, FeaturedOfferCard)}
            {renderSection('Recommended For You', recommendedOffers, OfferCard)}
            {renderSection('Trending Offers', trendingOffers, OfferCard)}
            {renderSection('Nearby Offers', offers.slice(0, 5), OfferCard)}
            {renderSection('Recent Offers', recentOffers, OfferCard)}
          </>
        )}
      </ScrollView>

      <HomeSidebar
        visible={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        user={user}
        palPoints={user?.totalPoints || 0}
        activeMode={user?.activeMode || 'USER'}
        onNavigateToWallet={() => navigation.navigate('RewardsWallet')}
        onNavigateToRewards={() => navigation.navigate('RewardsWallet')}
        onNavigateToLeaderboard={() => navigation.navigate('Leaderboard')}
        onNavigateToVendorOffers={() => navigation.navigate('VendorOffers')}
        onNavigateToHiddenGems={() => navigation.navigate('HiddenGems')}
        onNavigateToLegal={() => navigation.navigate('LegalHub')}
        onLogout={onLogout}
        onNavigateToSettings={() => navigation.navigate('Settings')}
        onNavigateToSubscription={() => navigation.navigate('UserPremium')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollFlex: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 8,
  },
  titleContainer: {
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  mainTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: COLORS.text,
    fontFamily: 'Georgia',
    marginBottom: 8,
  },
  mainSubtitle: {
    fontSize: 14,
    color: COLORS.textMuted,
    lineHeight: 20,
  },
  loader: {
    marginTop: 40,
  },
  errorText: {
    textAlign: 'center',
    color: '#FF3B30',
    padding: 20,
  },
  emptyText: {
    textAlign: 'center',
    color: COLORS.textMuted,
    padding: 20,
  },
  section: {
    marginBottom: 32,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
  },
  viewAllText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.gold,
  },
  horizontalList: {
    paddingHorizontal: 20,
    gap: 16,
  },
});
