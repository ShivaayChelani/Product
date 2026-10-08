/**
 * 12-hour time picker modal for the Add Event form.
 *
 * Two scrollable columns (hour / minute on a 5-minute grid) plus an AM/PM
 * toggle, because the app has no native time-picker module. Selection is
 * applied immediately and `onSelect` fires with a zero-padded "HH:MM" 24-hour
 * string — the only format the server's `normalizeEventTime` accepts.
 */
import React, { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { EVENT_COLORS } from '../EventCard';
import {
  HOURS_12,
  MINUTES_5,
  formatTime12,
  hhmmToParts,
  partsToHhmm,
} from '../eventFormDate';

type Props = {
  visible: boolean;
  title: string;
  value: string;
  onSelect: (hhmm: string) => void;
  onClose: () => void;
};

export default function EventTimeModal({ visible, title, value, onSelect, onClose }: Props) {
  const [hour12, setHour12] = useState(9);
  const [minute, setMinute] = useState(0);
  const [period, setPeriod] = useState<'AM' | 'PM'>('AM');

  useEffect(() => {
    if (!visible) return;
    const parts = hhmmToParts(value);
    setHour12(parts.hour12);
    // Snap an off-grid minute (e.g. 09:37) to the nearest 5 for the wheel.
    setMinute(Math.round(parts.minute / 5) * 5 % 60);
    setPeriod(parts.period);
  }, [visible, value]);

  const apply = (next: { hour12?: number; minute?: number; period?: 'AM' | 'PM' }) => {
    const h = next.hour12 ?? hour12;
    const m = next.minute ?? minute;
    const p = next.period ?? period;
    setHour12(h);
    setMinute(m);
    setPeriod(p);
    onSelect(partsToHhmm(h, m, p));
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
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
              accessibilityLabel="Close time picker"
            >
              <Icon name="close" size={20} color={EVENT_COLORS.textSecondary} />
            </Pressable>
          </View>

          <Text style={styles.preview}>{formatTime12(partsToHhmm(hour12, minute, period))}</Text>

          <View style={styles.columns}>
            <ScrollView style={styles.column} contentContainerStyle={styles.columnContent}>
              {HOURS_12.map(h => (
                <Pressable
                  key={h}
                  onPress={() => apply({ hour12: h })}
                  style={[styles.option, hour12 === h && styles.optionActive]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: hour12 === h }}
                >
                  <Text style={[styles.optionText, hour12 === h && styles.optionTextActive]}>
                    {`${h}`.padStart(2, '0')}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            <ScrollView style={styles.column} contentContainerStyle={styles.columnContent}>
              {MINUTES_5.map(m => (
                <Pressable
                  key={m}
                  onPress={() => apply({ minute: m })}
                  style={[styles.option, minute === m && styles.optionActive]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: minute === m }}
                >
                  <Text style={[styles.optionText, minute === m && styles.optionTextActive]}>
                    {`${m}`.padStart(2, '0')}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            <View style={styles.periodColumn}>
              {(['AM', 'PM'] as const).map(p => (
                <Pressable
                  key={p}
                  onPress={() => apply({ period: p })}
                  style={[styles.periodOption, period === p && styles.optionActive]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: period === p }}
                >
                  <Text style={[styles.optionText, period === p && styles.optionTextActive]}>{p}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          <Pressable style={styles.doneBtn} onPress={onClose} accessibilityRole="button">
            <Text style={styles.doneText}>Done</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0,0.45)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: EVENT_COLORS.border,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 16, fontWeight: '800', color: EVENT_COLORS.text },
  preview: {
    fontSize: 26,
    fontWeight: '800',
    color: EVENT_COLORS.accent,
    textAlign: 'center',
    marginVertical: 8,
  },
  columns: { flexDirection: 'row', gap: 8, height: 196 },
  column: { flex: 1, borderRadius: 14, backgroundColor: '#F7F6F1' },
  columnContent: { paddingVertical: 6, gap: 4 },
  periodColumn: { width: 74, justifyContent: 'center', gap: 8 },
  option: {
    paddingVertical: 9,
    borderRadius: 10,
    alignItems: 'center',
    marginHorizontal: 6,
  },
  periodOption: { paddingVertical: 12, borderRadius: 12, backgroundColor: '#F7F6F1' },
  optionActive: { backgroundColor: EVENT_COLORS.accent },
  optionText: { fontSize: 15, fontWeight: '600', color: EVENT_COLORS.textBody },
  optionTextActive: { color: '#FFFFFF' },
  doneBtn: {
    marginTop: 14,
    height: 44,
    borderRadius: 14,
    backgroundColor: EVENT_COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneText: { color: '#FFFFFF', fontSize: 14.5, fontWeight: '700' },
});
