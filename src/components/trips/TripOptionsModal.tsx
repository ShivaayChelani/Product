import React, { useEffect, useRef } from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { TripPlan } from '../../services/api/trips';

export type TripOptionsModalProps = {
  visible: boolean;
  trip: TripPlan | null;
  onShare: (trip: TripPlan) => void;
  onDelete: (trip: TripPlan) => void;
  onCancel: () => void;
};

export const TripOptionsModal = ({ visible, trip, onShare, onDelete, onCancel }: TripOptionsModalProps) => {
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
            <Icon name="briefcase-outline" size={26} color="#63300E" style={styles.suitcase} />
            <Icon name="leaf-outline" size={14} color="#63300E" style={styles.subIcon} />
            {/* Sparkles */}
            <View style={styles.sparkleTopLeft}>
              <Icon name="sparkles" size={10} color="#E0A774" />
            </View>
            <View style={styles.sparkleBottomRight}>
              <Icon name="sparkles" size={8} color="#E0A774" />
            </View>
          </View>

          <Text style={styles.title} numberOfLines={1}>{trip.title || 'Trip'}</Text>
          <Text style={styles.description}>What would you like to do with this trip?</Text>

          {/* Divider with Star */}
          <View style={styles.dividerContainer}>
            <View style={styles.dividerLine} />
            <Icon name="star" size={12} color="#C49B74" style={styles.dividerStar} />
            <View style={styles.dividerLine} />
          </View>

          {/* Action Buttons */}
          <View style={styles.buttonContainer}>
            <TouchableOpacity 
              style={[styles.actionBtn, { backgroundColor: '#FDF7F2', borderColor: '#FDF7F2' }]} 
              onPress={() => onShare(trip)} 
              activeOpacity={0.8}
            >
              <Icon name="share-social-outline" size={18} color="#63300E" />
              <Text style={[styles.actionText, { color: '#63300E' }]}>Share</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.actionBtn, { backgroundColor: '#FFF5F5', borderColor: '#FFF5F5' }]} 
              onPress={() => onDelete(trip)} 
              activeOpacity={0.8}
            >
              <Icon name="trash-outline" size={18} color="#EF4444" />
              <Text style={[styles.actionText, { color: '#EF4444' }]}>Delete</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.actionBtn, { backgroundColor: '#F8F6F4', borderColor: '#F8F6F4' }]} 
              onPress={onCancel} 
              activeOpacity={0.8}
            >
              <Icon name="close-outline" size={20} color="#2D241D" />
              <Text style={[styles.actionText, { color: '#2D241D' }]}>Cancel</Text>
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
    backgroundColor: '#FDF7F2',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  suitcase: {
    marginLeft: -4,
  },
  subIcon: {
    position: 'absolute',
    right: 16,
    bottom: 20,
  },
  sparkleTopLeft: {
    position: 'absolute',
    top: 14,
    left: 14,
  },
  sparkleBottomRight: {
    position: 'absolute',
    bottom: 14,
    right: 14,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#2D241D',
    marginBottom: 8,
    textAlign: 'center',
  },
  description: {
    fontSize: 15,
    color: '#5C534C',
    textAlign: 'center',
    marginBottom: 24,
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    marginBottom: 24,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#F3EBE3',
  },
  dividerStar: {
    marginHorizontal: 12,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 8,
    width: '100%',
  },
  actionBtn: {
    flex: 1,
    height: 52,
    borderRadius: 14,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  actionText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
