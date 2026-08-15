import React from 'react';
import { View, Text, StyleSheet, Pressable, Platform, ScrollView } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';


const COLORS = {
  bg: '#FCF9F4', // Warm ivory
  card: '#FFFFFF',
  textPrimary: '#202020', // Charcoal
  textSecondary: '#6F6F6F',
  gold: '#D9A441',
  goldLight: '#FDF7EB',
  green: '#22C55E',
  border: '#ECE3D7',
};

// ==========================================
// 1. CREATOR HEADER
// ==========================================
type CreatorHeaderProps = {
  unreadCount?: number;
  onOpenDrawer: () => void;
  onOpenNotifications: () => void;
};

export function CreatorHeader({
  unreadCount = 0,
  onOpenDrawer,
  onOpenNotifications,
}: CreatorHeaderProps) {
  return (
    <View style={headerStyles.container}>
      <Pressable onPress={onOpenDrawer} style={headerStyles.iconBtn}>
        <Icon name="menu-outline" size={28} color={COLORS.textPrimary} />
      </Pressable>
      
      <View style={headerStyles.centerWrap}>
        <View style={headerStyles.titleRow}>
          <Text style={headerStyles.title}>Creator Studio</Text>
          <Icon name="checkmark-circle" size={16} color={COLORS.gold} style={{ marginLeft: 4 }} />
        </View>
      </View>

      <View style={headerStyles.rightWrap}>

      </View>
    </View>
  );
}

const headerStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
  },
  centerWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: -1,
  },
  logoWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  logoText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#8B6A3A',
    marginRight: 4,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  logoBrand: {
    fontSize: 12,
    fontWeight: '700',
    color: '#A08051',
    letterSpacing: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  rightWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  badge: {
    position: 'absolute',
    top: 0,
    right: 0,
    backgroundColor: COLORS.gold,
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFF',
  },
  badgeText: {
    fontSize: 10,
    color: '#FFF',
    fontWeight: '700',
  },
  palPointsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.gold,
    borderRadius: 22,
    padding: 4,
    paddingRight: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
  },
  palPointsIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.25)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  palPointsText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
    marginLeft: 8,
  },
});

// ==========================================
// 2. STAT CARD
// ==========================================
type StatCardProps = {
  icon: string;
  count: string | number;
  label: string;
  onPress: () => void;
};

export function StatCard({ icon, count, label, onPress }: StatCardProps) {
  return (
    <Pressable style={statStyles.card} onPress={onPress}>
      <View style={statStyles.topRow}>
        <View style={statStyles.iconWrap}>
          <Icon name={icon} size={20} color={COLORS.gold} />
        </View>
        <Text style={statStyles.topLabel} numberOfLines={1}>{label.split(' ')[1] || label}</Text>
      </View>
      <Text style={statStyles.count} numberOfLines={1} adjustsFontSizeToFit>{count}</Text>
      <View style={statStyles.bottomRow}>
        <Text style={statStyles.bottomLabel} numberOfLines={1}>{label}</Text>
        <Icon name="chevron-forward" size={14} color={COLORS.textSecondary} />
      </View>
    </Pressable>
  );
}

const statStyles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 12,
    marginHorizontal: 4, // for spacing between 3 cards
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 4,
    elevation: 1,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.goldLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  topLabel: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  count: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 12,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bottomLabel: {
    flex: 1,
    fontSize: 10,
    color: COLORS.textSecondary,
    marginRight: 4,
  },
});

// ==========================================
// 4. QUICK TOOL
// ==========================================
type QuickToolProps = {
  icon: string;
  label: string;
  onPress: () => void;
};

export function QuickTool({ icon, label, onPress }: QuickToolProps) {
  return (
    <Pressable style={toolStyles.card} onPress={onPress}>
      <View style={toolStyles.iconWrap}>
        <Icon name={icon} size={24} color="#8B6A3A" />
      </View>
      <Text style={toolStyles.label}>{label}</Text>
    </Pressable>
  );
}

const toolStyles = StyleSheet.create({
  card: {
    alignItems: 'center',
    marginRight: 20,
    width: 72,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 20,
    backgroundColor: COLORS.card,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  label: {
    fontSize: 11,
    color: COLORS.textPrimary,
    fontWeight: '500',
    textAlign: 'center',
  },
});

// ==========================================
// 5. METRIC PILL
// ==========================================
type MetricPillProps = {
  icon: string;
  count: number | string;
  label: string;
};

export function MetricPill({ icon, count, label }: MetricPillProps) {
  return (
    <View style={metricStyles.pill}>
      <View style={metricStyles.row}>
        <Icon name={icon} size={18} color={COLORS.textPrimary} style={{ marginRight: 6 }} />
        <Text style={metricStyles.count}>{count}</Text>
      </View>
      <Text style={metricStyles.label}>{label}</Text>
    </View>
  );
}

const metricStyles = StyleSheet.create({
  pill: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 10,
    marginHorizontal: 4,
    alignItems: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  count: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  label: {
    fontSize: 10,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
});
