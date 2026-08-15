import React, { useEffect, useState } from 'react';
import {
  Alert,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { colors } from '../config/theme';

type PromptOptions = {
  title: string;
  message?: string;
  placeholder?: string;
  defaultValue?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  required?: boolean;
};

type ReasonPromptModalProps = PromptOptions & {
  visible: boolean;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
};

export function ReasonPromptModal({
  visible,
  title,
  message,
  placeholder = 'Enter a reason…',
  defaultValue = '',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  required = false,
  onConfirm,
  onCancel,
}: ReasonPromptModalProps) {
  const [text, setText] = useState(defaultValue);

  useEffect(() => {
    if (visible) setText(defaultValue);
  }, [visible, defaultValue]);

  const handleConfirm = () => {
    const trimmed = text.trim();
    if (required && !trimmed) return;
    onConfirm(trimmed);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>{title}</Text>
          {message ? <Text style={styles.message}>{message}</Text> : null}
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder={placeholder}
            placeholderTextColor={colors.textMuted}
            multiline
            autoFocus
          />
          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
              <Text style={styles.cancelText}>{cancelLabel}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.confirmBtn, required && !text.trim() && styles.confirmDisabled]}
              onPress={handleConfirm}
              disabled={required && !text.trim()}
            >
              <Text style={styles.confirmText}>{confirmLabel}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

/** Cross-platform reason prompt — Alert.prompt on iOS, modal on Android. */
export function promptWithReason(
  options: PromptOptions,
  onConfirm: (reason: string) => void,
  openAndroidModal: (opts: PromptOptions, cb: (reason: string) => void) => void,
) {
  if (Platform.OS === 'ios') {
    Alert.prompt(
      options.title,
      options.message,
      (reason) => onConfirm(reason?.trim() || options.defaultValue || ''),
      'plain-text',
      options.defaultValue,
    );
    return;
  }

  openAndroidModal(options, onConfirm);
}

/** Android decline flow: quick fixed reason or optional note via modal. */
export function promptDeclineWithOptions(
  title: string,
  onDecline: (reason: string) => void,
  openAndroidModal: (opts: PromptOptions, cb: (reason: string) => void) => void,
  defaults: { quick?: string; withNote?: string } = {},
) {
  const quickReason = defaults.quick ?? 'Declined';
  const noteTitle = defaults.withNote ?? 'Decline with note';

  if (Platform.OS === 'ios') {
    Alert.prompt(title, 'Reason (optional)', (reason) => {
      onDecline(reason?.trim() || quickReason);
    });
    return;
  }

  Alert.alert(title, 'Choose how to decline', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Decline', style: 'destructive', onPress: () => onDecline(quickReason) },
    {
      text: noteTitle,
      onPress: () =>
        openAndroidModal(
          { title, message: 'Add an optional note for the vendor.', placeholder: 'Reason…' },
          (reason) => onDecline(reason.trim() || quickReason),
        ),
    },
  ]);
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: 24,
  },
  sheet: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 20,
  },
  title: { fontSize: 17, fontWeight: '700', color: colors.text, marginBottom: 6 },
  message: { fontSize: 14, color: colors.textSecondary, marginBottom: 12, lineHeight: 20 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 12,
    minHeight: 80,
    textAlignVertical: 'top',
    color: colors.text,
    fontSize: 15,
  },
  actions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  cancelText: { fontWeight: '700', color: colors.text },
  confirmBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: 'center',
  },
  confirmDisabled: { opacity: 0.45 },
  confirmText: { fontWeight: '700', color: '#fff' },
});
