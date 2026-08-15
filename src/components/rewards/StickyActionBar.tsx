import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const COLORS = {
  white: '#FFFFFF',
  text: '#202020',
  textMuted: '#6D6D6D',
  gold: '#D9A441',
  border: '#E7DFD2',
  background: '#FFFFFF',
};

interface StickyActionBarProps {
  onSave: () => void;
  onPrimaryAction: () => void;
  isSaved?: boolean;
  primaryActionLabel?: string;
  primaryActionIcon?: string;
}

export const StickyActionBar = ({ 
  onSave, 
  onPrimaryAction, 
  isSaved, 
  primaryActionLabel = 'Visit Vendor', 
  primaryActionIcon = 'arrow-forward' 
}: StickyActionBarProps) => {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingBottom: Math.max(insets.bottom, 16) }]}>
      <TouchableOpacity 
        style={styles.saveBtn} 
        onPress={onSave}
        activeOpacity={0.7}
      >
        <Icon name={isSaved ? "heart" : "heart-outline"} size={24} color={isSaved ? '#FF3B30' : COLORS.text} />
        <Text style={styles.saveText}>{isSaved ? 'Saved' : 'Save Offer'}</Text>
      </TouchableOpacity>

      <TouchableOpacity 
        style={styles.primaryBtn} 
        onPress={onPrimaryAction}
        activeOpacity={0.8}
      >
        <Text style={styles.primaryText}>{primaryActionLabel}</Text>
        <Icon name={primaryActionIcon} size={20} color={COLORS.text} style={styles.primaryIcon} />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    backgroundColor: COLORS.white,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 8,
  },
  saveBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginRight: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  saveText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.text,
    marginTop: 4,
  },
  primaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.gold,
    paddingVertical: 18,
    borderRadius: 16,
  },
  primaryText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
  },
  primaryIcon: {
    marginLeft: 8,
  },
});
