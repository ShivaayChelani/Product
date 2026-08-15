import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, Dimensions } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Icon from 'react-native-vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../../navigation/types';

export type BottomNavTab = 'home' | 'reels' | 'map' | 'trips' | 'profile';

interface BottomNavigationProps {
  activeTab?: BottomNavTab;
}

const { width } = Dimensions.get('window');
const IS_SMALL = width < 380;

export const BOTTOM_NAV_HEIGHT = 70;
export const BOTTOM_NAV_BOTTOM_GAP = 16;
export const BOTTOM_NAV_CLEARANCE = BOTTOM_NAV_HEIGHT + BOTTOM_NAV_BOTTOM_GAP + 20;

export const BottomNavigation: React.FC<BottomNavigationProps> = ({ activeTab }) => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  
  // Dynamic bottom spacing taking safe area into account
  const bottomPosition = Math.max(insets.bottom, BOTTOM_NAV_BOTTOM_GAP);

  const handlePress = (tab: BottomNavTab) => {
    if (tab === activeTab) return; // Do nothing if already active

    switch (tab) {
      case 'home':
        navigation.navigate('MainTabs', { screen: 'Home' });
        break;
      case 'reels':
        navigation.navigate('MainTabs', { screen: 'Explore' });
        break;
      case 'map':
        navigation.navigate('MainTabs', { screen: 'Map' });
        break;
      case 'trips':
        navigation.navigate('MainTabs', { screen: 'Itinerary' });
        break;
      case 'profile':
        navigation.navigate('MainTabs', { screen: 'Profile' });
        break;
    }
  };

  const renderTab = (tab: BottomNavTab, label: string, activeIcon: string, inactiveIcon: string) => {
    const isActive = activeTab === tab;
    const color = isActive ? '#D4A373' : '#EAE0D5';
    const iconName = isActive ? activeIcon : inactiveIcon;
    const iconSize = IS_SMALL ? 22 : 24;

    return (
      <TouchableOpacity 
        key={tab}
        style={styles.tabItem} 
        onPress={() => handlePress(tab)}
        activeOpacity={0.7}
      >
        <Icon name={iconName} size={iconSize} color={color} style={{ opacity: isActive ? 1 : 0.8 }} />
        <Text style={[styles.tabLabel, { color, opacity: isActive ? 1 : 0.8 }, isActive && styles.activeTabLabel]}>
          {label}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { bottom: bottomPosition }]} pointerEvents="box-none">
      <View style={styles.pillContainer}>
        {renderTab('home', 'Home', 'home', 'home-outline')}
        {renderTab('reels', 'Reels', 'film', 'film-outline')}
        
        {/* Center Map Button */}
        <View style={styles.mapButtonWrapper} pointerEvents="box-none">
          <TouchableOpacity 
            style={styles.mapButton}
            onPress={() => handlePress('map')}
            activeOpacity={0.9}
          >
            <View style={styles.mapInner}>
              <Icon name="map" size={30} color="#2A2623" />
            </View>
          </TouchableOpacity>
          <Text style={[styles.tabLabel, { color: activeTab === 'map' ? '#D4A373' : '#EAE0D5', marginTop: 44 }, activeTab === 'map' && styles.activeTabLabel]}>
            Map
          </Text>
        </View>

        {renderTab('trips', 'Trips', 'briefcase', 'briefcase-outline')}
        {renderTab('profile', 'Profile', 'person', 'person-outline')}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
  },
  pillContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#2A2623',
    height: BOTTOM_NAV_HEIGHT,
    borderRadius: 35,
    paddingHorizontal: IS_SMALL ? 12 : 20,
    width: '92%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 10,
  },
  tabItem: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    height: '100%',
  },
  tabLabel: {
    fontSize: IS_SMALL ? 10 : 11,
    marginTop: 4,
    fontWeight: '500',
  },
  activeTabLabel: {
    fontWeight: '700',
  },
  mapButtonWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1.2,
    height: '100%',
  },
  mapButton: {
    position: 'absolute',
    top: -24,
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#D4A373', // border color
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  mapInner: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: '#F8F3ED',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
