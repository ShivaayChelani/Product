import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity,
  ActivityIndicator, RefreshControl, Share, StatusBar, Image, ScrollView
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBottomSafePadding } from '../design/responsive';
import Icon from 'react-native-vector-icons/Ionicons';
import { monetizationApi } from '../services/api/monetization';
import { VendorUI } from '../design/vendorLayout';

type Customer = {
  userId: string;
  name: string;
  email: string;
  avatar?: string | null;
  visits: number;
  palPointsRedeemed: number;
  lastVisitAt: string;
  firstVisitAt: string;
  recentOffers: string[];
};

function formatNumber(num: number) {
  if (num >= 1000) return (num / 1000).toFixed(2).replace(/\.00$/, '') + 'K';
  return num.toString();
}

function formatDateTime(dateStr: string) {
  const d = new Date(dateStr);
  const day = d.getDate();
  const month = d.toLocaleString('en-US', { month: 'short' });
  const time = d.toLocaleString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  return `${day} ${month}, ${time}`;
}

export default function VendorCustomersScreen({ onBack }: { onBack?: () => void }) {
  const insets = useSafeAreaInsets();
  const contentPadBottom = useBottomSafePadding(24);
  const [q, setQ] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const res: any = await monetizationApi.vendorCustomers(q.trim() || undefined, 1);
      const payload = res?.data ?? res;
      setCustomers(payload?.data || []);
      setSummary(payload?.summary || null);
    } catch (e: any) {
      setError(e?.message || 'Could not load customers');
      setCustomers([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [q]);

  useEffect(() => {
    const t = setTimeout(() => { load(); }, 250);
    return () => clearTimeout(t);
  }, [load]);

  const exportCsv = async () => {
    try {
      const res = await monetizationApi.exportVendorCustomersCsv();
      const body = typeof res === 'string' ? res : (res as any)?.data ?? JSON.stringify(res);
      await Share.share({ message: String(body), title: 'customers.csv' });
    } catch {
      const header = 'Name,Email,Visits,PalPoints,LastVisit';
      const rows = customers.map((c) =>
        [JSON.stringify(c.name), JSON.stringify(c.email), c.visits, c.palPointsRedeemed, c.lastVisitAt].join(','),
      );
      await Share.share({ message: [header, ...rows].join('\n'), title: 'customers.csv' });
    }
  };

  const renderHeader = () => (
    <View style={s.headerWrap}>
      <View style={s.headerTop}>
        {onBack ? (
          <TouchableOpacity onPress={onBack} style={s.backBtn}>
            <Icon name="arrow-back" size={24} color="#6B4E38" />
          </TouchableOpacity>
        ) : <View style={{ width: 44 }} />}
        
        <View style={s.headerTitleWrap}>
          <Text style={s.headerEyebrow}>VENDOR WORKSPACE</Text>
          <Text style={s.headerTitle}>Customers</Text>
          <Text style={s.headerSub}>From offer redemptions</Text>
        </View>

        <TouchableOpacity onPress={exportCsv} style={s.exportBtn}>
          <Icon name="download-outline" size={20} color="#6B4E38" />
          <Text style={s.exportText}>Export</Text>
        </TouchableOpacity>
      </View>

      <View style={s.searchWrap}>
        <Icon name="search" size={20} color="#A0A0A0" style={s.searchIcon} />
        <TextInput
          style={s.search}
          placeholder="Search by name or email"
          placeholderTextColor="#A0A0A0"
          value={q}
          onChangeText={setQ}
        />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.statsScroll}>
        <View style={s.statCard}>
          <View style={[s.statIconWrap, { backgroundColor: '#FFF4E8' }]}>
            <Icon name="people-outline" size={20} color="#E79133" />
          </View>
          <View style={s.statValWrap}>
            <Text style={s.statValue}>{formatNumber(summary?.totalCustomers || 0)}</Text>
            <Text style={s.statLabel}>Total Customers</Text>
            <Text style={s.statPeriod}>All time</Text>
          </View>
        </View>

        <View style={s.statCard}>
          <View style={[s.statIconWrap, { backgroundColor: '#EBF7EE' }]}>
            <Icon name="gift-outline" size={20} color="#52A772" />
          </View>
          <View style={s.statValWrap}>
            <Text style={s.statValue}>{formatNumber(summary?.totalVisits || 0)}</Text>
            <Text style={s.statLabel}>Redeemed Offers</Text>
            <Text style={s.statPeriod}>All time</Text>
          </View>
        </View>

        <View style={s.statCard}>
          <View style={[s.statIconWrap, { backgroundColor: '#F2EFFF' }]}>
            <Icon name="star-outline" size={20} color="#8A6DD7" />
          </View>
          <View style={s.statValWrap}>
            <Text style={s.statValue}>{formatNumber(summary?.totalPalPoints || 0)}</Text>
            <Text style={s.statLabel}>PalPoints Used</Text>
            <Text style={s.statPeriod}>All time</Text>
          </View>
        </View>

        <View style={s.statCard}>
          <View style={[s.statIconWrap, { backgroundColor: '#EEF6FF' }]}>
            <Icon name="calendar-outline" size={20} color="#4A90E2" />
          </View>
          <View style={s.statValWrap}>
            <Text style={s.statValue}>{formatNumber(summary?.thisMonthCustomers ?? 0)}</Text>
            <Text style={s.statLabel}>This Month Customers</Text>
            <Text style={s.statPeriod}>This month</Text>
          </View>
        </View>
      </ScrollView>

      <View style={s.listHeaderRow}>
        <Text style={s.listHeaderLeft}>Recent Customers</Text>
        <Text style={s.listHeaderRight}>Latest redemptions</Text>
      </View>
    </View>
  );

  const renderFooter = () => (
    <View style={s.bottomBanner}>
      <View style={s.bannerIconCircle}>
        <Icon name="gift" size={24} color="#A87C51" />
      </View>
      <View style={s.bannerTextWrap}>
        <Text style={s.bannerTitle}>How it works?</Text>
        <Text style={s.bannerDesc}>
          When tourists redeem your offers using PalPoints, their details and points used will appear here.
        </Text>
      </View>
      <View style={s.bannerGraphicMock}>
        <Icon name="phone-portrait-outline" size={32} color="#A87C51" style={{ opacity: 0.3 }} />
        <Icon name="person" size={24} color="#A87C51" style={{ position: 'absolute', bottom: 5, left: -10, opacity: 0.4 }} />
      </View>
    </View>
  );

  return (
    <View style={[s.safe, { paddingTop: Math.max(insets.top, 16) }]}>
      <StatusBar barStyle="dark-content" backgroundColor="#FAFAFA" />
      
      {loading && !customers.length ? (
        <View style={[s.center, { flex: 1 }]}>
          <ActivityIndicator color={VendorUI.colors.primary} />
        </View>
      ) : error ? (
        <View style={[s.center, { flex: 1 }]}>
          <Text style={s.error}>{error}</Text>
          <TouchableOpacity onPress={() => load()} style={s.retry}>
            <Text style={s.retryText}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={customers}
          keyExtractor={(item) => item.userId}
          ListHeaderComponent={renderHeader}
          ListFooterComponent={renderFooter}
          contentContainerStyle={{ paddingBottom: contentPadBottom }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={VendorUI.colors.primary} />
          }
          ItemSeparatorComponent={() => <View style={s.separator} />}
          ListEmptyComponent={
            <View style={s.center}>
              <Text style={s.emptyTitle}>No customers yet</Text>
              <Text style={s.emptySub}>When tourists redeem your offers, they appear here.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={s.rowCard}>
              <View style={s.col1}>
                {item.avatar ? (
                  <Image source={{ uri: item.avatar }} style={s.avatar} />
                ) : (
                  <View style={s.avatarFallback}>
                    <Text style={s.avatarFallbackText}>{item.name.charAt(0).toUpperCase()}</Text>
                  </View>
                )}
                <View style={s.col1Text}>
                  <Text style={s.name} numberOfLines={1}>{item.name}</Text>
                  <Text style={s.email} numberOfLines={1}>{item.email}</Text>
                </View>
              </View>
              
              <View style={s.col2}>
                <Text style={s.offerTitle} numberOfLines={2}>
                  {item.recentOffers[0] || 'Store Offer'}
                </Text>
                <View style={s.offerTag}>
                  <Text style={s.offerTagText}>Offer</Text>
                </View>
              </View>
              
              <View style={s.col3}>
                <View style={s.pointsRow}>
                  <Text style={s.pointsVal}>{item.palPointsRedeemed}</Text>
                  <View style={s.pointsIconWrap}>
                    <Text style={s.pointsIconText}>P</Text>
                  </View>
                </View>
                <Text style={s.pointsLabel}>PalPoints</Text>
                <Text style={s.dateText}>{formatDateTime(item.lastVisitAt)}</Text>
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FAFAFA' },
  headerWrap: { backgroundColor: '#FAFAFA', paddingBottom: 16 },
  headerTop: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 16, paddingVertical: 10 },
  backBtn: {
    width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#FAFAFA', borderWidth: 1, borderColor: '#E5D6C5', marginTop: 2,
  },
  headerTitleWrap: { flex: 1, minWidth: 0, paddingHorizontal: 16 },
  headerEyebrow: { fontSize: 11, fontWeight: '800', letterSpacing: 1.4, color: '#A87C51', textTransform: 'uppercase' },
  headerTitle: { fontSize: 26, fontWeight: '800', color: '#4A2A18', marginTop: 4, letterSpacing: -0.5 },
  headerSub: { fontSize: 14, color: '#7E7067', marginTop: 4, fontWeight: '500' },
  exportBtn: {
    width: 50, height: 50, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#FAFAFA', borderWidth: 1, borderColor: '#E5D6C5', marginTop: 2,
  },
  exportText: { fontSize: 10, color: '#4A2A18', fontWeight: '600', marginTop: 2 },
  
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginTop: 16, marginBottom: 16,
    backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: '#EBEBEB',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.03, shadowRadius: 8, elevation: 2,
  },
  searchIcon: { paddingLeft: 14 },
  search: { flex: 1, paddingVertical: 14, paddingHorizontal: 10, color: '#1C1C1E', fontSize: 15 },
  filterBtn: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', 
    borderWidth: 1, borderColor: '#EBEBEB', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6,
    marginRight: 8, gap: 4
  },
  filterText: { fontSize: 13, color: '#4A2A18', fontWeight: '500' },
  
  statsScroll: { paddingHorizontal: 16, gap: 12, paddingBottom: 16 },
  statCard: {
    backgroundColor: '#FFFFFF', borderRadius: 16, padding: 14, width: 145,
    borderWidth: 1, borderColor: '#F2F2F2',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.04, shadowRadius: 10, elevation: 2,
  },
  statIconWrap: {
    width: 38, height: 38, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginBottom: 12
  },
  statValWrap: { gap: 2 },
  statValue: { fontSize: 22, fontWeight: '800', color: '#1C1C1E' },
  statLabel: { fontSize: 13, color: '#4A2A18', fontWeight: '600' },
  statPeriod: { fontSize: 11, color: '#8E8E93', marginTop: 4 },
  
  listHeaderRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', 
    paddingHorizontal: 20, paddingTop: 10, paddingBottom: 8,
    borderBottomWidth: 1, borderBottomColor: '#F2F2F2',
  },
  listHeaderLeft: { fontSize: 14, fontWeight: '700', color: '#4A2A18' },
  listHeaderRight: { fontSize: 12, fontWeight: '500', color: '#8E8E93' },
  
  rowCard: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16,
    backgroundColor: '#FAFAFA'
  },
  separator: { height: 1, backgroundColor: '#F2F2F2', marginLeft: 16 },
  col1: { flex: 2, flexDirection: 'row', alignItems: 'center', paddingRight: 8 },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  avatarFallback: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#E5D6C5', alignItems: 'center', justifyContent: 'center' },
  avatarFallbackText: { fontSize: 18, fontWeight: 'bold', color: '#4A2A18' },
  col1Text: { marginLeft: 10, flex: 1 },
  name: { fontSize: 14, fontWeight: '700', color: '#1C1C1E', marginBottom: 2 },
  email: { fontSize: 12, color: '#8E8E93', marginBottom: 4 },
  verifiedRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  verifiedText: { fontSize: 10, color: '#666666', fontWeight: '500' },
  
  col2: { flex: 1.5, paddingHorizontal: 8, alignItems: 'flex-start' },
  offerTitle: { fontSize: 13, fontWeight: '600', color: '#1C1C1E', marginBottom: 6 },
  offerTag: { backgroundColor: '#F4EFE6', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  offerTagText: { fontSize: 10, fontWeight: '600', color: '#8C7355' },
  
  col3: { flex: 1, alignItems: 'flex-end', paddingLeft: 8 },
  pointsRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 2 },
  pointsVal: { fontSize: 15, fontWeight: '800', color: '#1C1C1E' },
  pointsIconWrap: { width: 14, height: 14, borderRadius: 7, backgroundColor: '#DCA236', alignItems: 'center', justifyContent: 'center' },
  pointsIconText: { fontSize: 9, fontWeight: 'bold', color: '#FFFFFF' },
  pointsLabel: { fontSize: 10, color: '#8E8E93', marginBottom: 6 },
  dateText: { fontSize: 10, color: '#8E8E93', fontWeight: '500' },
  
  center: { padding: 40, alignItems: 'center' },
  error: { color: '#8E8E93', textAlign: 'center', marginBottom: 12 },
  retry: { backgroundColor: '#A87C51', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20 },
  retryText: { color: '#FFFFFF', fontWeight: '700' },
  emptyTitle: { fontWeight: '800', color: '#1C1C1E', fontSize: 16 },
  emptySub: { color: '#8E8E93', textAlign: 'center', marginTop: 6 },
  
  bottomBanner: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFAF5',
    margin: 16, padding: 16, borderRadius: 16, borderWidth: 1, borderColor: '#F4E9DF',
    marginTop: 24,
  },
  bannerIconCircle: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F8E7D5', alignItems: 'center', justifyContent: 'center', marginRight: 16 },
  bannerTextWrap: { flex: 1, paddingRight: 10 },
  bannerTitle: { fontSize: 14, fontWeight: '700', color: '#4A2A18', marginBottom: 4 },
  bannerDesc: { fontSize: 12, color: '#7E7067', lineHeight: 18 },
  bannerGraphicMock: { width: 50, height: 50, alignItems: 'center', justifyContent: 'center', marginLeft: 10 },
});
