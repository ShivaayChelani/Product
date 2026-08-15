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
        <View style={styles.titleBar} />
        <Text style={styles.title}>{title}</Text>
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
    gap: 8,
    paddingHorizontal: 20,
    marginBottom: 6,
  },
  titleBar: {
    width: 3,
    height: 14,
    borderRadius: 2,
    backgroundColor: SB.accentSoft,
  },
  title: {
    fontFamily: SANS_BOLD,
    fontSize: 11,
    color: SB.sectionLabel,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  items: {
    paddingTop: 2,
  },
});
