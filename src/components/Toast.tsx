import React, { useEffect, useRef } from 'react';
import { Animated, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useHeaderSafePadding } from '../design/responsive';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastData {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
  action?: { label: string; onPress: () => void };
}

interface ToastItemProps {
  toast: ToastData;
  onHide: (id: string) => void;
}

const TOAST_COLORS: Record<ToastType, { bg: string; text: string; icon: string }> = {
  success: { bg: '#1B5E20', text: '#fff', icon: '\u2713' },
  error: { bg: '#B71C1C', text: '#fff', icon: '\u2717' },
  warning: { bg: '#E65100', text: '#fff', icon: '\u26A0' },
  info: { bg: '#0D47A1', text: '#fff', icon: '\u2139' },
};

function ToastItem({ toast, onHide }: ToastItemProps) {
  const topPad = useHeaderSafePadding(12);
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 250, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start();

    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: -20, duration: 200, useNativeDriver: true }),
      ]).start(() => onHide(toast.id));
    }, toast.duration || 3000);

    return () => clearTimeout(timer);
  }, [onHide, opacity, toast.duration, toast.id, translateY]);

  const colors = TOAST_COLORS[toast.type];

  return (
    <Animated.View style={[styles.container, { top: topPad, backgroundColor: colors.bg, opacity, transform: [{ translateY }] }]}>
      <Text style={styles.icon}>{colors.icon}</Text>
      <Text style={[styles.message, { color: colors.text }]} numberOfLines={2}>{toast.message}</Text>
      {toast.action && (
        <TouchableOpacity onPress={toast.action.onPress} style={styles.actionButton}>
          <Text style={[styles.actionText, { color: colors.text }]}>{toast.action.label}</Text>
        </TouchableOpacity>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    zIndex: 9999,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  icon: { fontSize: 18, marginRight: 10 },
  message: { flex: 1, fontSize: 14, fontWeight: '500' },
  actionButton: { marginLeft: 8, paddingLeft: 8, borderLeftWidth: 1, borderLeftColor: 'rgba(255,255,255,0.3)' },
  actionText: { fontSize: 13, fontWeight: '700' },
});

export default ToastItem;
