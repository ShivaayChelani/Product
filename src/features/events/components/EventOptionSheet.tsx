/**
 * Generic single-choice modal used by the Add Event form for closed sets
 * (event type). Kept separate from the calendar/time modals so the option list
 * stays declarative: the caller owns the choices and the labels.
 */
import React from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { EVENT_COLORS } from '../EventCard';

export type EventOption = {
  value: string;
  label: string;
  icon?: string;
  hint?: string;
};

type Props = {
  visible: boolean;
  title: string;
  options: EventOption[];
  selected: string | null;
  onSelect: (value: string) => void;
  onClose: () => void;
};

export default function EventOptionSheet({ visible, title, options, selected, onSelect, onClose }: Props) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button">
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.header}>
            <Text style={styles.title} accessibilityRole="header">
              {title}
            </Text>
            <Pressable
              onPress={onClose}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel={`Close ${title.toLowerCase()}`}
            >
              <Icon name="close" size={20} color={EVENT_COLORS.textSecondary} />
            </Pressable>
          </View>

          <FlatList
            data={options}
            keyExtractor={item => item.value}
            style={styles.list}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => {
              const isActive = selected === item.value;
              return (
                <Pressable
                  onPress={() => {
                    onSelect(item.value);
                    onClose();
                  }}
                  style={[styles.row, isActive && styles.rowActive]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isActive }}
                >
                  {item.icon ? (
                    <Icon name={item.icon} size={17} color={isActive ? EVENT_COLORS.accent : EVENT_COLORS.textSecondary} />
                  ) : null}
                  <View style={styles.rowText}>
                    <Text style={[styles.rowLabel, isActive && styles.rowLabelActive]}>{item.label}</Text>
                    {item.hint ? <Text style={styles.rowHint}>{item.hint}</Text> : null}
                  </View>
                  {isActive ? <Icon name="checkmark" size={18} color={EVENT_COLORS.accent} /> : null}
                </Pressable>
              );
            }}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0, 0, 0,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 24,
    maxHeight: '78%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 10,
  },
  title: { fontSize: 16, fontWeight: '800', color: EVENT_COLORS.text },
  list: { flexGrow: 0 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 13,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: EVENT_COLORS.border,
    marginBottom: 8,
    backgroundColor: '#FFFFFF',
  },
  rowActive: { borderColor: EVENT_COLORS.accent, backgroundColor: EVENT_COLORS.accentSoft },
  rowText: { flex: 1 },
  rowLabel: { fontSize: 14.5, fontWeight: '600', color: EVENT_COLORS.text },
  rowLabelActive: { color: EVENT_COLORS.accent },
  rowHint: { fontSize: 12, color: EVENT_COLORS.textSecondary, marginTop: 2 },
});
