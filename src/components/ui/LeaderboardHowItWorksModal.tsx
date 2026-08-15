import React, { useEffect, useRef } from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';

type Props = {
  visible: boolean;
  onClose: () => void;
};

export const LeaderboardHowItWorksModal = ({ visible, onClose }: Props) => {
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
    <Modal visible={visible} transparent={true} animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Animated.View style={[styles.dialog, { transform: [{ scale }] }]}>
          
          <View style={styles.contentRow}>
            <View style={styles.iconWrapper}>
              <View style={styles.iconInner}>
                <Icon name="trophy-outline" size={42} color="#7B4E2E" />
              </View>
            </View>

            <View style={styles.textColumn}>
              <Text style={styles.title}>How Leaderboard Works</Text>
              <View style={styles.titleDivider} />
              <Text style={styles.description}>
                Earn PalPoints by exploring places, checking in, sharing reels, and submitting hidden gems. Climb the ranks to unlock premium reward campaigns created by PalSafar admins.
              </Text>
            </View>
          </View>

          <View style={styles.divider} />

          <TouchableOpacity style={styles.button} onPress={onClose} activeOpacity={0.8}>
            <Text style={styles.buttonText}>Got It</Text>
            <Icon name="arrow-forward-outline" size={18} color="#FFFFFF" />
          </TouchableOpacity>

        </Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(20, 16, 12, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  dialog: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingTop: 32,
    paddingBottom: 20,
    paddingHorizontal: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 10,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  iconWrapper: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 1.5,
    borderColor: '#FAF0E3',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 20,
  },
  iconInner: {
    width: 82,
    height: 82,
    borderRadius: 41,
    backgroundColor: '#FCF6EE',
    justifyContent: 'center',
    alignItems: 'center',
  },
  textColumn: {
    flex: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#32251D',
    marginBottom: 8,
    letterSpacing: -0.2,
  },
  titleDivider: {
    width: 32,
    height: 2,
    backgroundColor: '#DEAC7B',
    marginBottom: 12,
  },
  description: {
    fontSize: 14,
    color: '#655A52',
    lineHeight: 22,
  },
  divider: {
    width: '100%',
    height: 1,
    backgroundColor: '#F0EBE6',
    marginTop: 24,
    marginBottom: 16,
  },
  button: {
    alignSelf: 'flex-end',
    backgroundColor: '#8C5734',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
    marginRight: 6,
  },
});
