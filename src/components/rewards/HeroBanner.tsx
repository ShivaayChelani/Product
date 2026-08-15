import React from 'react';
import { View, Text, StyleSheet, ImageBackground, TouchableOpacity } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';

const COLORS = {
  text: '#202020',
  white: '#FFFFFF',
  gold: '#D9A441',
};

export const HeroBanner = () => {
  return (
    <View style={styles.container}>
      <ImageBackground
        source={require('../../assets/banner_placeholder.png')} // We'll use a placeholder or generic asset for now
        style={styles.banner}
        imageStyle={styles.bannerImage}
      >
        <View style={styles.overlay}>
          <Text style={styles.title}>Weekend Special Offers</Text>
          <Text style={styles.subtitle}>Save up to 50% on top experiences</Text>
          <TouchableOpacity style={styles.button} activeOpacity={0.8}>
            <Text style={styles.buttonText}>Explore Offers</Text>
            <Icon name="arrow-forward" size={16} color={COLORS.text} style={styles.icon} />
          </TouchableOpacity>
        </View>
      </ImageBackground>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  banner: {
    width: '100%',
    height: 160,
    justifyContent: 'center',
  },
  bannerImage: {
    borderRadius: 24,
    backgroundColor: COLORS.text, // Dark fallback
  },
  overlay: {
    flex: 1,
    borderRadius: 24,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    padding: 20,
    justifyContent: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.white,
    marginBottom: 4,
    fontFamily: 'Georgia', // Serif touch for luxury
  },
  subtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.9)',
    marginBottom: 16,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: COLORS.gold,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  buttonText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
  },
  icon: {
    marginLeft: 4,
  },
});
