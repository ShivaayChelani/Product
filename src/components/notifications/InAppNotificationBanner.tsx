import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';

export type BannerAction = {
  label: string;
  onPress: () => void;
};

export type InAppBannerPayload = {
  id: string;
  title: string;
  body?: string;
  actions?: BannerAction[];
  onPress?: () => void;
  onDismiss?: () => void;
};

type Props = InAppBannerPayload & {
  visible: boolean;
  onDismiss: () => void;
};

export default function InAppNotificationBanner({
  visible,
  title,
  body,
  actions,
  onPress,
  onDismiss,
}: Props) {
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(-120)).current;
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  useEffect(() => {
    Animated.spring(translateY, {
      toValue: visible ? 0 : -140,
      useNativeDriver: true,
      friction: 9,
      tension: 80,
    }).start();
  }, [visible, translateY]);

  if (!visible) return null;

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[styles.wrap, { paddingTop: insets.top + 6, transform: [{ translateY }] }]}
    >
      <Pressable
        onPress={onPress}
        style={[
          styles.card,
          {
            backgroundColor: isDark ? '#1E2A3A' : '#FFFBF6',
            borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(185,131,75,0.25)',
          },
        ]}
      >
        <View style={styles.row}>
          <View style={styles.iconWrap}>
            <Icon name="notifications" size={18} color="#B9834B" />
          </View>
          <View style={styles.textCol}>
            <Text style={[styles.title, { color: isDark ? '#fff' : '#2C1810' }]} numberOfLines={1}>
              {title}
            </Text>
            {body ? (
              <Text style={[styles.body, { color: isDark ? '#C5D0E0' : '#6B5A48' }]} numberOfLines={2}>
                {body}
              </Text>
            ) : null}
          </View>
          <Pressable
            onPress={onDismiss}
            hitSlop={12}
            accessibilityLabel="Dismiss notification"
            style={styles.dismiss}
          >
            <Icon name="close" size={18} color={isDark ? '#9AA8BC' : '#8B7355'} />
          </Pressable>
        </View>
        {actions && actions.length > 0 ? (
          <View style={styles.actions}>
            {actions.map((a) => (
              <Pressable key={a.label} onPress={a.onPress} style={styles.actionBtn}>
                <Text style={styles.actionText}>{a.label}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10000,
    paddingHorizontal: 12,
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(185,131,75,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  textCol: { flex: 1, minWidth: 0 },
  title: { fontSize: 14, fontWeight: '700' },
  body: { marginTop: 2, fontSize: 12, lineHeight: 16 },
  dismiss: { padding: 4 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 10, paddingLeft: 42 },
  actionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(185,131,75,0.15)',
  },
  actionText: { fontSize: 12, fontWeight: '700', color: '#B9834B' },
});
