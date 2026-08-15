import React, { useCallback } from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Icon from 'react-native-vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { VendorTabParamList, RootStackParamList } from './types';
import { useUserContext } from '../context/UserContext';
import { UserProfile } from '../types';
import { useDataContext } from '../context/DataContext';
import { useLazyScreen } from '../utils/useLazyScreen';
import {
  VENDOR_TAB_BAR_BOTTOM_GAP,
  VENDOR_TAB_BAR_HEIGHT,
} from '../design/vendorLayout';
import { MIN_TOUCH } from '../design/responsive';

const Tab = createBottomTabNavigator<VendorTabParamList>();
type RootNav = NativeStackNavigationProp<RootStackParamList>;
type VendorTabName = keyof VendorTabParamList;

const TAB_ICONS: Record<VendorTabName, { active: string; inactive: string; label: string }> = {
  Home: { active: 'home', inactive: 'home-outline', label: 'Home' },
  Offers: { active: 'pricetag', inactive: 'pricetag-outline', label: 'Offers' },
  Promotions: { active: 'videocam', inactive: 'videocam-outline', label: 'Promotions' },
  Statistics: { active: 'stats-chart', inactive: 'stats-chart-outline', label: 'Statistics' },
  Business: { active: 'storefront', inactive: 'storefront-outline', label: 'Business' },
};

function useVendorIds() {
  const { user, onLogout } = useUserContext();
  const { currentVendor, logoutVendor } = useDataContext();
  const vendorId = (user as UserProfile & { vendor?: { id: string } })?.vendor?.id || currentVendor?.id || '';
  const vendorName = (user as UserProfile & { vendor?: { businessName: string } })?.vendor?.businessName || currentVendor?.businessName || 'My Business';
  const handleLogout = useCallback(async () => {
    logoutVendor();
    await onLogout();
  }, [logoutVendor, onLogout]);
  return { vendorId, vendorName, currentVendor, handleLogout, user };
}

function VendorHomeTab() {
  const navigation = useNavigation<RootNav>();
  const { vendorId, vendorName, currentVendor, handleLogout } = useVendorIds();
  const Screen = useLazyScreen(() => require('../screens/VendorDashboardScreen'));

  return (
    <Screen
      forcedTab="Home"
      hideBottomNav
      onBack={() => {}}
      canGoBack={false}
      onLogout={handleLogout}
      onCreateOffer={() => navigation.navigate('CreateOffer', {})}
      onEditOffer={(offerId: string) => navigation.navigate('CreateOffer', { offerId })}
      onViewMyOffers={() => navigation.navigate('VendorTabs', { screen: 'Offers' })}
      onViewAnalytics={() => navigation.navigate('VendorTabs', { screen: 'Statistics' })}
      onViewProfile={() =>
        navigation.navigate('VendorTabs', { screen: 'Business' })
      }
    />
  );
}

function VendorOffersTab() {
  const navigation = useNavigation<RootNav>();
  const { handleLogout } = useVendorIds();
  const Screen = useLazyScreen(() => require('../screens/VendorDashboardScreen'));

  return (
    <Screen
      forcedTab="Offers"
      hideBottomNav
      onBack={() => {}}
      canGoBack={false}
      onLogout={handleLogout}
      onCreateOffer={() => navigation.navigate('CreateOffer', {})}
      onEditOffer={(offerId: string) => navigation.navigate('CreateOffer', { offerId })}
      onViewMyOffers={() => {}}
      onViewAnalytics={() => navigation.navigate('VendorTabs', { screen: 'Statistics' })}
      onViewProfile={() => navigation.navigate('VendorTabs', { screen: 'Business' })}
    />
  );
}

function VendorPromotionsTab() {
  const navigation = useNavigation<RootNav>();
  const Screen = useLazyScreen(() => require('../screens/VendorReelsManagementScreen'));
  return (
    <Screen
      onBack={() => navigation.navigate('VendorTabs', { screen: 'Home' })}
      onCreateReel={() => navigation.navigate('CreateVendorReel')}
    />
  );
}

function VendorStatisticsTab() {
  const navigation = useNavigation<RootNav>();
  const { vendorId, vendorName } = useVendorIds();
  const Screen = useLazyScreen(() => require('../screens/VendorAnalyticsScreen'));
  return (
    <Screen
      vendorId={vendorId}
      vendorName={vendorName}
      onBack={() => navigation.navigate('VendorTabs', { screen: 'Home' })}
    />
  );
}

function VendorBusinessTab() {
  const Screen = useLazyScreen(() => require('../screens/VendorStudioProfileScreen'));
  return <Screen />;
}

function VendorTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const bottomPosition = Math.max(insets.bottom, 16);

  return (
    <View style={[styles.tabBarContainer, { bottom: bottomPosition }]} pointerEvents="box-none">
      <View style={styles.pillContainer}>
        {state.routes.map((route, index) => {
          const isFocused = state.index === index;
          const name = route.name as VendorTabName;
          const config = TAB_ICONS[name] || { active: 'ellipse', inactive: 'ellipse-outline', label: name };

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          if (route.name === 'Promotions') {
            return (
              <View key={route.key} style={styles.centerButtonWrapper} pointerEvents="box-none">
                <TouchableOpacity
                  style={styles.centerButton}
                  onPress={onPress}
                  activeOpacity={0.9}
                >
                  <View style={styles.centerInner}>
                    <Icon name={isFocused ? 'videocam' : 'videocam-outline'} size={30} color="#2A2623" />
                  </View>
                </TouchableOpacity>
                <Text style={[styles.tabLabel, { color: isFocused ? '#D4A373' : '#EAE0D5', marginTop: 44 }, isFocused && styles.activeTabLabel]}>
                  {config.label}
                </Text>
              </View>
            );
          }

          return (
            <TouchableOpacity key={route.key} style={styles.tabItem} onPress={onPress} activeOpacity={0.7}>
              <Icon
                name={isFocused ? config.active : config.inactive}
                size={24}
                color={isFocused ? '#D4A373' : '#EAE0D5'}
                style={{ opacity: isFocused ? 1 : 0.8 }}
              />
              <Text style={[styles.tabLabel, { color: isFocused ? '#D4A373' : '#EAE0D5', opacity: isFocused ? 1 : 0.8 }, isFocused && styles.activeTabLabel]} numberOfLines={1}>
                {config.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

export default function VendorTabs() {
  return (
    <Tab.Navigator
      tabBar={(props) => <VendorTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tab.Screen name="Home" component={VendorHomeTab} />
      <Tab.Screen name="Offers" component={VendorOffersTab} />
      <Tab.Screen name="Promotions" component={VendorPromotionsTab} />
      <Tab.Screen name="Statistics" component={VendorStatisticsTab} />
      <Tab.Screen name="Business" component={VendorBusinessTab} />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBarContainer: {
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
    height: 70,
    borderRadius: 35,
    paddingHorizontal: 16,
    width: '92%',
    maxWidth: 420,
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
    fontSize: 11,
    marginTop: 4,
    fontWeight: '500',
  },
  activeTabLabel: {
    fontWeight: '700',
  },
  centerButtonWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1.2,
    height: '100%',
  },
  centerButton: {
    position: 'absolute',
    top: -24,
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#D4A373',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  centerInner: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: '#F8F3ED',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
