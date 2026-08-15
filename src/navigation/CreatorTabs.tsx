import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View, Platform, Pressable } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Icon from 'react-native-vector-icons/Ionicons';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MIN_TOUCH } from '../design/responsive';
import { CreatorTabParamList } from './types';
import CreatorDashboardScreen from '../screens/CreatorDashboardScreen';
import CreatorReelsScreen from '../screens/CreatorReelsScreen';
import CreatorProfileTabScreen from '../screens/CreatorProfileTabScreen';
import CollaborationsDashboardScreen from '../screens/CollaborationsDashboardScreen';

// Empty component used as a placeholder for the Create tab, which is intercepted by the TabBar.
function ActionScreenPlaceholder() { return null; }

const Tab = createBottomTabNavigator<CreatorTabParamList>();

const ICONS: Record<string, { icon: string; active: string; label: string }> = {
  Dashboard: { icon: 'grid-outline', active: 'grid', label: 'Dashboard' },
  Reels: { icon: 'play-outline', active: 'play', label: 'Reels' },
  Create: { icon: 'add', active: 'add', label: 'Create' },
  Collaboration: { icon: 'hand-right-outline', active: 'hand-right', label: 'Collabs' },
  Profile: { icon: 'person-outline', active: 'person', label: 'Profile' },
};

function CreatorTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  
  return (
    <View style={[styles.tabBarContainer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      <View style={styles.tabBar}>
        {state.routes.map((route, index) => {
          const focused = index === state.index;
          const item = ICONS[route.name as keyof typeof ICONS];
          
          if (route.name === 'Create') {
            return (
              <View key={route.key} style={styles.createButtonWrapper}>
                <Pressable
                  style={({ pressed }) => [styles.createButton, pressed && styles.createButtonPressed]}
                  onPress={() => navigation.navigate('CreateReel' as never)}
                >
                  <Icon name="add" color="#FFFFFF" size={28} />
                </Pressable>
              </View>
            );
          }

          return (
            <TouchableOpacity
              key={route.key}
              style={styles.tabItem}
              onPress={() => navigation.navigate(route.name)}
              accessibilityRole="button"
              accessibilityLabel={item.label}
              accessibilityState={{ selected: focused }}
            >
              <Icon 
                name={focused ? item.active : item.icon} 
                color={focused ? '#D9A441' : '#A3A3A3'} 
                size={22} 
              />
              <Text style={[styles.tabLabel, focused && styles.tabLabelActive]} numberOfLines={1}>
                {item.label}
              </Text>
              {focused && <View style={styles.activeDot} />}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

export default function CreatorTabs() {
  return (
    <Tab.Navigator 
      tabBar={(props) => <CreatorTabBar {...props} />} 
      screenOptions={{ headerShown: false }}
    >
      <Tab.Screen name="Dashboard" component={CreatorDashboardScreen} />
      <Tab.Screen name="Reels" component={CreatorReelsScreen} />
      <Tab.Screen name="Create" component={ActionScreenPlaceholder} />
      <Tab.Screen
        name="Collaboration"
        component={CollaborationsDashboardScreen}
        initialParams={{ embeddedInTab: true, role: 'creator' }}
      />
      <Tab.Screen name="Profile" component={CreatorProfileTabScreen} />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBarContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'transparent',
  },
  tabBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1E1B18', // Matches Traveller Workspace dark charcoal/brown
    marginHorizontal: 16,
    borderRadius: 32,
    height: 64,
    paddingHorizontal: 8,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 10,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    minHeight: MIN_TOUCH,
  },
  tabLabel: {
    fontSize: 10,
    marginTop: 4,
    color: '#A3A3A3',
    fontWeight: '600',
  },
  tabLabelActive: {
    color: '#D9A441', // Muted gold accent
  },
  activeDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D9A441',
    position: 'absolute',
    bottom: 6,
  },
  createButtonWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10, // Ensure it sits above the bar
  },
  createButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#D9A441',
    alignItems: 'center',
    justifyContent: 'center',
    top: -16, // Float above the bar
    shadowColor: '#D9A441',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  createButtonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.96 }],
  },
});
