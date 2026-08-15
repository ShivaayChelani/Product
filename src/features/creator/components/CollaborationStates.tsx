import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';

const COLORS = {
  bg: '#FCF9F5',
  card: '#F5EDE2', // Muted brown/gold background
  white: '#FFFFFF',
  textPrimary: '#1F1A17',
  textSecondary: '#5E544C',
  primary: '#7B5E43',
  border: '#E3DACD',
};

// ==========================================
// EMPTY STATE
// ==========================================
type EmptyCollaborationStateProps = {
  onExplore: () => void;
  onDashboard: () => void;
};

export function EmptyCollaborationState({ onExplore, onDashboard }: EmptyCollaborationStateProps) {
  return (
    <View style={emptyStyles.container}>
      <View style={emptyStyles.iconWrap}>
        <Icon name="briefcase-outline" size={48} color={COLORS.primary} />
      </View>
      <Text style={emptyStyles.title}>No collaborations here yet</Text>
      <Text style={emptyStyles.subtitle}>
        New opportunities from local businesses will appear here.
      </Text>
      <Pressable style={emptyStyles.primaryBtn} onPress={onExplore}>
        <Text style={emptyStyles.primaryBtnText}>Explore Businesses</Text>
      </Pressable>
      <Pressable style={emptyStyles.secondaryBtn} onPress={onDashboard}>
        <Text style={emptyStyles.secondaryBtnText}>Back to Creator Dashboard</Text>
      </Pressable>
    </View>
  );
}

const emptyStyles = StyleSheet.create({
  container: {
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 300,
  },
  iconWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: COLORS.card,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 20,
    paddingHorizontal: 20,
  },
  primaryBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
    marginBottom: 16,
    width: '100%',
    alignItems: 'center',
  },
  primaryBtnText: {
    color: COLORS.white,
    fontWeight: '700',
    fontSize: 14,
  },
  secondaryBtn: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    width: '100%',
    alignItems: 'center',
  },
  secondaryBtnText: {
    color: COLORS.textSecondary,
    fontWeight: '600',
    fontSize: 14,
  },
});

// ==========================================
// PROMOTIONAL CARD
// ==========================================
export function BusinessDiscoveryPromotional({ onExplore }: { onExplore: () => void }) {
  return (
    <View style={promoStyles.card}>
      <View style={promoStyles.iconWrap}>
        <Icon name="hand-right-outline" size={24} color={COLORS.white} />
      </View>
      <View style={promoStyles.contentWrap}>
        <Text style={promoStyles.title}>Grow your network</Text>
        <Text style={promoStyles.subtitle}>Collaborate with more businesses and increase your earnings.</Text>
      </View>
      <Pressable style={promoStyles.btn} onPress={onExplore}>
        <Text style={promoStyles.btnText}>Explore Businesses</Text>
        <Icon name="arrow-forward" size={14} color={COLORS.white} />
      </Pressable>
    </View>
  );
}

const promoStyles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 24,
    flexDirection: 'column',
    gap: 12,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#A67C52', // Muted gold
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  contentWrap: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 18,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: COLORS.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    gap: 6,
    marginTop: 8,
  },
  btnText: {
    color: COLORS.white,
    fontWeight: '700',
    fontSize: 13,
  },
});
