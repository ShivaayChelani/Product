import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert, Image,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import { monetizationApi } from '../services/api/monetization';
import { useEntitlements } from '../context/EntitlementContext';
import { useUserContext } from '../context/UserContext';
import { useBottomSafePadding } from '../design/responsive';
import { SANS, SANS_BOLD, SERIF } from '../components/trips/tripsTheme';

export default function PremiumUpgradeScreen({ onBack }: { onBack?: () => void }) {
  const navigation = useNavigation<any>();
  const { user } = useUserContext();
  const { isPremium, entitlements, refreshEntitlements } = useEntitlements();
  const insets = useSafeAreaInsets();
  const contentPadBottom = useBottomSafePadding(24);
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await monetizationApi.listPlans('USER_PREMIUM');
      setPlans(Array.isArray(data) ? data : []);
      await refreshEntitlements();
    } catch (e: any) {
      setError(e?.message || 'Could not load plans');
    } finally {
      setLoading(false);
    }
  }, [refreshEntitlements]);

  useEffect(() => {
    load();
  }, [load]);

  useFocusEffect(useCallback(() => { void refreshEntitlements(); }, [refreshEntitlements]));

  const checkout = async (plan: { id: string; name: string }, period: 'MONTHLY' | 'YEARLY' | 'LIFETIME') => {
    if (busy || isPremium) return;
    setBusy(true);
    try {
      const order = await monetizationApi.createRazorpayOrder(plan.id, period);
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
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Configure Razorpay server keys to enable payments.';
      Alert.alert('Checkout unavailable', message);
    } finally {
      setBusy(false);
    }
  };

  const selectedPlan = plans.find((p: { slug?: string }) => p.slug === 'user-premium') ?? null;
  const monthlyPrice = selectedPlan?.prices?.find((p: { period: string }) => p.period === 'MONTHLY');

  return (
    <SafeAreaView style={[styles.safe, { paddingTop: Math.max(insets.top, 16) }]} edges={['left', 'right']}>
      <View style={styles.header}>
        {onBack ? (
          <TouchableOpacity onPress={onBack} style={styles.back}>
            <Icon name="chevron-back" size={24} color="#5D3A1B" />
          </TouchableOpacity>
        ) : <View style={{ width: 40 }} />}
        <Text style={styles.title}>PalSafar Premium</Text>
        <TouchableOpacity
          onPress={() => navigation.navigate('BillingHistory')}
          style={styles.back}
        >
          <Icon name="receipt-outline" size={22} color="#5D3A1B" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color="#A67B48" /></View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.error}>{error}</Text>
          <TouchableOpacity onPress={load} style={styles.btnTry}><Text style={styles.btnTryText}>Try again</Text></TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={[styles.list, { paddingBottom: contentPadBottom }]} showsVerticalScrollIndicator={false}>
          {isPremium ? (
            <View style={{ backgroundColor: '#ECFDF5', borderRadius: 16, borderWidth: 1, borderColor: '#A7F3D0', padding: 16, gap: 4 }}>
              <Text style={{ fontFamily: SANS_BOLD, fontSize: 16, color: '#047857' }}>Premium active</Text>
              <Text style={{ fontFamily: SANS, fontSize: 13, color: '#065F46' }}>
                {entitlements?.premiumExpiresAt
                  ? `Valid until ${new Date(entitlements.premiumExpiresAt).toLocaleDateString('en-IN')}`
                  : 'Ad-free while your subscription is active.'}
              </Text>
            </View>
          ) : entitlements?.premiumExpired ? (
            <View style={{ backgroundColor: '#FFF7ED', borderRadius: 16, borderWidth: 1, borderColor: '#FED7AA', padding: 16 }}>
              <Text style={{ fontFamily: SANS_BOLD, fontSize: 16, color: '#9A3412' }}>Premium expired</Text>
            </View>
          ) : null}
 
          {/* Top Hero Card */}
          <View style={styles.heroCard}>
            <View style={styles.heroContent}>
              <View>
                <Text style={styles.heroTitleMain}>Go Premium,</Text>
                <Text style={styles.heroTitleAccent}>Travel Better</Text>
                <Text style={styles.heroSubtitle}>Enjoy PalSafar without ads and unlock premium travel experience.</Text>
              </View>

              <View style={styles.miniPerksRow}>
                <View style={styles.miniPerk}>
                  <View style={styles.miniPerkIconWrap}>
                    <Icon name="logo-closed-captioning" size={16} color="#B48530" />
                  </View>
                  <Text style={styles.miniPerkText}>Ad-Free{'\n'}Experience</Text>
                </View>
                <View style={styles.miniPerk}>
                  <View style={styles.miniPerkIconWrap}>
                    <Icon name="star" size={16} color="#B48530" />
                  </View>
                  <Text style={styles.miniPerkText}>Premium{'\n'}Features</Text>
                </View>
                <View style={styles.miniPerk}>
                  <View style={styles.miniPerkIconWrap}>
                    <Icon name="shield-checkmark" size={16} color="#B48530" />
                  </View>
                  <Text style={styles.miniPerkText}>Secure{'\n'}& Private</Text>
                </View>
              </View>
            </View>
            <Image source={require('../assets/ad_free.png')} style={styles.heroImage} resizeMode="contain" />
          </View>

          {/* Section Divider */}
          <View style={styles.sectionDivider}>
            <Icon name="diamond" size={8} color="#D8C3A5" />
            <Text style={styles.sectionDividerText}>Why Go Premium?</Text>
            <Icon name="diamond" size={8} color="#D8C3A5" />
          </View>

          {/* Features List Card */}
          <View style={styles.featuresCard}>
            <FeatureRow icon="logo-closed-captioning" title="Ad-Free Experience" subtitle="Enjoy uninterrupted browsing." showDivider />
            <FeatureRow icon="star" title="Exclusive Features" subtitle="Access premium tools and features." showDivider />
            <FeatureRow icon="headset" title="Priority Support" subtitle="Get faster help whenever you need it." showDivider />
            <FeatureRow icon="pricetag" title="Exclusive Discounts" subtitle="Unlock special offers and discounts." />
          </View>

          {/* Pricing Card */}
          <View style={styles.pricingCard}>
            <View style={styles.mostPopularBadge}>
              <Icon name="star-outline" size={10} color="#FFFFFF" />
              <Text style={styles.mostPopularText}>MOST POPULAR</Text>
            </View>

            <View style={styles.pricingRow}>
              <View>
                <Text style={styles.pricingPlanName}>Monthly Plan</Text>
                <Text style={styles.pricingCancelText}>Cancel anytime</Text>
              </View>
              {monthlyPrice ? (
                <Text style={styles.priceAmount}>
                  ₹{(monthlyPrice.amountPaise / 100).toFixed(0)} <Text style={styles.pricePeriod}>/month</Text>
                </Text>
              ) : (
                <Text style={styles.pricePeriod}>Price set by admin</Text>
              )}
            </View>

            <TouchableOpacity
              style={[styles.upgradeBtn, (busy || isPremium || !selectedPlan || !monthlyPrice) && { opacity: 0.55 }]}
              activeOpacity={0.8}
              disabled={busy || isPremium || !selectedPlan || !monthlyPrice}
              onPress={() => {
                if (selectedPlan && monthlyPrice) {
                  checkout(selectedPlan, monthlyPrice.period);
                }
              }}
            >
              <Icon name="star" size={18} color="#FFFFFF" />
              <Text style={styles.upgradeBtnText}>
                {isPremium ? 'Premium active' : busy ? 'Processing…' : 'Upgrade to Premium'}
              </Text>
            </TouchableOpacity>

            <View style={styles.footerRow}>
              <View style={styles.footerItem}>
                <Icon name="lock-closed" size={10} color="#8A7664" />
                <Text style={styles.footerText}>Secure checkout powered by Razorpay</Text>
              </View>
              <View style={styles.footerDivider} />
              <View style={styles.footerItem}>
                <Text style={styles.footerText}>Manage billing from your{'\n'}receipt history.</Text>
              </View>
            </View>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const FeatureRow = ({ icon, title, subtitle, showDivider }: any) => (
  <View style={styles.featureRowWrap}>
    <View style={styles.featureRow}>
      <View style={styles.featureIconWrap}>
        <Icon name={icon} size={18} color="#8F6220" />
      </View>
      <View style={styles.featureTextWrap}>
        <Text style={styles.featureTitle}>{title}</Text>
        <Text style={styles.featureSubtitle}>{subtitle}</Text>
      </View>
      <Icon name="chevron-forward" size={18} color="#D8C3A5" />
    </View>
    {showDivider && <View style={styles.featureDivider} />}
  </View>
);

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FDF9F2' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10 },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, textAlign: 'center', fontSize: 18, fontFamily: SANS_BOLD, color: '#5D3A1B' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  error: { color: '#8B7355', marginBottom: 12, textAlign: 'center' },
  btnTry: { backgroundColor: '#B9834B', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 24, alignItems: 'center' },
  btnTryText: { color: '#fff', fontFamily: SANS_BOLD },
  list: { padding: 20, paddingTop: 10, gap: 24 },
  
  heroCard: {
    backgroundColor: '#FCF7ED',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#F2E5D0',
    overflow: 'hidden',
    padding: 20,
    minHeight: 280,
  },
  heroContent: {
    width: '65%',
    justifyContent: 'space-between',
    flex: 1,
  },
  heroTitleMain: {
    fontFamily: SANS_BOLD,
    fontSize: 22,
    color: '#3F220B',
    lineHeight: 28,
  },
  heroTitleAccent: {
    fontFamily: SANS_BOLD,
    fontSize: 22,
    color: '#D4A35C',
    lineHeight: 28,
    marginBottom: 8,
  },
  heroSubtitle: {
    fontFamily: SANS,
    fontSize: 12,
    color: '#4A3D33',
    lineHeight: 18,
    paddingRight: 10,
    marginBottom: 20,
  },
  heroImage: {
    position: 'absolute',
    right: -20,
    bottom: -10,
    width: 200,
    height: 200,
  },
  miniPerksRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  miniPerk: {
    alignItems: 'center',
    width: 60,
  },
  miniPerkIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#EAE1D5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  miniPerkText: {
    fontFamily: SANS,
    fontSize: 9,
    color: '#4A3D33',
    textAlign: 'center',
    lineHeight: 12,
  },

  sectionDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  sectionDividerText: {
    fontFamily: SANS_BOLD,
    fontSize: 14,
    color: '#3F220B',
  },

  featuresCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#EAE1D5',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  featureRowWrap: {
    width: '100%',
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
  },
  featureIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F9F1E2',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  featureTextWrap: {
    flex: 1,
  },
  featureTitle: {
    fontFamily: SANS_BOLD,
    fontSize: 14,
    color: '#1A130D',
    marginBottom: 2,
  },
  featureSubtitle: {
    fontFamily: SANS,
    fontSize: 12,
    color: '#8A7664',
  },
  featureDivider: {
    height: 1,
    backgroundColor: '#F2E8DB',
    width: '100%',
  },

  pricingCard: {
    backgroundColor: '#FCF7ED',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#EAE1D5',
    padding: 20,
    paddingTop: 28,
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 3,
  },
  mostPopularBadge: {
    position: 'absolute',
    top: -12,
    left: 20,
    backgroundColor: '#C8944E',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  mostPopularText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontFamily: SANS_BOLD,
    letterSpacing: 0.5,
  },
  pricingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  pricingPlanName: {
    fontFamily: SANS_BOLD,
    fontSize: 16,
    color: '#3F220B',
    marginBottom: 2,
  },
  pricingCancelText: {
    fontFamily: SANS,
    fontSize: 12,
    color: '#8A7664',
  },
  priceAmount: {
    fontFamily: SANS_BOLD,
    fontSize: 28,
    color: '#5D3A1B',
  },
  pricePeriod: {
    fontFamily: SANS,
    fontSize: 14,
    color: '#8A7664',
  },
  upgradeBtn: {
    backgroundColor: '#AD762E',
    borderRadius: 12,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#AD762E',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 5,
    marginBottom: 20,
  },
  upgradeBtnText: {
    color: '#FFFFFF',
    fontFamily: SANS_BOLD,
    fontSize: 15,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flex: 1,
    justifyContent: 'center',
  },
  footerDivider: {
    width: 1,
    height: '100%',
    backgroundColor: '#D8C3A5',
    marginHorizontal: 10,
  },
  footerText: {
    fontFamily: SANS,
    fontSize: 10,
    color: '#8A7664',
    textAlign: 'center',
  },
});
