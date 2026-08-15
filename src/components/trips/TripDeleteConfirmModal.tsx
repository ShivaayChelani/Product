import React, { useEffect, useRef } from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { TripPlan } from '../../services/api/trips';
import LinearGradient from 'react-native-linear-gradient';

export type TripDeleteConfirmModalProps = {
  visible: boolean;
  trip: TripPlan | null;
  onConfirm: (trip: TripPlan) => void;
  onCancel: () => void;
  loading?: boolean;
};

export const TripDeleteConfirmModal = ({ visible, trip, onConfirm, onCancel, loading }: TripDeleteConfirmModalProps) => {
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

  if (!trip) return null;

  return (
    <Modal visible={visible} transparent={true} animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <Animated.View style={[styles.dialog, { transform: [{ scale }] }]}>
          {/* Top Icon Circle */}
          <View style={styles.iconContainer}>
            <Icon name="trash" size={32} color="#EF4444" />
            
            {/* Sparkles around the icon */}
            <Icon name="sparkles" size={10} color="#EF4444" style={[styles.sparkle, { top: 10, left: 14 }]} />
            <Icon name="sparkles" size={6} color="#EF4444" style={[styles.sparkle, { top: 18, right: 12 }]} />
            <Icon name="sparkles" size={8} color="#EF4444" style={[styles.sparkle, { bottom: 12, left: 20 }]} />
            <Icon name="sparkles" size={12} color="#FCA5A5" style={[styles.sparkle, { bottom: 20, right: -4 }]} />
            <Icon name="ellipse" size={4} color="#FCA5A5" style={[styles.sparkle, { top: -4, left: 30 }]} />
          </View>

          <Text style={styles.title}>Delete Trip</Text>
          <Text style={styles.subtitle}>
            Delete <Text style={styles.highlightText}>"{trip.title || 'Trip'}"</Text>?
          </Text>

          {/* Warning Box */}
          <View style={styles.warningBox}>
            <Icon name="shield-outline" size={20} color="#D86641" style={styles.warningIcon} />
            <View style={styles.warningTextContainer}>
              <Text style={styles.warningTitle}>This action cannot be undone.</Text>
              <Text style={styles.warningDesc}>All trip details, places and plans will be permanently removed.</Text>
            </View>
          </View>

          {/* Action Buttons */}
          <View style={styles.buttonContainer}>
            <TouchableOpacity 
              style={styles.cancelBtn} 
              onPress={onCancel} 
              activeOpacity={0.8}
              disabled={loading}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.8}
              disabled={loading}
              onPress={() => onConfirm(trip)}
              style={styles.deleteBtnWrapper}
            >
              <LinearGradient 
                colors={['#DF5B40', '#D0452C']} 
                start={{ x: 0, y: 0 }} 
                end={{ x: 1, y: 0 }} 
                style={styles.deleteBtn}
              >
                <Icon name="trash-outline" size={18} color="#FFFFFF" />
                <Text style={styles.deleteText}>{loading ? 'Deleting...' : 'Delete Trip'}</Text>
              </LinearGradient>
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
    paddingHorizontal: 20,
  },
  dialog: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingTop: 32,
    paddingBottom: 24,
    paddingHorizontal: 20,
    alignItems: 'center',
    shadowColor: '#2D241D',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 8,
  },
  iconContainer: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#FFF0F0',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  sparkle: {
    position: 'absolute',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1F1510',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 16,
    color: '#1F1510',
    marginBottom: 20,
    fontWeight: '400',
  },
  highlightText: {
    color: '#D86641',
  },
  warningBox: {
    flexDirection: 'row',
    backgroundColor: '#FFF5F5',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    width: '100%',
  },
  warningIcon: {
    marginRight: 12,
    marginTop: 2,
  },
  warningTextContainer: {
    flex: 1,
  },
  warningTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2D241D',
    marginBottom: 4,
  },
  warningDesc: {
    fontSize: 13,
    color: '#5C534C',
    lineHeight: 18,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  cancelBtn: {
    flex: 1,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#C49B74',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#63300E',
  },
  deleteBtnWrapper: {
    flex: 1.2,
  },
  deleteBtn: {
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  deleteText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
