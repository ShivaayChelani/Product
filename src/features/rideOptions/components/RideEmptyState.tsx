import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { RideOptionsTheme as T } from '../theme';

type Props = { message?: string };

export function RideEmptyState({ message = 'No ride providers available for your location.' }: Props) {
  return (
    <View style={styles.wrap}>
      <Icon name="car-outline" size={36} color={T.textSecondary} />
      <Text style={styles.msg}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingVertical: 32, paddingHorizontal: 24 },
  msg: { fontSize: 14, color: T.textSecondary, textAlign: 'center', marginTop: 12, lineHeight: 20 },
});
