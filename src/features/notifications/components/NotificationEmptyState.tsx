import React, { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { NotificationTheme as T, SERIF_REG, SANS, SANS_SEMI } from '../theme';
import { PressableScale } from '../../../components/home/PressableScale';

type Props = {
  onExplore: () => void;
};

function NotificationEmptyStateComponent({ onExplore }: Props) {
  return (
    <View style={styles.wrap}>
      <View style={styles.illustration}>
        <Icon name="airplane-outline" size={56} color={T.secondary} />
      </View>
      <Text style={styles.title}>No notifications yet</Text>
      <Text style={styles.subtitle}>Your latest trips, rewards and updates will appear here.</Text>
      <PressableScale onPress={onExplore}>
        <View style={styles.btn}>
          <Text style={styles.btnText}>Explore Nearby</Text>
        </View>
      </PressableScale>
    </View>
  );
}

export const NotificationEmptyState = memo(NotificationEmptyStateComponent);

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 32,
    paddingTop: 48,
    alignItems: 'center',
    gap: 12,
  },
  illustration: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#F3EBE0',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  title: {
    fontFamily: SERIF_REG,
    fontSize: 22,
    color: T.primary,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: SANS,
    fontSize: 14,
    color: T.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  btn: {
    marginTop: 12,
    backgroundColor: T.primary,
    borderRadius: T.radius,
    paddingHorizontal: 24,
    paddingVertical: 14,
  },
  btnText: {
    fontFamily: SANS_SEMI,
    fontSize: 15,
    color: '#FFF',
  },
});
