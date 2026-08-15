import React, { useRef, useEffect } from 'react';
import { View, TextInput, StyleSheet, Platform } from 'react-native';

const COLORS = {
  border: '#E8DFD8',
  borderActive: '#C4A574',
  text: '#2C1810',
  white: '#FFFFFF',
};

interface OTPInputProps {
  length: number;
  value: string;
  onChange: (value: string) => void;
  onComplete?: (code: string) => void;
}

export const OTPInput: React.FC<OTPInputProps> = ({ length, value, onChange, onComplete }) => {
  const inputs = useRef<(TextInput | null)[]>([]);
  const digits = value.padEnd(length, ' ').slice(0, length).split('');

  useEffect(() => {
    inputs.current[0]?.focus();
  }, []);

  useEffect(() => {
    if (value.length === length && onComplete) {
      onComplete(value);
    }
  }, [value, length, onComplete]);

  const applyDigits = (raw: string, startIndex = 0) => {
    const cleaned = raw.replace(/\D/g, '').slice(0, length - startIndex);
    if (!cleaned) return startIndex;

    const next = value.split('');
    while (next.length < length) next.push('');
    for (let i = 0; i < cleaned.length && startIndex + i < length; i++) {
      next[startIndex + i] = cleaned[i];
    }
    const joined = next.join('').trimEnd();
    onChange(joined);

    const focusIndex = Math.min(startIndex + cleaned.length, length - 1);
    inputs.current[focusIndex]?.focus();
    return focusIndex;
  };

  const handleChange = (text: string, index: number) => {
    if (text.length > 1) {
      applyDigits(text, index);
      return;
    }
    const digit = text.replace(/\D/g, '');
    const next = value.split('');
    while (next.length < length) next.push('');
    next[index] = digit;
    onChange(next.join('').replace(/\s+$/, ''));

    if (digit && index < length - 1) {
      inputs.current[index + 1]?.focus();
    }
  };

  const handleKeyPress = (e: { nativeEvent: { key: string } }, index: number) => {
    if (e.nativeEvent.key === 'Backspace') {
      if (digits[index]?.trim()) {
        const next = value.split('');
        next[index] = '';
        onChange(next.join('').replace(/\s+$/, ''));
      } else if (index > 0) {
        inputs.current[index - 1]?.focus();
        const next = value.split('');
        next[index - 1] = '';
        onChange(next.join('').replace(/\s+$/, ''));
      }
    }
  };

  return (
    <View style={styles.container}>
      {Array.from({ length }).map((_, index) => (
        <TextInput
          key={index}
          ref={(ref) => {
            inputs.current[index] = ref;
          }}
          style={[styles.input, digits[index]?.trim() ? styles.inputFilled : null]}
          keyboardType="number-pad"
          maxLength={Platform.OS === 'ios' ? 6 : 1}
          value={digits[index]?.trim() ? digits[index] : ''}
          onChangeText={(text) => handleChange(text, index)}
          onKeyPress={(e) => handleKeyPress(e, index)}
          selectTextOnFocus
          textContentType="oneTimeCode"
          autoComplete={Platform.OS === 'android' ? 'sms-otp' : 'one-time-code'}
        />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    width: '100%',
  },
  input: {
    width: 46,
    height: 52,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
    textAlign: 'center',
    fontSize: 22,
    fontWeight: '600',
    color: COLORS.text,
  },
  inputFilled: {
    borderColor: COLORS.borderActive,
  },
});
