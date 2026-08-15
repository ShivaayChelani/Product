import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';

export type BillingPeriod = 'MONTHLY' | 'QUARTERLY' | 'SEMIANNUAL' | 'YEARLY' | 'LIFETIME';

export interface PlanPrice {
  period: BillingPeriod;
  amountPaise: number;
  currency?: string;
  isActive?: boolean;
}

export interface SubscriptionPlanClient {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  badge?: string | null;
  color?: string | null;
  sortOrder?: number;
  isMostPopular?: boolean;
  isBestValue?: boolean;
  isRecommended?: boolean;
  promoText?: string | null;
  prices?: PlanPrice[];
  featureBullets?: string[];
  highlights?: string[];
  limitSummary?: Array<{ key: string; value: number; label: string; unlimited?: boolean }>;
}

const PERIOD_LABELS: Record<BillingPeriod, string> = {
  MONTHLY: 'Monthly',
  QUARTERLY: 'Quarterly',
  SEMIANNUAL: '6 Months',
  YEARLY: 'Yearly',
  LIFETIME: 'Lifetime',
};

export function sortPlans<T extends { sortOrder?: number; name?: string }>(plans: T[]): T[] {
  return [...plans].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || (a.name ?? '').localeCompare(b.name ?? ''));
}

export function planHighlightLabel(plan: SubscriptionPlanClient): string | null {
  if (plan.isMostPopular || plan.highlights?.includes('MOST_POPULAR')) return 'MOST POPULAR';
  if (plan.isBestValue || plan.highlights?.includes('BEST_VALUE')) return 'BEST VALUE';
  if (plan.isRecommended || plan.highlights?.includes('RECOMMENDED')) return 'RECOMMENDED';
  return null;
}

export function formatInr(paise: number) {
  return `₹${(paise / 100).toFixed(0)}`;
}

export function PlanPeriodPicker({
  prices,
  selected,
  onSelect,
}: {
  prices: PlanPrice[];
  selected: BillingPeriod;
  onSelect: (p: BillingPeriod) => void;
}) {
  const active = prices.filter((p) => p.isActive !== false);
  if (active.length <= 1) return null;

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.periodRow}>
      {active.map((p) => (
        <TouchableOpacity
          key={p.period}
          style={[styles.periodChip, selected === p.period && styles.periodChipActive]}
          onPress={() => onSelect(p.period)}
        >
          <Text style={[styles.periodChipText, selected === p.period && styles.periodChipTextActive]}>
            {PERIOD_LABELS[p.period] ?? p.period}
          </Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

export function PlanFeatureList({ bullets }: { bullets: string[] }) {
  if (!bullets.length) return null;
  return (
    <View style={styles.featureList}>
      {bullets.map((h) => (
        <View key={h} style={styles.featureRow}>
          <Icon name="checkmark-circle" size={16} color="#B9834B" />
          <Text style={styles.featureText}>{h}</Text>
        </View>
      ))}
    </View>
  );
}

export function usePlanPeriod(prices: PlanPrice[] = []) {
  const available = useMemo(
    () => prices.filter((p) => p.isActive !== false).map((p) => p.period),
    [prices],
  );
  const [period, setPeriod] = useState<BillingPeriod>(available[0] ?? 'MONTHLY');
  const price = prices.find((p) => p.period === period) ?? prices.find((p) => p.period === 'MONTHLY');
  return { period, setPeriod, price, availablePeriods: available };
}

const styles = StyleSheet.create({
  periodRow: { flexGrow: 0, marginBottom: 12 },
  periodChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E9D4BE',
    marginRight: 8,
    backgroundColor: '#fff',
  },
  periodChipActive: { backgroundColor: '#63300E', borderColor: '#63300E' },
  periodChipText: { fontSize: 12, fontWeight: '700', color: '#8B7355' },
  periodChipTextActive: { color: '#FFFFFF' },
  featureList: { gap: 6, marginTop: 4 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  featureText: { fontSize: 13, color: '#4D3227', flex: 1 },
});
