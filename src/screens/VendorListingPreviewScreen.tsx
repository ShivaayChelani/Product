import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Image,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import { vendorsApi } from '../services/api/vendors';
import { useBottomSafePadding } from '../design/responsive';

const C = {
  bg: '#F4F9FC',
  navy: '#0B1F3A',
  lagoon: '#0E7490',
  sky: '#0284C7',
  ice: '#E0F2FE',
  white: '#FFFFFF',
  text: '#0F2744',
  muted: '#5B7A92',
  border: '#C5DCE8',
  warn: '#B45309',
  warnBg: '#FFFBEB',
  warnBorder: '#FDE68A',
};

export default function VendorListingPreviewScreen({ onBack }: { onBack?: () => void }) {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const padBottom = useBottomSafePadding(24);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<any>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await vendorsApi.getListingPreview();
      setPreview(data);
    } catch (e: any) {
      setError(e?.message || 'Could not load listing preview');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const vendor = preview?.vendor;
  const offers = Array.isArray(preview?.offers) ? preview.offers : [];
  const reels = Array.isArray(preview?.reels) ? preview.reels : [];

  return (
    <SafeAreaView style={[styles.safe, { paddingTop: Math.max(insets.top, 16) }]} edges={['left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.iconBtn} accessibilityLabel="Back">
          <Icon name="arrow-back" size={22} color={C.navy} />
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>LISTING PREVIEW</Text>
          <Text style={styles.title}>How travellers will see you</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={C.sky} /></View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.muted}>{error}</Text>
          <TouchableOpacity style={styles.cta} onPress={load}><Text style={styles.ctaText}>Try again</Text></TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: padBottom }]}>
          <Text style={styles.lead}>This is how travellers will see your business after activation. Preview never makes you publicly visible.</Text>

              {!preview?.isLive ? (
                <View style={styles.banner}>
                  <Text style={styles.bannerTitle}>{preview?.banner?.title || 'Your listing is not live yet.'}</Text>
                  <Text style={styles.bannerBody}>{preview?.banner?.body || 'Subscribe to a vendor plan to appear on the PalSafar map.'}</Text>
                  <TouchableOpacity style={styles.cta} onPress={() => navigation.navigate('VendorSubscription')}>
                    <Text style={styles.ctaText}>View Plans</Text>
                  </TouchableOpacity>
                </View>
              ) : null}

          <View style={styles.card}>
            {vendor?.imageUrl ? (
              <Image source={{ uri: vendor.imageUrl }} style={styles.cover} />
            ) : (
              <View style={[styles.cover, styles.coverFallback]}>
                <Icon name="storefront-outline" size={36} color={C.lagoon} />
              </View>
            )}
            <Text style={styles.biz}>{vendor?.businessName || 'Your business'}</Text>
            <Text style={styles.meta}>
              {vendor?.businessType ? String(vendor.businessType).replace(/_/g, ' ') : 'Business'}
              {vendor?.city ? `  ·  ${vendor.city}` : ''}
            </Text>
            {vendor?.rating ? (
              <Text style={styles.rating}>★ {Number(vendor.rating).toFixed(1)}{vendor.reviewCount ? `  (${vendor.reviewCount})` : ''}</Text>
            ) : (
              <Text style={styles.mutedLeft}>No public ratings yet</Text>
            )}

            <View style={styles.pointerRow}>
              <Text style={styles.pointerLabel}>MAP POINTER</Text>
              <Text style={styles.pointerValue}>● {preview?.mapPointer || 'Preview'}</Text>
            </View>
          </View>

          <Text style={styles.section}>Offers</Text>
          {offers.length === 0 ? (
            <Text style={styles.mutedLeft}>No offers in this preview.</Text>
          ) : offers.map((o: any) => (
            <View key={o.id} style={styles.rowCard}>
              <Text style={styles.rowTitle}>{o.title}</Text>
              {o.description ? <Text style={styles.mutedLeft}>{o.description}</Text> : null}
            </View>
          ))}

          <Text style={styles.section}>Reels</Text>
          {reels.length === 0 ? (
            <Text style={styles.mutedLeft}>No reels in this preview.</Text>
          ) : reels.map((r: any) => (
            <View key={r.id} style={styles.rowCard}>
              <Text style={styles.rowTitle}>{r.title || 'Promotion reel'}</Text>
            </View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 16, paddingVertical: 10, gap: 10 },
  headerCopy: { flex: 1 },
  eyebrow: { fontSize: 11, fontWeight: '800', letterSpacing: 1.4, color: C.lagoon },
  title: { fontWeight: '800', fontSize: 20, color: C.navy, marginTop: 4 },
  iconBtn: {
    width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center',
    backgroundColor: C.white, borderWidth: 1, borderColor: C.border, marginTop: 2,
  },
  content: { padding: 16, gap: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  lead: { fontSize: 14, color: C.muted, lineHeight: 20 },
  muted: { fontSize: 13, color: C.muted, textAlign: 'center' },
  mutedLeft: { fontSize: 13, color: C.muted },
  banner: { backgroundColor: C.warnBg, borderWidth: 1, borderColor: C.warnBorder, borderRadius: 16, padding: 16, gap: 8 },
  bannerTitle: { fontWeight: '800', fontSize: 16, color: C.warn },
  bannerBody: { fontSize: 14, color: C.text, lineHeight: 20 },
  card: { backgroundColor: C.white, borderRadius: 18, borderWidth: 1, borderColor: C.border, padding: 16, gap: 8 },
  cover: { width: '100%', height: 160, borderRadius: 12, backgroundColor: C.ice },
  coverFallback: { alignItems: 'center', justifyContent: 'center' },
  biz: { fontSize: 22, fontWeight: '800', color: C.navy },
  meta: { fontSize: 14, color: C.muted, textTransform: 'capitalize' },
  rating: { fontSize: 15, fontWeight: '700', color: C.navy },
  pointerRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.ice },
  pointerLabel: { fontSize: 11, fontWeight: '800', color: C.muted, letterSpacing: 0.6 },
  pointerValue: { fontSize: 13, fontWeight: '800', color: C.lagoon },
  section: { fontSize: 13, fontWeight: '800', color: C.navy, marginTop: 8 },
  rowCard: { backgroundColor: C.white, borderRadius: 12, borderWidth: 1, borderColor: C.border, padding: 12 },
  rowTitle: { fontWeight: '700', color: C.navy },
  cta: { backgroundColor: C.sky, borderRadius: 14, paddingVertical: 12, alignItems: 'center', marginTop: 4, minHeight: 44, justifyContent: 'center' },
  ctaText: { color: '#fff', fontWeight: '800' },
});
