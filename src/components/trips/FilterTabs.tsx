import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { TripsColors as C, SANS, SANS_BOLD } from './tripsTheme';

export type TabOption = 'UPCOMING' | 'DRAFT' | 'COMPLETED';

interface FilterTabsProps {
  activeTab: TabOption;
  onTabChange: (tab: TabOption) => void;
}

export const FilterTabs = ({ activeTab, onTabChange }: FilterTabsProps) => {
  return (
    <View style={styles.container}>
      <View style={styles.unifiedPill}>
        <TabButton
          label="Upcoming"
          icon="calendar-outline"
          isActive={activeTab === 'UPCOMING'}
          onPress={() => onTabChange('UPCOMING')}
        />
        <View style={styles.divider} />
        <TabButton
          label="Drafts"
          icon="create-outline"
          isActive={activeTab === 'DRAFT'}
          onPress={() => onTabChange('DRAFT')}
        />
        <View style={styles.divider} />
        <TabButton
          label="Completed"
          icon="checkmark-circle-outline"
          isActive={activeTab === 'COMPLETED'}
          onPress={() => onTabChange('COMPLETED')}
        />
      </View>
    </View>
  );
};

interface TabButtonProps {
  label: string;
  icon: string;
  isActive: boolean;
  onPress: () => void;
}

const TabButton = ({ label, icon, isActive, onPress }: TabButtonProps) => {
  return (
    <TouchableOpacity
      style={[styles.tabBtn, isActive && styles.activeTabBtn]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <Icon 
        name={icon} 
        size={16} 
        color={isActive ? '#FFFFFF' : '#64748B'} 
        style={styles.icon}
      />
      <Text style={[styles.tabText, isActive ? styles.activeTabText : styles.inactiveTabText]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    marginBottom: 20,
    marginTop: -14,
    zIndex: 10,
  },
  unifiedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 30,
    padding: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 6,
  },
  divider: {
    width: 1,
    height: 24,
    backgroundColor: '#E2E8F0',
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 24,
    gap: 6,
  },
  activeTabBtn: {
    backgroundColor: '#0B2545',
  },
  icon: {
    marginTop: -1,
  },
  tabText: {
    fontSize: 13,
    fontFamily: SANS,
    fontWeight: '600',
  },
  activeTabText: {
    color: '#FFFFFF',
    fontFamily: SANS_BOLD,
  },
  inactiveTabText: {
    color: '#334155',
  },
});
