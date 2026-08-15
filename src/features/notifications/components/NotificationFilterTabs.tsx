import React, { memo } from 'react';
import { ScrollView, View, Text, StyleSheet, Pressable } from 'react-native';
import Animated, { useAnimatedStyle, withSpring, useSharedValue } from 'react-native-reanimated';
import Icon from 'react-native-vector-icons/Ionicons';
import type { NotificationFilterTab } from '../notificationCategories';

type UITab = {
  label: string;
  backendKey: NotificationFilterTab;
  icon?: string;
};

const UI_TABS: UITab[] = [
  { label: 'All', backendKey: 'All' },
  { label: 'Trips', backendKey: 'Trips', icon: 'briefcase-outline' },
  { label: 'Rewards', backendKey: 'Rewards', icon: 'gift-outline' },
  { label: 'Nearby', backendKey: 'Nearby', icon: 'location-outline' },
  { label: 'System', backendKey: 'System', icon: 'settings-outline' },
];

type Props = {
  active: NotificationFilterTab;
  onChange: (tab: NotificationFilterTab) => void;
};

const COLORS = {
  activeBg: '#111111',
  activeText: '#FFFFFF',
  inactiveBg: '#FFFFFF',
  inactiveText: '#202020',
  inactiveBorder: '#ECE3D7',
};

function TabPill({ tab, active, onPress }: { tab: UITab; active: boolean; onPress: () => void }) {
  const scale = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => {
        scale.value = withSpring(0.96, { damping: 18, stiffness: 320 });
      }}
      onPressOut={() => {
        scale.value = withSpring(1, { damping: 18, stiffness: 320 });
      }}
    >
      <Animated.View style={[styles.pill, active && styles.pillActive, anim]}>
        {tab.icon && (
          <Icon 
            name={tab.icon} 
            size={16} 
            color={active ? COLORS.activeText : COLORS.inactiveText} 
            style={styles.icon}
          />
        )}
        <Text style={[styles.pillText, active && styles.pillTextActive]}>{tab.label}</Text>
      </Animated.View>
    </Pressable>
  );
}

function NotificationFilterTabsComponent({ active, onChange }: Props) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.container}
      contentContainerStyle={styles.scroll}
    >
      {UI_TABS.map(tab => {
        const isStrictlyActive = active === tab.backendKey;

        return (
          <TabPill 
            key={tab.label} 
            tab={tab} 
            active={isStrictlyActive}
            onPress={() => onChange(tab.backendKey)} 
          />
        );
      })}
    </ScrollView>
  );
}

export const NotificationFilterTabs = memo(NotificationFilterTabsComponent);

const styles = StyleSheet.create({
  container: {
    flexGrow: 0,
    backgroundColor: '#FCF9F4',
  },
  scroll: {
    paddingHorizontal: 16,
    gap: 8,
    paddingBottom: 16,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: COLORS.inactiveBg,
    borderWidth: 1,
    borderColor: COLORS.inactiveBorder,
  },
  pillActive: {
    backgroundColor: COLORS.activeBg,
    borderColor: COLORS.activeBg,
  },
  icon: {
    marginRight: 6,
  },
  pillText: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.inactiveText,
  },
  pillTextActive: {
    color: COLORS.activeText,
    fontWeight: '600',
  },
});
