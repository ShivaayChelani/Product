import React, { memo, useState } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { SettingsTheme as T, SettingsFonts } from '../theme';

type Props = {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  hint?: string;
  error?: string;
  autoCapitalize?: 'none' | 'sentences';
};

function SettingsPasswordFieldComponent({
  label,
  value,
  onChangeText,
  placeholder,
  hint,
  error,
  autoCapitalize = 'none',
}: Props) {
  const [visible, setVisible] = useState(false);
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.inputRow, error ? styles.inputError : null]}>
        <Icon name="lock-closed-outline" size={18} color={T.textMuted} />
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={T.textMuted}
          secureTextEntry={!visible}
          autoCapitalize={autoCapitalize}
          autoCorrect={false}
          style={styles.input}
        />
        <TouchableOpacity
          onPress={() => setVisible(v => !v)}
          hitSlop={8}
          accessibilityLabel={visible ? 'Hide password' : 'Show password'}
        >
          <Icon name={visible ? 'eye-off-outline' : 'eye-outline'} size={20} color={T.textMuted} />
        </TouchableOpacity>
      </View>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

export const SettingsPasswordField = memo(SettingsPasswordFieldComponent);

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  label: {
    ...SettingsFonts.rowTitle,
    fontSize: 14,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: T.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: T.border,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  inputError: { borderColor: T.danger },
  input: {
    flex: 1,
    ...SettingsFonts.rowSubtitle,
    fontSize: 15,
    color: T.text,
    padding: 0,
  },
  hint: {
    ...SettingsFonts.rowSubtitle,
    fontSize: 12,
  },
  error: {
    ...SettingsFonts.rowSubtitle,
    fontSize: 12,
    color: T.danger,
  },
});
