import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import { monetizationApi } from '../services/api/monetization';
import { useEntitlements } from '../context/EntitlementContext';
import { useUserContext } from '../context/UserContext';
import { useBottomSafePadding } from '../design/responsive';
import {
  formatInr,
  planHighlightLabel,
  sortPlans,
  SubscriptionPlanClient,
} from '../features/subscriptions/planUi';

const C = {
  bg: '#F4F9FC',
  navy: '#0B1F3A',
  deep: '#0E3A5F',
  lagoon: '#0E7490',
  sky: '#0284C7',
  ice: '#E0F2FE',
  white: '#FFFFFF',
  text: '#0F2744',
  muted: '#5B7A92',
  border: '#C5DCE8',
  success: '#047857',
  successBg: '#ECFDF5',
  warn: '#B45309',
  warnBg: '#FFFBEB',
};

function monthlyPrice(plan: SubscriptionPlanClient) {
  return (plan.prices ?? []).find((p) => p.period === 'MONTHLY' && p.isActive !== false) ?? undefined;
}

function limitOf(plan: SubscriptionPlanClient, key: string): { value: number; unlimited: boolean } {
  const row = plan.limitSummary?.find((l) => l.key === key);
  if (!row) return { value: 0, unlimited: false };
  return { value: row.value, unlimited: !!row.unlimited || row.value === -1 || row.value >= 999999 };
}

function usageLabel(used: number | undefined, limit: number | undefined) {
  if (limit == null) return '—';
  if (limit < 0 || limit >= 999999) return 'Unlimited';
  return `${used ?? 0} / ${limit} used`;
}

export default function VendorSubscriptionScreen({ onBack }: { onBack?: () => void }) {
  const navigation = useNavigation<any>();
  const { user } = useUserContext();
  const { entitlements, refreshEntitlements } = useEntitlements();
  const insets = useSafeAreaInsets();
  const contentPadBottom = useBottomSafePadding(24);
  const [plans, setPlans] = useState<SubscriptionPlanClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<SubscriptionPlanClient | null>(null);

  const sub = entitlements?.vendorSubscription;
  const listing = entitlements?.vendorListing;
  const isActive = listing?.status === 'ACTIVE' || sub?.status === 'ACTIVE';

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await refreshEntitlements();
      const data = await monetizationApi.listPlans('VENDOR');
      const launchSlugs = new Set(['vendor-starter', 'vendor-growth', 'vendor-unlimited']);
      setPlans(sortPlans((Array.isArray(data) ? data : []).filter((p) => launchSlugs.has(p.slug))));
    } catch (e: any) {
      setError(e?.message || 'Could not load vendor plans');
    } finally {
      setLoading(false);
    }
  }, [refreshEntitlements]);

  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { void refreshEntitlements(); }, [refreshEntitlements]));

  const checkout = async (plan: SubscriptionPlanClient) => {
    const price = monthlyPrice(plan);
    if (!price || busy) return;
    setBusy(true);
    try {
      const order = await monetizationApi.createRazorpayOrder(plan.id, price.period as any);
      if ((order as any)?.free) {
        await refreshEntitlements();
        setConfirming(null);
        Alert.alert('Subscription active', 'Your vendor plan is now active.');
        return;
      }
      setConfirming(null);
      navigation.navigate('RazorpayCheckout', {
        planId: plan.id,
        period: price.period,
        planName: plan.name,
        amountPaise: order.amountPaise,
        orderId: order.orderId,
        keyId: order.keyId,
        currency: order.currency || 'INR',
        prefillEmail: user?.email,
        prefillName: user?.displayName,
      });
    } catch (e: any) {
      Alert.alert('Checkout unavailable', e?.message || 'Configure Razorpay server keys to enable payments.');
    } finally {
      setBusy(false);
    }
  };

  const statusLabel = useMemo(() => {
    if (isActive && (listing?.planName || sub?.name)) {
      return `ACTIVE — ${(listing?.planName || sub?.name || '').toUpperCase()}`;
    }
    if (listing?.status === 'EXPIRED') return 'EXPIRED';
    if (listing?.status === 'PAYMENT_PENDING') return 'PAYMENT PENDING';
    if (listing?.status === 'SUSPENDED') return 'SUSPENDED';
    if (listing?.status === 'CANCELLED') return 'CANCELLED';
    return 'NOT ACTIVE';
  }, [isActive, listing, sub]);

  if (confirming) {
    const price = monthlyPrice(confirming);
    const offers = limitOf(confirming, 'maxOffers');
    const reels = limitOf(confirming, 'maxReels');
    return (
      <SafeAreaView style={[styles.safe, { paddingTop: Math.max(insets.top, 16) }]} edges={['left', 'right']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => !busy && setConfirming(null)} style={styles.iconBtn} accessibilityLabel="Back">
            <Icon name="arrow-back" size={22} color={C.navy} />
          </TouchableOpacity>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>CONFIRM PLAN</Text>
            <Text style={styles.title}>You're upgrading to {confirming.name}</Text>
          </View>
        </View>
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: contentPadBottom }]}>
          <View style={styles.confirmCard}>
            <Text style={styles.confirmPrice}>{price ? formatInr(price.amountPaise) : '—'} <Text style={styles.pricePeriod}>/ month</Text></Text>
            <Text style={styles.sectionLabel}>Includes</Text>
            <ConfirmRow text="Map listing" />
            <ConfirmRow text={offers.unlimited ? 'Unlimited offers' : `${offers.value} offer${offers.value === 1 ? '' : 's'}`} />
            <ConfirmRow text={reels.unlimited ? 'Unlimited reels' : `${reels.value} reel${reels.value === 1 ? '' : 's'} / month`} />
            <TouchableOpacity
              style={[styles.cta, busy && styles.ctaDisabled]}
              disabled={busy}
              onPress={() => checkout(confirming)}
              accessibilityRole="button"
              accessibilityLabel={price ? `Pay ${formatInr(price.amountPaise)} per month` : 'Pay'}
            >
              {busy ? <ActivityIndicator color="#fff" /> : (
                <Text style={styles.ctaText}>{price ? `Pay ${formatInr(price.amountPaise)} / month` : 'Pay'}</Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { paddingTop: Math.max(insets.top, 16) }]} edges={['left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.iconBtn} accessibilityLabel="Back">
          <Icon name="arrow-back" size={22} color={C.navy} />
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>VENDOR BUSINESS PLAN</Text>
          <Text style={styles.title}>Your business on PalSafar</Text>
        </View>
        <TouchableOpacity onPress={() => navigation.navigate('BillingHistory')} style={styles.iconBtn} accessibilityLabel="Billing history">
          <Icon name="receipt-outline" size={20} color={C.navy} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={C.sky} /></View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.muted}>{error}</Text>
          <TouchableOpacity style={styles.cta} onPress={load}><Text style={styles.ctaText}>Try again</Text></TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: contentPadBottom }]}>
          <Text style={styles.heroSub}>Get discovered by travellers and grow your business.</Text>

          <View style={[styles.statusPill, isActive ? styles.statusLive : styles.statusOff]}>
            <View style={[styles.dot, { backgroundColor: isActive ? C.success : C.muted }]} />
            <Text style={[styles.statusText, isActive && { color: C.success }]}>{statusLabel}</Text>
          </View>

          {listing ? (
            <View style={styles.usageCard}>
              <Text style={styles.sectionLabel}>Current plan</Text>
              <UsageRow label="PLAN" value={listing.planName || 'None'} />
              <UsageRow label="MAP LISTING" value={listing.mapListing === 'Active' ? '● Active' : '○ Hidden'} />
              <UsageRow label="OFFERS" value={usageLabel(listing.offersUsed, listing.offersLimit)} />
              <UsageRow label="REELS" value={
                listing.reelsLimit != null && listing.reelsLimit < 0
                  ? 'Unlimited'
                  : usageLabel(listing.reelsUsedThisMonth, listing.reelsLimit)
              } />
              <UsageRow
                label="RENEWAL"
                value={listing.expiresAt ? new Date(listing.expiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
              />
            </View>
          ) : null}

          <Text style={styles.sectionTitle}>Available Plans</Text>
          {plans.length === 0 ? (
            <Text style={styles.muted}>No vendor plans published yet. Ask an admin to activate Starter, Growth, or Unlimited.</Text>
          ) : plans.map((plan) => {
            const price = monthlyPrice(plan);
            const highlight = planHighlightLabel(plan);
            const isCurrent = sub?.planId === plan.id || listing?.planId === plan.id;
            const offers = limitOf(plan, 'maxOffers');
            const reels = limitOf(plan, 'maxReels');
            return (
              <View key={plan.id} style={[styles.planCard, isCurrent && styles.planCardCurrent, highlight === 'MOST POPULAR' && !isCurrent && styles.planCardFeatured]}>
                {isCurrent ? (
                  <View style={styles.currentBadge}><Text style={styles.currentBadgeText}>CURRENT PLAN</Text></View>
                ) : highlight ? (
                  <View style={styles.popularBadge}><Text style={styles.popularBadgeText}>{highlight}</Text></View>
                ) : null}
                <Text style={styles.planName}>{plan.name.toUpperCase()}</Text>
                {price ? (
                  <Text style={styles.price}>
                    {formatInr(price.amountPaise)}
                    <Text style={styles.pricePeriod}> / month</Text>
                  </Text>
                ) : null}
                <ConfirmRow text="Business map listing" />
                <ConfirmRow text={offers.unlimited ? 'Unlimited offers' : `${offers.value} active offer${offers.value === 1 ? '' : 's'}`} />
                <ConfirmRow text={reels.unlimited ? 'Unlimited reels' : `${reels.value} reel${reels.value === 1 ? '' : 's'} / month`} />
                {isCurrent ? (
                  <View style={[styles.cta, styles.ctaDisabled]}><Text style={styles.ctaText}>Current Plan</Text></View>
                ) : (
                  <TouchableOpacity
                    disabled={busy}
                    style={[styles.cta, busy && styles.ctaDisabled]}
                    onPress={() => setConfirming(plan)}
                    accessibilityRole="button"
                    accessibilityLabel={`Choose ${plan.name}`}
                  >
                    <Text style={styles.ctaText}>Choose {plan.name}</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function ConfirmRow({ text }: { text: string }) {
  return (
    <View style={styles.checkRow}>
      <Icon name="checkmark" size={18} color={C.lagoon} />
      <Text style={styles.checkText}>{text}</Text>
    </View>
  );
}

function UsageRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.usageRow}>
      <Text style={styles.usageLabel}>{label}</Text>
      <Text style={styles.usageValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 16, paddingVertical: 10, gap: 10 },
  headerCopy: { flex: 1, minWidth: 0 },
  eyebrow: { fontSize: 11, fontWeight: '800', letterSpacing: 1.4, color: C.lagoon },
  iconBtn: {
    width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center',
    backgroundColor: C.white, borderWidth: 1, borderColor: C.border, marginTop: 2,
  },
  title: { fontWeight: '800', fontSize: 20, color: C.navy, marginTop: 4, letterSpacing: -0.3 },
  content: { padding: 16, gap: 14 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  heroSub: { fontSize: 15, color: C.muted, lineHeight: 22 },
  muted: { fontSize: 13, color: C.muted, textAlign: 'center' },
  statusPill: {
    alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1,
  },
  statusLive: { backgroundColor: C.successBg, borderColor: '#A7F3D0' },
  statusOff: { backgroundColor: C.white, borderColor: C.border },
  statusText: { fontWeight: '800', fontSize: 12, letterSpacing: 0.6, color: C.muted },
  dot: { width: 8, height: 8, borderRadius: 4 },
  usageCard: { backgroundColor: C.white, borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: 16, gap: 10 },
  sectionLabel: { fontSize: 11, fontWeight: '800', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.8 },
  sectionTitle: { fontSize: 13, fontWeight: '800', color: C.navy, letterSpacing: 0.4, marginTop: 4 },
  usageRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  usageLabel: { fontSize: 12, fontWeight: '700', color: C.muted, letterSpacing: 0.4 },
  usageValue: { fontSize: 15, fontWeight: '800', color: C.navy },
  planCard: { backgroundColor: C.white, borderRadius: 18, borderWidth: 1, borderColor: C.border, padding: 18, gap: 8, position: 'relative' },
  planCardFeatured: { borderColor: C.sky, borderWidth: 2 },
  planCardCurrent: { borderColor: C.navy, borderWidth: 2, backgroundColor: '#F8FBFE' },
  popularBadge: { position: 'absolute', top: -10, right: 16, backgroundColor: C.sky, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 3 },
  popularBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  currentBadge: { position: 'absolute', top: -10, right: 16, backgroundColor: C.navy, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 3 },
  currentBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  planName: { fontSize: 18, fontWeight: '800', color: C.navy, marginTop: 6 },
  price: { fontSize: 28, fontWeight: '800', color: C.deep, marginTop: 2 },
  pricePeriod: { fontSize: 14, fontWeight: '600', color: C.muted },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  checkText: { fontSize: 14, color: C.text, fontWeight: '600' },
  confirmCard: { backgroundColor: C.white, borderRadius: 18, borderWidth: 1, borderColor: C.border, padding: 20, gap: 10 },
  confirmPrice: { fontSize: 32, fontWeight: '800', color: C.navy },
  cta: { backgroundColor: C.sky, borderRadius: 16, paddingVertical: 14, alignItems: 'center', marginTop: 10, minHeight: 48, justifyContent: 'center' },
  ctaDisabled: { backgroundColor: '#94A3B8' },
  ctaText: { color: C.white, fontWeight: '800', fontSize: 15 },
});
