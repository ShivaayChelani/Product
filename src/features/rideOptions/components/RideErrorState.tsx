import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { RideOptionsTheme as T } from '../theme';

type Props = {
  title?: string;
  message: string;
  onRetry?: () => void;
};

export function RideErrorState({ title = 'Something went wrong', message, onRetry }: Props) {
  return (
    <View style={styles.wrap}>
      <Icon name="alert-circle-outline" size={40} color={T.primary} />
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.msg}>{message}</Text>
      {onRetry ? (
        <TouchableOpacity style={styles.btn} onPress={onRetry}>
          <Text style={styles.btnText}>Try again</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 28 },
  title: { fontSize: 17, fontWeight: '800', color: T.text, marginTop: 12 },
  msg: { fontSize: 14, color: T.textSecondary, textAlign: 'center', marginTop: 8, lineHeight: 20 },
  btn: {
    marginTop: 16,
    backgroundColor: T.primary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: T.radiusButton,
  },
  btnText: { color: '#FFF', fontWeight: '700', fontSize: 14 },
});
