import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { ProfileColors as C, SERIF, SANS, SANS_BOLD } from './profileTheme';

interface ProfileHeaderProps {
  onNotificationPress?: () => void;
  onSettingsPress?: () => void;
  unreadCount?: number;
}

export const ProfileHeader = ({
  onNotificationPress,
  onSettingsPress,
  unreadCount = 0,
}: ProfileHeaderProps) => {
  return (
    <View style={styles.container}>
      <View style={styles.leftCol}>
        <View style={styles.titleContainer}>
          <Text style={styles.title}>Profile</Text>
          <View style={styles.titleUnderline} />
        </View>
        <Text style={styles.subtitle}>Your journeys, rewards & achievements</Text>
      </View>
      <View style={styles.rightCol}>
        <TouchableOpacity style={styles.iconBtn} onPress={onNotificationPress} activeOpacity={0.8}>
          <Icon name="notifications-outline" size={22} color="#1D2420" />
          {unreadCount > 0 ? (
            <View style={styles.badge} />
          ) : null}
        </TouchableOpacity>
        <TouchableOpacity style={styles.iconBtn} onPress={onSettingsPress} activeOpacity={0.8}>
          <Icon name="settings-outline" size={22} color="#1D2420" />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingBottom: 20,
  },
  leftCol: {
    flex: 2,
    marginRight: 10,
  },
  titleContainer: {
    alignSelf: 'flex-start',
    marginBottom: 6,
  },
  title: {
    fontSize: 34,
    fontFamily: SANS_BOLD,
    fontWeight: '800',
    color: '#1D2420',
    letterSpacing: -0.5,
  },
  titleUnderline: {
    position: 'absolute',
    bottom: 2,
    left: 2,
    width: 32,
    height: 3,
    backgroundColor: '#B7791F', // Or whichever brand brown color is appropriate
    borderRadius: 2,
  },
  subtitle: {
    fontSize: 13,
    fontFamily: SANS,
    color: '#68756D',
    lineHeight: 18,
  },
  rightCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingTop: 6,
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#F7F6F1',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#1D2420',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  badge: {
    position: 'absolute',
    top: 10,
    right: 12,
    backgroundColor: '#1F4D3A',
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: '#FFF',
  },
});
