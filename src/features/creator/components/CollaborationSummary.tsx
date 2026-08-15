import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';

const COLORS = {
  card: '#FFFFFF',
  textPrimary: '#1F1A17',
  textSecondary: '#5E544C',
  border: '#E3DACD',
  primary: '#7B5E43',
  iconBg: '#F3EFE9',
};

type CollaborationSummaryProps = {
  newRequests: number;
  active: number;
  completed: number;
  totalEarnedRupees: number;
  onPressNewRequests: () => void;
  onPressActive: () => void;
  onPressCompleted: () => void;
  onPressTotalEarned: () => void;
};

export function CollaborationSummary({
  newRequests,
  active,
  completed,
  totalEarnedRupees,
  onPressNewRequests,
  onPressActive,
  onPressCompleted,
  onPressTotalEarned,
}: CollaborationSummaryProps) {
  const renderCard = (label: string, value: string | number, icon: string, onPress: () => void) => (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={styles.topRow}>
        <View style={styles.iconWrap}>
          <Icon name={icon} size={16} color={COLORS.primary} />
        </View>
        <Text style={styles.label}>{label}</Text>
      </View>
      <Text style={styles.value}>{value}</Text>
    </Pressable>
  );

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        {renderCard('New Requests', newRequests < 10 && newRequests > 0 ? `0${newRequests}` : newRequests, 'mail-outline', onPressNewRequests)}
        {renderCard('Active', active < 10 && active > 0 ? `0${active}` : active, 'play-circle-outline', onPressActive)}
      </View>
      <View style={styles.row}>
        {renderCard('Completed', completed < 10 && completed > 0 ? `0${completed}` : completed, 'checkmark-circle-outline', onPressCompleted)}
        {renderCard('All Collabs', `${newRequests + active + completed}`, 'list-outline', onPressTotalEarned)}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    marginBottom: 16,
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  card: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 2,
    elevation: 1,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 6,
  },
  iconWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.iconBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
  },
  value: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
});
