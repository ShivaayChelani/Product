import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { SERIF } from './sidebarTheme';

export const DrawerFooter = () => {
  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <View style={styles.iconLeft}>
          <Icon name="location" size={24} color="#C49B66" />
        </View>
        <View style={styles.textWrap}>
          <Text style={styles.textLine}>Explore more.</Text>
          <Text style={styles.textLine}>Collect more. Travel more.</Text>
        </View>
        <View style={styles.iconRight}>
          <View style={styles.dashLine} />
          <Icon name="airplane" size={20} color="#3D2B1F" style={styles.planeIcon} />
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 20,
    marginTop: 'auto',
  },
  card: {
    backgroundColor: '#F7EFE5',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  iconLeft: {
    marginBottom: -4,
  },
  textWrap: {
    flex: 1,
    paddingHorizontal: 12,
  },
  textLine: {
    fontFamily: SERIF,
    fontSize: 13,
    color: '#5C432F',
    fontStyle: 'italic',
  },
  iconRight: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  dashLine: {
    width: 24,
    borderBottomWidth: 1.5,
    borderBottomColor: '#C49B66',
    borderStyle: 'dashed',
    marginRight: 4,
    transform: [{ rotate: '-20deg' }],
  },
  planeIcon: {
    transform: [{ rotate: '-45deg' }],
  },
});
