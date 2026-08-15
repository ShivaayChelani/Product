import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { UserActiveMode } from '../types';

const LABELS: Record<string, string> = {
  USER: 'User',
  VENDOR: 'Switch as Vendor',
  CONTENT_CREATOR: 'Switch as Creator',
  ADMIN: 'Admin',
};

type Props = {
  modes: UserActiveMode[];
  activeMode: UserActiveMode | string;
  onSwitch: (mode: UserActiveMode) => Promise<void>;
  /** Include safe-area top padding (tourist profile / vendor profile headers). */
  withTopInset?: boolean;
  /** Compact header chip that opens the switch sheet (default true for multi-role UX). */
  variant?: 'sheet' | 'inline';
  /**
   * Identity shown per mode so the active profile is always obvious,
   * e.g. { USER: 'Rahul Chelani', VENDOR: 'Street Story', CONTENT_CREATOR: '@travel_with_sneha' }.
   */
  modeIdentities?: Partial<Record<string, string>>;
};

/**
 * Profile switcher — bottom sheet for multi-role accounts.
 * Same user / wallet / notifications; only activeMode changes.
 */
export default function ProfileModeSwitcher({
  modes,
  activeMode,
  onSwitch,
  withTopInset,
  variant = 'sheet',
  modeIdentities,
}: Props) {
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  const switchable = useMemo(
    () => modes.filter((m) => m !== 'ADMIN'),
    [modes],
  );

  if (switchable.length < 2) return null;

  const handlePress = async (mode: UserActiveMode) => {
    const current = String(activeMode).toUpperCase();
    const next = String(mode).toUpperCase();
    if (busy || next === current) return;
    setBusy(true);
    setOpen(false);
    try {
      await onSwitch(mode);
    } finally {
      setBusy(false);
    }
  };

  if (variant === 'inline') {
    return (
      <View style={[styles.wrap, withTopInset && { paddingTop: Math.max(insets.top, 12) + 8 }]}>
        <View style={styles.row}>
          <Text style={styles.label}>Switch workspace</Text>
          {busy ? <ActivityIndicator size="small" color="#B9834B" /> : null}
        </View>
        <View style={styles.choices}>
          {switchable.map((mode) => {
            const active = String(activeMode).toUpperCase() === String(mode).toUpperCase();
            return (
              <TouchableOpacity
                key={mode}
                disabled={busy}
                onPress={() => handlePress(mode)}
                style={[styles.choice, active && styles.choiceActive]}
                activeOpacity={0.85}
              >
                <Text style={[styles.choiceText, active && styles.choiceTextActive]}>
                  {LABELS[mode] || mode}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <Text style={styles.hint}>Same account · no logout needed</Text>
      </View>
    );
  }

  return (
    <View style={[styles.headerBlock, withTopInset && { paddingTop: Math.max(insets.top, 12) + 4 }]}>
      <TouchableOpacity
        style={styles.activeChip}
        onPress={() => setOpen(true)}
        activeOpacity={0.85}
        disabled={busy}
      >
        <View>
          <Text style={styles.activeLabel}>Workspace</Text>
          <Text style={styles.activeValue}>
            {modeIdentities?.[String(activeMode)]
              ? `${modeIdentities[String(activeMode)]} · ${LABELS[String(activeMode)] || String(activeMode)} ▼`
              : `${LABELS[String(activeMode)] || String(activeMode)} ▼`}
          </Text>
        </View>
        {busy ? <ActivityIndicator size="small" color="#B9834B" /> : null}
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
          <View style={styles.handle} />
          <Text style={styles.sheetTitle}>Switch workspace</Text>
          <Text style={styles.sheetHint}>User = normal app · second option = your approved workspace</Text>
          {switchable.map((mode) => {
            const active = String(activeMode).toUpperCase() === String(mode).toUpperCase();
            return (
              <TouchableOpacity
                key={mode}
                disabled={busy}
                onPress={() => handlePress(mode)}
                style={[styles.sheetRow, active && styles.sheetRowActive]}
                activeOpacity={0.85}
              >
                <View>
                  <Text style={[styles.sheetRowText, active && styles.sheetRowTextActive]}>
                    {modeIdentities?.[mode] || LABELS[mode] || mode}
                  </Text>
                  {modeIdentities?.[mode] ? (
                    <Text style={[styles.sheetRowSub, active && styles.sheetRowTextActive]}>
                      {LABELS[mode] || mode}
                    </Text>
                  ) : null}
                </View>
                {active ? <Text style={styles.check}>✓</Text> : null}
              </TouchableOpacity>
            );
          })}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  headerBlock: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  activeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(185,131,75,0.28)',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  activeLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#A08970',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  activeValue: {
    marginTop: 2,
    fontSize: 16,
    fontWeight: '800',
    color: '#63300E',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E5E0D8',
    marginBottom: 12,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#2C1810',
    marginBottom: 4,
  },
  sheetHint: {
    fontSize: 12,
    color: '#A08970',
    marginBottom: 14,
  },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 8,
    backgroundColor: '#FAF7F2',
  },
  sheetRowActive: {
    backgroundColor: '#B9834B',
  },
  sheetRowText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#63300E',
  },
  sheetRowSub: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: '600',
    color: '#A08970',
  },
  sheetRowTextActive: {
    color: '#FFFFFF',
  },
  check: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 16,
  },
  wrap: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(200,155,60,0.18)',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  label: {
    color: '#8B7355',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  choices: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  choice: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(185,131,75,0.28)',
  },
  choiceActive: {
    backgroundColor: '#B9834B',
    borderColor: '#B9834B',
  },
  choiceText: {
    color: '#63300E',
    fontSize: 13,
    fontWeight: '700',
  },
  choiceTextActive: {
    color: '#FFFFFF',
  },
  hint: {
    marginTop: 8,
    fontSize: 11,
    color: '#A08970',
  },
});
