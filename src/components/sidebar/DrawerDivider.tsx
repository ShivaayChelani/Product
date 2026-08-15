import React from 'react';
import { View, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { SB } from './sidebarTheme';

export const DrawerDivider = () => {
  return (
    <View style={styles.container}>
      <View style={styles.line} />
      <View style={styles.iconContainer}>
        <Icon name="sparkles" size={14} color="#C49B66" />
      </View>
      <View style={styles.line} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 30,
    marginVertical: 16,
  },
  line: {
    flex: 1,
    height: 1,
    backgroundColor: '#E8DDD0',
  },
  iconContainer: {
    paddingHorizontal: 8,
  },
});
