import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import type { TripPlan } from '../../services/api/trips';
import {
  computeTripBudget,
  formatInr,
  getStopEntryFee,
  TRANSPORT_COST_PER_KM,
} from '../../utils/tripBudget';
import {
  normalizeTripDays,
} from '../../utils/normalizeTripPlan';

const C = {
  text: '#2C1810',
  textSub: '#8B7355',
  textMuted: '#B8A88A',
  border: 'rgba(200, 155, 60, 0.18)',
  surface: '#FFFFFF',
  card: '#FFFFFF',
  ink: '#63300E',
  green: '#059669',
  greenBg: '#D1FAE5',
};

const H_PAD = 16;

function feeLabel(fee: number | null): string {
  if (fee === null) return '—';
  if (fee <= 0) return 'Free';
  return formatInr(fee);
}

type Props = {
  trip: TripPlan;
};

export default function TripBudgetPanel({ trip }: Props) {
  const days = normalizeTripDays(trip.tripDays);
  const budget = computeTripBudget({ ...trip, tripDays: days });
  const hasStops = budget.lineItems.length > 0;

  if (!hasStops) {
    return (
      <View style={styles.empty}>
        <Icon name="wallet-outline" size={40} color={C.textMuted} />
        <Text style={styles.emptyTitle}>No costs yet</Text>
        <Text style={styles.emptySub}>Add places to your journey to see entry fees and transport estimates.</Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.totalCard}>
        <Text style={styles.totalLabel}>Estimated trip cost</Text>
        <Text style={styles.totalValue}>{formatInr(budget.grandTotal)}</Text>
        <Text style={styles.totalSub}>
          {budget.travellerCount} traveller{budget.travellerCount !== 1 ? 's' : ''} · {budget.paidStops} paid · {budget.freeStops} free · {budget.totalDistanceKm.toFixed(1)} km
        </Text>
      </View>

      <View style={styles.breakdownRow}>
        <BreakdownChip icon="ticket-outline" label="Entry fees" value={formatInr(budget.entryTotal)} color="#7C3AED" bg="#EDE9FE" />
        <BreakdownChip icon="car-outline" label="Transport" value={formatInr(budget.transportTotal)} color="#B9834B" bg="rgba(185,131,75,0.12)" />
        <BreakdownChip icon="restaurant-outline" label="Food est." value={formatInr(budget.foodTotal)} color="#EA580C" bg="#FFEDD5" />
      </View>

      <Text style={styles.sectionTitle}>Cost by day</Text>
      {budget.byDay.filter(d => d.items.length > 0).map((day, dayIdx) => (
        <View key={`${day.dayId}-${dayIdx}`} style={styles.dayCard}>
          <View style={styles.dayHead}>
            <Text style={styles.dayTitle}>Day {day.dayNumber}</Text>
            <Text style={styles.dayTotal}>{formatInr(day.dayTotal)}</Text>
          </View>
          {day.items.map((item, itemIdx) => (
            <View key={`${item.stopId}-${itemIdx}`} style={styles.lineRow}>
              <View style={styles.lineLeft}>
                <Text style={styles.lineName} numberOfLines={1}>{item.name}</Text>
                {item.transportKm > 0 ? (
                  <Text style={styles.lineMeta}>
                    + {item.transportKm.toFixed(1)} km travel · {formatInr(item.transportCost)}
                  </Text>
                ) : null}
              </View>
              <Text style={[
                styles.lineFee,
                item.entryFee !== null && item.entryFee <= 0 && styles.lineFeeFree,
              ]}>
                {feeLabel(item.entryFee)}
              </Text>
            </View>
          ))}
          <View style={styles.dayFoot}>
            <Text style={styles.dayFootText}>Food allowance (est.)</Text>
            <Text style={styles.dayFootVal}>{formatInr(day.foodEstimate)}</Text>
          </View>
        </View>
      ))}

      <Text style={styles.note}>
        Entry fees and food are multiplied by traveller count. Transport is estimated once for the route at ₹{TRANSPORT_COST_PER_KM}/km.
      </Text>
    </View>
  );
}

function BreakdownChip({
  icon,
  label,
  value,
  color,
  bg,
}: {
  icon: string;
  label: string;
  value: string;
  color: string;
  bg: string;
}) {
  return (
    <View style={[styles.chip, { backgroundColor: bg }]}>
      <Icon name={icon as any} size={14} color={color} />
      <Text style={[styles.chipLabel, { color }]}>{label}</Text>
      <Text style={[styles.chipValue, { color: C.text }]}>{value}</Text>
    </View>
  );
}

export { getStopEntryFee, feeLabel };

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: H_PAD, paddingTop: 12, paddingBottom: 24, gap: 14 },
  empty: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 32, gap: 8 },
  emptyTitle: { fontSize: 16, fontFamily: 'Inter-Bold', color: C.text },
  emptySub: { fontSize: 12, fontFamily: 'Inter-Medium', color: C.textSub, textAlign: 'center', lineHeight: 18 },

  totalCard: {
    backgroundColor: C.ink,
    borderRadius: 16,
    padding: 18,
    alignItems: 'center',
  },
  totalLabel: { fontSize: 12, fontFamily: 'Inter-Medium', color: 'rgba(255,249,242,0.75)' },
  totalValue: { fontSize: 28, fontFamily: 'Inter-Black', color: '#FFFFFF', marginTop: 4 },
  totalSub: { fontSize: 11, fontFamily: 'Inter-Medium', color: 'rgba(255,249,242,0.65)', marginTop: 6 },

  breakdownRow: { flexDirection: 'row', gap: 8 },
  chip: { flex: 1, borderRadius: 12, padding: 10, alignItems: 'center', gap: 4 },
  chipLabel: { fontSize: 9, fontFamily: 'Inter-Bold', textTransform: 'uppercase', letterSpacing: 0.3 },
  chipValue: { fontSize: 12, fontFamily: 'Inter-Bold' },

  sectionTitle: { fontSize: 14, fontFamily: 'Inter-Bold', color: C.text, marginTop: 4 },
  dayCard: {
    backgroundColor: C.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    overflow: 'hidden',
  },
  dayHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: C.card,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  dayTitle: { fontSize: 13, fontFamily: 'Inter-Bold', color: C.text },
  dayTotal: { fontSize: 13, fontFamily: 'Inter-Bold', color: C.ink },
  lineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
    gap: 10,
  },
  lineLeft: { flex: 1, minWidth: 0 },
  lineName: { fontSize: 13, fontFamily: 'Inter-SemiBold', color: C.text },
  lineMeta: { fontSize: 10, fontFamily: 'Inter-Medium', color: C.textMuted, marginTop: 2 },
  lineFee: { fontSize: 13, fontFamily: 'Inter-Bold', color: C.ink },
  lineFeeFree: { color: C.green },
  dayFoot: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#FAFAF8',
  },
  dayFootText: { fontSize: 11, fontFamily: 'Inter-Medium', color: C.textSub },
  dayFootVal: { fontSize: 11, fontFamily: 'Inter-Bold', color: C.textSub },
  note: { fontSize: 10, fontFamily: 'Inter-Medium', color: C.textMuted, lineHeight: 15, marginTop: 4 },
});
