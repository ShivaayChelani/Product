import React, { useEffect, useRef } from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';

export type LogoutModalProps = {
  visible: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export const LogoutModal = ({ visible, onConfirm, onCancel }: LogoutModalProps) => {
  const scale = useRef(new Animated.Value(0.96)).current;

  useEffect(() => {
    if (visible) {
      scale.setValue(0.96);
      Animated.spring(scale, {
        toValue: 1,
        useNativeDriver: true,
        bounciness: 4,
        speed: 20,
      }).start();
    }
  }, [visible, scale]);

  return (
    <Modal visible={visible} transparent={true} animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <Animated.View style={[styles.dialog, { transform: [{ scale }] }]}>
          <View style={styles.iconContainer}>
            <Icon name="log-out-outline" size={32} color="#63300E" style={styles.iconNudge} />
          </View>
          <Text style={styles.title}>Logout</Text>
          <Text style={styles.description}>Are you sure you want to sign out?</Text>

          <View style={styles.buttonContainer}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onCancel} activeOpacity={0.8}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.logoutBtn} onPress={onConfirm} activeOpacity={0.8}>
              <Text style={styles.logoutText}>Logout</Text>
              <Icon name="log-out-outline" size={18} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(20, 16, 12, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  dialog: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingTop: 32,
    paddingBottom: 24,
    paddingHorizontal: 24,
    alignItems: 'center',
    shadowColor: '#2D241D',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 8,
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FDF7F2',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  iconNudge: {
    marginLeft: 4,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#2D241D',
    marginBottom: 8,
  },
  description: {
    fontSize: 15,
    color: '#5C534C',
    textAlign: 'center',
    marginBottom: 28,
    lineHeight: 22,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  cancelBtn: {
    flex: 1,
    height: 52,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#ECE3D8',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#63300E',
  },
  logoutBtn: {
    flex: 1,
    height: 52,
    borderRadius: 16,
    backgroundColor: '#63300E',
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  logoutText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
