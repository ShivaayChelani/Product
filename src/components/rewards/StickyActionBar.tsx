import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  DARK_BUTTON_BG_ALT,
  DISABLED_BUTTON_BG,
  DISABLED_BUTTON_FG,
  ON_DARK,
} from '../../design/contrast';

const COLORS = {
  white: '#FFFFFF',
  border: '#F2F2F2',
};

interface StickyActionBarProps {
  onPrimaryAction: () => void;
  primaryActionLabel?: string;
  primaryActionIcon?: string;
  disabled?: boolean;
  loading?: boolean;
}

export const StickyActionBar = ({
  onPrimaryAction,
  primaryActionLabel = 'Visit Vendor',
  primaryActionIcon = 'arrow-forward',
  disabled = false,
  loading = false,
}: StickyActionBarProps) => {
  const insets = useSafeAreaInsets();
  const inactive = disabled || loading;
  const foreground = inactive ? DISABLED_BUTTON_FG : ON_DARK;

  return (
    <View style={[styles.container, { paddingBottom: Math.max(insets.bottom, 16) }]}>
      <TouchableOpacity
        style={[styles.primaryBtn, inactive && styles.primaryBtnDisabled]}
        onPress={onPrimaryAction}
        activeOpacity={0.8}
        disabled={inactive}
        accessibilityRole="button"
        accessibilityLabel={primaryActionLabel}
        accessibilityState={{ disabled: inactive, busy: loading }}
      >
        {loading ? (
          <ActivityIndicator color={foreground} />
        ) : (
          <>
            <Text style={[styles.primaryText, inactive && styles.primaryTextDisabled]}>
              {primaryActionLabel}
            </Text>
            <Icon name={primaryActionIcon} size={20} color={foreground} style={styles.primaryIcon} />
          </>
        )}
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'stretch',
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
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: DARK_BUTTON_BG_ALT,
    paddingVertical: 18,
    borderRadius: 16,
    minHeight: 56,
  },
  primaryBtnDisabled: {
    backgroundColor: DISABLED_BUTTON_BG,
  },
  primaryText: {
    fontSize: 16,
    fontWeight: '700',
    color: ON_DARK,
  },
  primaryTextDisabled: {
    color: DISABLED_BUTTON_FG,
  },
  primaryIcon: {
    marginLeft: 8,
  },
});
