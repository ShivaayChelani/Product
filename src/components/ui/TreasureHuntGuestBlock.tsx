import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { TH, SANS, SANS_BOLD, SANS_SEMI } from '../../features/treasureHunt/theme';

export function TreasureHuntGuestBlock() {
  return (
    <View style={styles.container}>
      <Icon name="lock-closed-outline" size={64} color="#B9834B" />
      <Text style={styles.title}>Authentication Required</Text>
      <Text style={styles.msg}>Please sign in or create an account to play Treasure Hunt and earn rewards.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1E1B18',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  title: {
    fontFamily: SANS_BOLD,
    color: 'white',
    fontSize: 22,
    marginTop: 24,
    marginBottom: 12,
  },
  msg: {
    fontFamily: SANS,
    color: '#AAA',
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
  }
});
