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

const C = {
  bg: '#FDF9F2',
  navy: '#5D3A1B',
  sky: '#AD762E',
  lagoon: '#B8895A',
  white: '#FFFFFF',
  text: '#2D241D',
  muted: '#7A7068',
  border: '#EAE1D5',
  success: '#5F8A55',
  successBg: '#F3F7F0',
};

function formatExpiry(value?: string | null) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function UserPremiumScreen({ onBack }: { onBack?: () => void }) {
  const navigation = useNavigation<any>();
  const { user } = useUserContext();
  const { entitlements, refreshEntitlements, isPremium } = useEntitlements();
  const insets = useSafeAreaInsets();
  const contentPadBottom = useBottomSafePadding(24);
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const premiumSub = entitlements?.premiumPlan;
  const expired = !!entitlements?.premiumExpired;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await refreshEntitlements();
      const data = await monetizationApi.listPlans('USER_PREMIUM');
      setPlans(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setError(e?.message || 'Could not load plans');
    } finally {
      setLoading(false);
    }
  }, [refreshEntitlements]);

  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { void refreshEntitlements(); }, [refreshEntitlements]));

  const checkout = async (plan: any, period: 'MONTHLY' | 'YEARLY' | 'LIFETIME') => {
    if (busy) return;
    setBusy(true);
    try {
      const order = await monetizationApi.createRazorpayOrder(plan.id, period);
      if ((order as any)?.free) {
        await refreshEntitlements();
        Alert.alert('Premium active', 'Ad-free PalSafar is now enabled.');
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
      Alert.alert('Payment failed', e?.message || 'Configure Razorpay server keys to enable payments.');
    } finally {
      setBusy(false);
    }
  };

  const selectedPlan = plans.find((p: { slug?: string }) => p.slug === 'user-premium') ?? null;
  const monthly = selectedPlan?.prices?.find((p: { period: string }) => p.period === 'MONTHLY');
  const priceLabel = monthly ? `₹${Math.round(monthly.amountPaise / 100)}/month` : null;
  const expiry = formatExpiry(premiumSub?.expiresAt || entitlements?.premiumExpiresAt);

  return (
    <SafeAreaView style={[styles.safe, { paddingTop: Math.max(insets.top, 16) }]} edges={['left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.iconBtn} accessibilityLabel="Back">
          <Icon name="arrow-back" size={22} color={C.navy} />
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>PREMIUM</Text>
          <Text style={styles.title}>Ad-free PalSafar</Text>
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
          <TouchableOpacity style={styles.btn} onPress={load}><Text style={styles.btnText}>Try again</Text></TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: contentPadBottom }]}>
          {isPremium ? (
            <View style={styles.activeCard}>
              <Icon name="shield-checkmark" size={28} color={C.success} />
              <Text style={styles.activeTitle}>Premium active</Text>
              <Text style={styles.activeSub}>{expiry ? `Valid until ${expiry}` : 'Ad-free while this subscription is active'}</Text>
            </View>
          ) : expired ? (
            <View style={styles.expiredCard}>
              <Text style={styles.activeTitle}>Premium expired</Text>
              <Text style={styles.muted}>Renew to keep PalSafar ad-free.</Text>
            </View>
          ) : (
            <View style={styles.hero}>
              <Text style={styles.heroTitle}>PREMIUM</Text>
              <Text style={styles.heroPrice}>{priceLabel || 'Price set by PalSafar admin'}</Text>
            </View>
          )}

          <View style={styles.perk}><Icon name="checkmark" size={18} color={C.lagoon} /><Text style={styles.perkText}>Ad-free experience</Text></View>
          <View style={styles.perk}><Icon name="checkmark" size={18} color={C.lagoon} /><Text style={styles.perkText}>No advertisements while Premium is active</Text></View>
          <View style={styles.perk}><Icon name="checkmark" size={18} color={C.lagoon} /><Text style={styles.perkText}>Premium status</Text></View>
          <View style={styles.perk}><Icon name="checkmark" size={18} color={C.lagoon} /><Text style={styles.perkText}>Subscription validity shown after activation</Text></View>

          {!isPremium && selectedPlan && monthly ? (
            <TouchableOpacity
              disabled={busy}
              style={[styles.btn, busy && styles.btnDisabled]}
              onPress={() => checkout(selectedPlan, monthly.period)}
              accessibilityRole="button"
              accessibilityLabel={`Subscribe ${priceLabel}`}
            >
              {busy ? <ActivityIndicator color="#fff" /> : (
                <Text style={styles.btnText}>Subscribe · {priceLabel}</Text>
              )}
            </TouchableOpacity>
          ) : null}

          {!isPremium && !selectedPlan ? (
            <Text style={styles.muted}>No Premium plans published yet.</Text>
          ) : null}
        </ScrollView>
      )}
    </SafeAreaView>
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
  title: { fontWeight: '800', fontSize: 20, color: C.navy, marginTop: 4 },
  content: { padding: 16, gap: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  hero: { backgroundColor: C.white, borderRadius: 18, borderWidth: 1, borderColor: C.border, padding: 20, gap: 6 },
  heroTitle: { fontSize: 13, fontWeight: '800', letterSpacing: 1.2, color: C.lagoon },
  heroPrice: { fontSize: 32, fontWeight: '800', color: C.navy },
  activeCard: { backgroundColor: C.successBg, borderRadius: 16, borderWidth: 1, borderColor: '#D5E4CF', padding: 16, gap: 6, alignItems: 'center' },
  expiredCard: { backgroundColor: '#FBF3E8', borderRadius: 16, borderWidth: 1, borderColor: '#E8D4B8', padding: 16, gap: 6 },
  activeTitle: { fontSize: 18, fontWeight: '800', color: C.navy },
  activeSub: { fontSize: 13, color: C.success, fontWeight: '600' },
  perk: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.white, borderRadius: 12, borderWidth: 1, borderColor: C.border, padding: 14 },
  perkText: { fontSize: 15, fontWeight: '600', color: C.text, flex: 1 },
  muted: { fontSize: 13, color: C.muted, textAlign: 'center' },
  btn: { backgroundColor: C.sky, borderRadius: 16, paddingVertical: 14, alignItems: 'center', marginTop: 8, minHeight: 48, justifyContent: 'center' },
  btnDisabled: { backgroundColor: '#D4C4B0' },
  btnText: { color: C.white, fontWeight: '800', fontSize: 15 },
});
