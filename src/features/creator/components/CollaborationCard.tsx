import React from 'react';
import { View, Text, StyleSheet, Pressable, Image } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { CollaborationStatus } from '../../../services/api/collaborations';

const COLORS = {
  card: '#FFFFFF',
  textPrimary: '#1F1A17',
  textSecondary: '#5E544C',
  border: '#E3DACD',
  gold: '#A67C52',
};

// Subtle colors mapping
const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  PENDING: { bg: '#FEF3C7', text: '#B45309' }, // Muted orange
  ACCEPTED: { bg: '#E6F4EA', text: '#1E8E3E' }, // Muted green
  IN_PROGRESS: { bg: '#F5EDE2', text: '#7B5E43' }, // Muted brown/gold
  REVISION_REQUESTED: { bg: '#F5EDE2', text: '#7B5E43' },
  REEL_UPLOADED: { bg: '#F5EDE2', text: '#7B5E43' },
  APPROVED: { bg: '#E6F4EA', text: '#1E8E3E' },
  COMPLETED: { bg: '#E6F4EA', text: '#1E8E3E' }, // Muted green
  REJECTED: { bg: '#FEE2E2', text: '#DC2626' }, // Muted red
  CANCELLED: { bg: '#FEE2E2', text: '#DC2626' }, // Muted red
};

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pending',
  ACCEPTED: 'Accepted',
  IN_PROGRESS: 'In Progress',
  REVISION_REQUESTED: 'Changes requested',
  REEL_UPLOADED: 'Pending',
  APPROVED: 'Approved',
  COMPLETED: 'Completed',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
};

type CollaborationCardProps = {
  vendorName: string;
  vendorCategory: string;
  location: string;
  status: CollaborationStatus | string;
  dateStr: string;
  earningsStr: string;
  avatarUrl?: string;
  onViewDetails: () => void;
};

export function CollaborationCard({
  vendorName,
  vendorCategory,
  location,
  status,
  dateStr,
  earningsStr,
  avatarUrl,
  onViewDetails,
}: CollaborationCardProps) {
  const statusColors = STATUS_COLORS[status] || { bg: '#F3F4F6', text: '#4B5563' };
  const statusLabel = STATUS_LABELS[status] || status;

  return (
    <Pressable style={styles.card} onPress={onViewDetails}>
      <View style={styles.mainRow}>
        <View style={styles.avatarWrap}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarText}>{vendorName.charAt(0)}</Text>
            </View>
          )}
        </View>
        <View style={styles.infoWrap}>
          <Text style={styles.vendorName}>{vendorName}</Text>
          <Text style={styles.vendorSubtitle}>{vendorCategory} • {location}</Text>
          <View style={styles.statusRow}>
            <View style={[styles.statusBadge, { backgroundColor: statusColors.bg }]}>
              <Text style={[styles.statusText, { color: statusColors.text }]}>{statusLabel}</Text>
            </View>
            <View style={styles.dateRow}>
              <Icon name="calendar-outline" size={12} color={COLORS.textSecondary} style={{ marginRight: 4 }} />
              <Text style={styles.dateText}>{dateStr}</Text>
            </View>
          </View>
        </View>
        <View style={styles.rightWrap}>
          <View style={styles.earningsWrap}>
            <Text style={styles.earningsAmount}>{earningsStr}</Text>
            <Text style={styles.earningsLabel}>
              {['COMPLETED', 'APPROVED'].includes(status) ? 'Earned' : 'Earnings'}
            </Text>
          </View>
          <Icon name="chevron-forward" size={16} color={COLORS.textSecondary} />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    marginHorizontal: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  mainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  avatarWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginRight: 12,
    backgroundColor: '#F3EFE9',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: '100%',
    height: '100%',
  },
  avatarPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#7B5E43',
  },
  infoWrap: {
    flex: 1,
    alignItems: 'flex-start',
  },
  vendorName: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 2,
  },
  vendorSubtitle: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginBottom: 8,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '700',
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dateText: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  rightWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 80,
    justifyContent: 'flex-end',
  },
  earningsWrap: {
    alignItems: 'flex-end',
  },
  earningsAmount: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1E8E3E',
  },
  earningsLabel: {
    fontSize: 10,
    color: COLORS.textSecondary,
  },
});
