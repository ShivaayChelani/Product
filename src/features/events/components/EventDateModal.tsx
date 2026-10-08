/**
 * Calendar modal for the Add Event form.
 *
 * Self-contained (no date-picker native module in this app) and deliberately
 * dumb: it shows one month, highlights the selected day, blocks days before
 * `minDate`, and hands back a "YYYY-MM-DD" string. Month arithmetic stays in
 * local time so "1 Jan" never jumps a day at the UTC boundary.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { EVENT_COLORS } from '../EventCard';
import {
  WEEKDAY_LABELS,
  daysInMonth,
  formatMonthHeading,
  leadingBlanks,
  parseIsoDate,
  toIsoDate,
} from '../eventFormDate';

type Props = {
  visible: boolean;
  title: string;
  value: string;
  /** Earliest selectable "YYYY-MM-DD" (inclusive). */
  minDate?: string;
  onSelect: (iso: string) => void;
  onClose: () => void;
};

type Cursor = { year: number; monthIndex: number };

function cursorFromIso(iso: string): Cursor {
  const parsed = parseIsoDate(iso);
  if (parsed) return { year: parsed.getFullYear(), monthIndex: parsed.getMonth() };
  const now = new Date();
  return { year: now.getFullYear(), monthIndex: now.getMonth() };
}

function shiftMonth(cursor: Cursor, delta: number): Cursor {
  const next = new Date(cursor.year, cursor.monthIndex + delta, 1);
  return { year: next.getFullYear(), monthIndex: next.getMonth() };
}

export default function EventDateModal({ visible, title, value, minDate, onSelect, onClose }: Props) {
  const [cursor, setCursor] = useState<Cursor>(() => cursorFromIso(value));
  const [selected, setSelected] = useState(value);

  // Re-open on the field's current value rather than the last month browsed.
  useEffect(() => {
    if (!visible) return;
    setCursor(cursorFromIso(value));
    setSelected(value);
  }, [visible, value]);

  const min = minDate ? parseIsoDate(minDate) : null;

  const { blanks, days, currentMonthKey } = useMemo(() => {
    const blanks = leadingBlanks(cursor.year, cursor.monthIndex);
    const count = daysInMonth(cursor.year, cursor.monthIndex);
    const days = Array.from({ length: count }, (_, i) => {
      const iso = toIsoDate(new Date(cursor.year, cursor.monthIndex, i + 1));
      const disabled = min ? iso < minDate! : false;
      return { day: i + 1, iso, disabled };
    });
    return { blanks, days, currentMonthKey: `${cursor.year}-${cursor.monthIndex}` };
  }, [cursor, min, minDate]);

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
              accessibilityLabel="Close date picker"
            >
              <Icon name="close" size={20} color={EVENT_COLORS.textSecondary} />
            </Pressable>
          </View>

          <View style={styles.monthRow}>
            <Pressable
              onPress={() => setCursor(c => shiftMonth(c, -1))}
              style={styles.monthBtn}
              accessibilityRole="button"
              accessibilityLabel="Previous month"
            >
              <Icon name="chevron-back" size={18} color={EVENT_COLORS.accent} />
            </Pressable>
            <Text style={styles.monthText}>{formatMonthHeading(cursor.year, cursor.monthIndex)}</Text>
            <Pressable
              onPress={() => setCursor(c => shiftMonth(c, 1))}
              style={styles.monthBtn}
              accessibilityRole="button"
              accessibilityLabel="Next month"
            >
              <Icon name="chevron-forward" size={18} color={EVENT_COLORS.accent} />
            </Pressable>
          </View>

          <View style={styles.weekRow}>
            {WEEKDAY_LABELS.map((label, index) => (
              <Text key={`${label}-${index}`} style={styles.weekday}>
                {label}
              </Text>
            ))}
          </View>

          <View key={currentMonthKey} style={styles.grid}>
            {Array.from({ length: blanks }, (_, i) => (
              <View key={`blank-${i}`} style={styles.cell} />
            ))}
            {days.map(cell => {
              const isSelected = selected === cell.iso;
              return (
                <Pressable
                  key={cell.iso}
                  disabled={cell.disabled}
                  onPress={() => {
                    setSelected(cell.iso);
                    onSelect(cell.iso);
                  }}
                  style={[styles.cell, isSelected && styles.cellSelected]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected, disabled: cell.disabled }}
                  accessibilityLabel={cell.iso}
                >
                  <Text style={[styles.dayText, isSelected && styles.dayTextSelected, cell.disabled && styles.dayTextDisabled]}>
                    {cell.day}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const CELL = 44;

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(29,36,32,0.45)',
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
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  monthBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: EVENT_COLORS.accentSoft,
  },
  monthText: { fontSize: 15, fontWeight: '700', color: EVENT_COLORS.text },
  weekRow: { flexDirection: 'row', marginTop: 12, marginBottom: 4 },
  weekday: { width: CELL, textAlign: 'center', fontSize: 11, fontWeight: '700', color: EVENT_COLORS.textSecondary },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: {
    width: CELL,
    height: CELL,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: CELL / 2,
  },
  cellSelected: { backgroundColor: EVENT_COLORS.accent },
  dayText: { fontSize: 14, fontWeight: '600', color: EVENT_COLORS.text },
  dayTextSelected: { color: '#FFFFFF' },
  dayTextDisabled: { color: '#D9E0DB' },
});
