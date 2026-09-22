import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';

interface LegalConsentRowProps {
  accepted: boolean;
  onToggle: () => void;
  onOpenDocument: () => void;
  label: string;
  linkLabel: string;
  accessibilityLabel?: string;
}

/**
 * A single legal consent row — checkbox + label text + tappable document link.
 * Used in SignupScreen and LegalAcceptanceModal.
 *
 * Accessibility: checkbox role, checked state, and descriptive label.
 */
export function LegalConsentRow({
  accepted,
  onToggle,
  onOpenDocument,
  label,
  linkLabel,
  accessibilityLabel,
}: LegalConsentRowProps) {
  return (
    <View style={styles.row}>
      <TouchableOpacity
        onPress={onToggle}
        style={styles.checkbox}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: accepted }}
        accessibilityLabel={accessibilityLabel || `${linkLabel} checkbox`}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        activeOpacity={0.7}
      >
        <Icon
          name={accepted ? 'checkbox' : 'square-outline'}
          size={22}
          color={accepted ? '#B9834B' : '#AAAAAA'}
        />
      </TouchableOpacity>

      <View style={styles.labelRow}>
        <Text style={styles.label}>{label} </Text>
        <TouchableOpacity
          onPress={onOpenDocument}
          accessibilityRole="link"
          accessibilityLabel={`Open ${linkLabel}`}
          hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
        >
          <Text style={styles.link}>{linkLabel}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    paddingHorizontal: 2,
  },
  checkbox: {
    marginRight: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    flex: 1,
  },
  label: {
    color: '#6F6F6F',
    fontSize: 13,
    lineHeight: 18,
  },
  link: {
    color: '#B9834B',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
    textDecorationLine: 'underline',
  },
});
