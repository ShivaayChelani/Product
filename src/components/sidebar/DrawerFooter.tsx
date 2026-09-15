import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { SERIF } from './sidebarTheme';

import { ImageBackground } from 'react-native';

export const DrawerFooter = () => {
  return (
    <View style={styles.container}>
      <ImageBackground 
        source={require('../../assets/traveler_banner.jpg')} 
        style={styles.card}
        imageStyle={styles.cardBg}
      >
        <View style={styles.textWrap}>
          <Text style={styles.textLine}>Explore more.</Text>
          <Text style={styles.textLine}>Collect more.</Text>
          <Text style={styles.textLine}>Travel more.</Text>
          <Text style={styles.subText}>WITH PALSAFAR</Text>
        </View>
      </ImageBackground>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingVertical: 24,
    marginTop: 'auto',
  },
  card: {
    width: '100%',
    height: 120,
    borderRadius: 16,
    overflow: 'hidden',
    justifyContent: 'center',
    padding: 16,
  },
  cardBg: {
    borderRadius: 16,
  },
  textWrap: {
    justifyContent: 'center',
  },
  textLine: {
    fontFamily: SERIF,
    fontSize: 16,
    fontWeight: 'bold',
    color: '#63300E',
    lineHeight: 20,
  },
  subText: {
    fontSize: 9,
    color: '#63300E',
    fontWeight: 'bold',
    marginTop: 8,
    letterSpacing: 2,
  },
});
