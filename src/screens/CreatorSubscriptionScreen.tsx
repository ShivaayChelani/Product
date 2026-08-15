import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import { monetizationApi } from '../services/api/monetization';
import { useEntitlements } from '../context/EntitlementContext';
import { useUserContext } from '../context/UserContext';
import { useBottomSafePadding } from '../design/responsive';
import {
  formatInr,
  planHighlightLabel,
  PlanFeatureList,
  PlanPeriodPicker,
  sortPlans,
  SubscriptionPlanClient,
  usePlanPeriod,
} from '../features/subscriptions/planUi';

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

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await refreshEntitlements();
      const data = await monetizationApi.listPlans('CREATOR');
      setPlans(sortPlans(Array.isArray(data) ? data : []));
    } catch (e: any) {
      setError(e?.message || 'Could not load creator plans');
    } finally {
      setLoading(false);
    }
  }, [refreshEntitlements]);

  useEffect(() => { load(); }, [load]);

  const checkout = async (plan: SubscriptionPlanClient, period: string) => {
    setBusy(true);
    try {
      const order = await monetizationApi.createRazorpayOrder(plan.id, period as any);
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
        <TouchableOpacity onPress={onBack} style={styles.iconBtn}>
          <Icon name="arrow-back" size={22} color="#6D28D9" />
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>CREATOR WORKSPACE</Text>
          <Text style={styles.title}>Subscription</Text>
        </View>
        <TouchableOpacity onPress={() => navigation.navigate('BillingHistory')} style={styles.iconBtn}>
          <Icon name="receipt-outline" size={20} color="#6D28D9" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color="#8B5CF6" /></View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.muted}>{error}</Text>
          <TouchableOpacity style={styles.btn} onPress={load}><Text style={styles.btnText}>Try again</Text></TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: contentPadBottom }]}>
          <View style={styles.card}>
            <Text style={styles.label}>Current plan</Text>
            <Text style={styles.value}>{membership?.name || 'Free Creator'}</Text>
            <Text style={styles.muted}>
              {membership
                ? `Status ${membership.status} · expires ${new Date(membership.expiresAt).toLocaleDateString('en-IN')}`
                : 'Limited uploads on free tier. Upgrade to Creator Pro.'}
            </Text>
            {membership ? (
              <View style={styles.usageRow}>
                <Usage
                  label="Upload limit"
                  value={membership.uploadLimit >= 999999 ? '∞' : String(membership.uploadLimit ?? '—')}
                />
                <Usage label="Analytics" value={String(membership.analyticsLevel ?? 'basic')} />
                <Usage label="Verified" value={membership.verifiedBadge ? 'Yes' : 'No'} />
              </View>
            ) : null}
          </View>

          <Text style={styles.section}>Choose a plan</Text>
          {plans.length === 0 ? (
            <Text style={styles.muted}>No creator plans published yet.</Text>
          ) : plans.map((plan) => (
            <CreatorPlanCard key={plan.id} plan={plan} busy={busy} onCheckout={checkout} isCurrent={membership?.planId === plan.id} />
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
    <View style={[styles.planCard, highlight && styles.planCardFeatured]}>
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
        <View style={[styles.btn, styles.btnDisabled]}><Text style={styles.btnText}>Current Plan</Text></View>
      ) : price ? (
        <TouchableOpacity disabled={busy} style={styles.btn} onPress={() => onCheckout(plan, period)}>
          <Text style={styles.btnText}>Subscribe · {formatInr(price.amountPaise)}</Text>
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
  safe: { flex: 1, backgroundColor: '#F5F3FF' },
  header: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 16, paddingVertical: 10, gap: 10 },
  headerCopy: { flex: 1, minWidth: 0 },
  eyebrow: { fontSize: 11, fontWeight: '800', letterSpacing: 1.4, color: '#A78BFA' },
  iconBtn: {
    width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#DDD6FE', marginTop: 2,
  },
  title: { fontWeight: '800', fontSize: 20, color: '#4C1D95', marginTop: 4, letterSpacing: -0.3 },
  content: { padding: 16, gap: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  card: { backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#DDD6FE', padding: 16, gap: 8 },
  label: { fontSize: 11, fontWeight: '800', color: '#7C3AED', textTransform: 'uppercase', letterSpacing: 0.8 },
  value: { fontSize: 18, fontWeight: '800', color: '#4C1D95' },
  muted: { fontSize: 13, color: '#7C3AED', lineHeight: 18, textAlign: 'center' },
  section: { fontSize: 16, fontWeight: '800', color: '#4C1D95', marginTop: 8 },
  btn: { backgroundColor: '#7C3AED', borderRadius: 20, paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  btnDisabled: { backgroundColor: '#DDD6FE' },
  btnText: { color: '#fff', fontWeight: '800' },
  usageRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  usage: { flex: 1, backgroundColor: '#EDE9FE', borderRadius: 10, padding: 10 },
  usageValue: { fontWeight: '800', color: '#6D28D9' },
  usageLabel: { fontSize: 11, color: '#7C3AED', marginTop: 2 },
  planCard: { backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#DDD6FE', padding: 18, gap: 8, position: 'relative' },
  planCardFeatured: { borderColor: '#8B5CF6', borderWidth: 2 },
  planName: { fontSize: 18, fontWeight: '800', color: '#4C1D95' },
  planDesc: { fontSize: 13, color: '#7C3AED', lineHeight: 18 },
  badge: { position: 'absolute', top: -10, right: 16, backgroundColor: '#8B5CF6', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  price: { fontSize: 22, fontWeight: '800', color: '#4C1D95', marginTop: 4 },
  pricePeriod: { fontSize: 14, fontWeight: '600', color: '#7C3AED' },
});
