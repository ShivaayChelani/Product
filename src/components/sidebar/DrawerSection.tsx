import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SB, SANS_BOLD } from './sidebarTheme';

interface DrawerSectionProps {
  title: string;
  children: React.ReactNode;
}

export const DrawerSection: React.FC<DrawerSectionProps> = ({ title, children }) => {
  return (
    <View style={styles.container}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>{title}</Text>
        <View style={styles.line} />
      </View>
      <View style={styles.items}>{children}</View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 8,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  title: {
    fontFamily: SANS_BOLD,
    fontSize: 11,
    color: '#63300E',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  line: {
    flex: 1,
    height: 1,
    backgroundColor: '#E8DDD0',
  },
  items: {
    paddingTop: 2,
  },
});
