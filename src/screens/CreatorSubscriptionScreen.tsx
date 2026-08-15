import React, { useCallback, useEffect, useState } from 'react';
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
import { CreatorUI } from '../features/creator/theme';
import {
  formatInr,
  planHighlightLabel,
  PlanFeatureList,
  PlanPeriodPicker,
  sortPlans,
  SubscriptionPlanClient,
  usePlanPeriod,
} from '../features/subscriptions/planUi';

const C = {
  bg: '#FDF9F2',
  navy: CreatorUI.colors.deep,
  gold: '#AD762E',
  bronze: CreatorUI.colors.bronze,
  white: CreatorUI.colors.white,
  text: CreatorUI.colors.text,
  muted: '#7A7068',
  border: '#EAE1D5',
  success: CreatorUI.colors.success,
  successBg: CreatorUI.colors.successBg,
};

const CREATOR_PERKS = [
  'Unlimited reel uploads',
  'Brand campaigns & collaborations',
  'Creator analytics',
  'Verified creator badge',
  'Priority creator support',
];

function unwrapPlans(payload: unknown): SubscriptionPlanClient[] {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  const obj = payload as Record<string, unknown>;
  if (Array.isArray(obj.data)) return obj.data as SubscriptionPlanClient[];
  if (Array.isArray(obj.plans)) return obj.plans as SubscriptionPlanClient[];
  if (Array.isArray(obj.items)) return obj.items as SubscriptionPlanClient[];
  return [];
}

function formatExpiry(value?: string | null) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function CreatorSubscriptionScreen({ onBack }: { onBack?: () => void }) {
  const navigation = useNavigation<any>();
  const { user } = useUserContext();
  const { entitlements, refreshEntitlements } = useEntitlements();
  const insets = useSafeAreaInsets();
  const contentPadBottom = useBottomSafePadding(24);
  const [plans, setPlans] = useState<SubscriptionPlanClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const membership = entitlements?.creatorMembership;
  const expiry = formatExpiry(membership?.expiresAt);
  const isActive = String(membership?.status || '').toUpperCase() === 'ACTIVE';

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await refreshEntitlements();
      const data = await monetizationApi.listPlans('CREATOR');
      setPlans(sortPlans(unwrapPlans(data)));
    } catch (e: any) {
      setError(e?.message || 'Could not load creator plans');
    } finally {
      setLoading(false);
    }
  }, [refreshEntitlements]);

  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { void refreshEntitlements(); }, [refreshEntitlements]));

  const checkout = async (plan: SubscriptionPlanClient, period: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const order = await monetizationApi.createRazorpayOrder(plan.id, period as any);
      if ((order as any)?.free) {
        await refreshEntitlements();
        Alert.alert('Subscription active', 'Your creator plan is now active.');
        return;
      }
      if (!order?.orderId || !order?.keyId) {
        Alert.alert('Checkout unavailable', 'Payment could not be started. Try again in a moment.');
        return;
      }
      navigation.navigate('RazorpayCheckout', {
        planId: plan.id,
        period,
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

  return (
    <SafeAreaView style={[styles.safe, { paddingTop: Math.max(insets.top, 16) }]} edges={['left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => (onBack ? onBack() : navigation.goBack())}
          style={styles.iconBtn}
          accessibilityLabel="Back"
        >
          <Icon name="arrow-back" size={22} color={C.navy} />
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>CREATOR STUDIO</Text>
          <Text style={styles.title}>Subscription</Text>
        </View>
        <TouchableOpacity
          onPress={() => navigation.navigate('BillingHistory')}
          style={styles.iconBtn}
          accessibilityLabel="Billing history"
        >
          <Icon name="receipt-outline" size={20} color={C.navy} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={C.gold} /></View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.emptyCopy}>{error}</Text>
          <TouchableOpacity style={styles.btn} onPress={load}>
            <Text style={styles.btnText}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: contentPadBottom }]}>
          {isActive ? (
            <View style={styles.activeCard}>
              <Icon name="shield-checkmark" size={28} color={C.success} />
              <Text style={styles.activeTitle}>{membership?.name || 'Creator Pro'}</Text>
              <Text style={styles.activeSub}>
                {expiry ? `Valid until ${expiry}` : 'Your creator plan is active'}
              </Text>
            </View>
          ) : (
            <View style={styles.hero}>
              <Text style={styles.heroLabel}>CURRENT PLAN</Text>
              <Text style={styles.heroTitle}>{membership?.name || 'Free Creator'}</Text>
              <Text style={styles.heroSub}>Limited uploads on the free tier. Upgrade for more reach.</Text>
            </View>
          )}

          {membership && isActive ? (
            <View style={styles.usageRow}>
              <Usage
                label="Uploads"
                value={membership.uploadLimit >= 999999 ? 'Unlimited' : String(membership.uploadLimit ?? '—')}
              />
              <Usage label="Analytics" value={String(membership.analyticsLevel ?? 'basic')} />
              <Usage label="Verified" value={membership.verifiedBadge ? 'Yes' : 'No'} />
            </View>
          ) : null}

          {CREATOR_PERKS.map((perk) => (
            <View key={perk} style={styles.perk}>
              <Icon name="checkmark" size={18} color={C.bronze} />
              <Text style={styles.perkText}>{perk}</Text>
            </View>
          ))}

          <Text style={styles.section}>Choose a plan</Text>
          {plans.length === 0 ? (
            <View style={styles.emptyCard}>
              <Icon name="sparkles-outline" size={28} color={C.gold} />
              <Text style={styles.emptyTitle}>Plans coming soon</Text>
              <Text style={styles.emptyCopy}>
                Creator Pro plans are set by PalSafar admin. Check billing history or try again shortly.
              </Text>
            </View>
          ) : plans.map((plan) => (
            <CreatorPlanCard
              key={plan.id}
              plan={plan}
              busy={busy}
              onCheckout={checkout}
              isCurrent={membership?.planId === plan.id}
            />
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function CreatorPlanCard({
  plan,
  busy,
  onCheckout,
  isCurrent,
}: {
  plan: SubscriptionPlanClient;
  busy: boolean;
  onCheckout: (plan: SubscriptionPlanClient, period: string) => void;
  isCurrent: boolean;
}) {
  const { period, setPeriod, price } = usePlanPeriod(plan.prices ?? []);
  const highlight = planHighlightLabel(plan);

  return (
    <View style={[styles.planCard, highlight ? styles.planCardFeatured : null]}>
      {highlight ? (
        <View style={styles.badge}><Text style={styles.badgeText}>{highlight}</Text></View>
      ) : null}
      <Text style={styles.planName}>{plan.name}</Text>
      {plan.description ? <Text style={styles.planDesc}>{plan.description}</Text> : null}
      <PlanPeriodPicker prices={plan.prices ?? []} selected={period} onSelect={setPeriod} />
      {price ? (
        <Text style={styles.price}>
          {formatInr(price.amountPaise)}
          <Text style={styles.pricePeriod}> / {period.toLowerCase()}</Text>
        </Text>
      ) : null}
      <PlanFeatureList bullets={plan.featureBullets ?? []} />
      {isCurrent ? (
        <View style={[styles.btn, styles.btnDisabled]}><Text style={styles.btnText}>Current plan</Text></View>
      ) : price ? (
        <TouchableOpacity
          disabled={busy}
          style={[styles.btn, busy && styles.btnDisabled]}
          onPress={() => onCheckout(plan, period)}
        >
          {busy ? (
            <ActivityIndicator color={C.white} />
          ) : (
            <Text style={styles.btnText}>Subscribe · {formatInr(price.amountPaise)}</Text>
          )}
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function Usage({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.usage}>
      <Text style={styles.usageValue}>{value}</Text>
      <Text style={styles.usageLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 16, paddingVertical: 10, gap: 10 },
  headerCopy: { flex: 1, minWidth: 0 },
  eyebrow: { fontSize: 11, fontWeight: '800', letterSpacing: 1.4, color: C.bronze },
  iconBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.border,
    marginTop: 2,
  },
  title: { fontWeight: '800', fontSize: 20, color: C.navy, marginTop: 4 },
  content: { padding: 16, gap: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  hero: {
    backgroundColor: C.white,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.border,
    padding: 20,
    gap: 6,
  },
  heroLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 1.2, color: C.bronze },
  heroTitle: { fontSize: 28, fontWeight: '800', color: C.navy },
  heroSub: { fontSize: 14, color: C.muted, lineHeight: 20, fontWeight: '500' },
  activeCard: {
    backgroundColor: C.successBg,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#D5E4CF',
    padding: 16,
    gap: 6,
    alignItems: 'center',
  },
  activeTitle: { fontSize: 18, fontWeight: '800', color: C.navy },
  activeSub: { fontSize: 13, color: C.success, fontWeight: '600' },
  perk: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: C.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    padding: 14,
  },
  perkText: { fontSize: 15, fontWeight: '600', color: C.text, flex: 1 },
  section: { fontSize: 16, fontWeight: '800', color: C.navy, marginTop: 8 },
  emptyCard: {
    backgroundColor: C.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    padding: 20,
    alignItems: 'center',
    gap: 8,
  },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: C.navy },
  emptyCopy: { fontSize: 13, color: C.muted, textAlign: 'center', lineHeight: 18 },
  btn: {
    backgroundColor: C.gold,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
    minHeight: 48,
    justifyContent: 'center',
  },
  btnDisabled: { backgroundColor: '#D4C4B0' },
  btnText: { color: C.white, fontWeight: '800', fontSize: 15 },
  usageRow: { flexDirection: 'row', gap: 8 },
  usage: {
    flex: 1,
    backgroundColor: C.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    padding: 12,
  },
  usageValue: { fontWeight: '800', color: C.navy },
  usageLabel: { fontSize: 11, color: C.muted, marginTop: 2, fontWeight: '600' },
  planCard: {
    backgroundColor: C.white,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.border,
    padding: 18,
    gap: 8,
    position: 'relative',
  },
  planCardFeatured: { borderColor: C.gold, borderWidth: 2 },
  planName: { fontSize: 18, fontWeight: '800', color: C.navy },
  planDesc: { fontSize: 13, color: C.muted, lineHeight: 18 },
  badge: {
    position: 'absolute',
    top: -10,
    right: 16,
    backgroundColor: C.gold,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeText: { color: C.white, fontSize: 10, fontWeight: '800' },
  price: { fontSize: 22, fontWeight: '800', color: C.navy, marginTop: 4 },
  pricePeriod: { fontSize: 14, fontWeight: '600', color: C.muted },
});
