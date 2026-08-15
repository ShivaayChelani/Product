import React from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { RideOptionsTheme as T } from '../theme';

type Props = { message?: string };

export function RideLoading({ message = 'Loading providers…' }: Props) {
  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={T.primary} />
      <Text style={styles.msg}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 28 },
  msg: { marginTop: 12, fontSize: 15, textAlign: 'center', color: T.textSecondary, lineHeight: 22 },
});
