import React, { memo } from 'react';
import { View, StyleSheet } from 'react-native';
import { NotificationTheme as T } from '../theme';

function NotificationListSkeletonComponent() {
  return (
    <View style={styles.wrap}>
      {[0, 1, 2, 3].map(i => (
        <View key={i} style={styles.row}>
          <View style={styles.circle} />
          <View style={styles.lines}>
            <View style={[styles.line, { width: '70%' }]} />
            <View style={[styles.line, { width: '92%' }]} />
            <View style={[styles.line, { width: '40%' }]} />
          </View>
          <View style={styles.thumb} />
        </View>
      ))}
    </View>
  );
}

export const NotificationListSkeleton = memo(NotificationListSkeletonComponent);

const styles = StyleSheet.create({
  wrap: { paddingTop: 8, gap: 10 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 16,
    backgroundColor: T.card,
    borderRadius: T.radius,
    padding: 14,
    borderWidth: 1,
    borderColor: T.border,
  },
  circle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#EDE4D8',
  },
  lines: { flex: 1, gap: 8 },
  line: {
    height: 10,
    borderRadius: 5,
    backgroundColor: '#EDE4D8',
  },
  thumb: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: '#EDE4D8',
  },
});
