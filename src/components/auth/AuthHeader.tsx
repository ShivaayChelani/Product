import React from 'react';
import { View, Text, StyleSheet, Image, Platform } from 'react-native';

const LOGO = require('../../assets/logo.png');

const COLORS = {
  title: '#202020',
  subtitle: '#6F6F6F',
  gold: '#D9A441',
  border: '#ECE3D7',
};

interface AuthHeaderProps {
  title: string;
  subtitle?: string;
  showLogo?: boolean;
  showBrandName?: boolean;
}

export const AuthHeader: React.FC<AuthHeaderProps> = ({
  title,
  subtitle,
  showLogo = true,
  showBrandName = false,
}) => {
  return (
    <View style={styles.container}>
      {showLogo && (
        <View style={styles.brandWrap}>
          <Image source={LOGO} style={styles.logo} resizeMode="contain" />
          {showBrandName && (
            <View style={styles.brandNameRow}>
              <View style={styles.brandLine} />
              <Text style={styles.brandName}>PAL SAFAR</Text>
              <View style={styles.brandLine} />
            </View>
          )}
        </View>
      )}
      <Text style={styles.title}>{title}</Text>
      {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  brandWrap: {
    alignItems: 'center',
    marginBottom: 4,
  },
  logo: {
    width: 140,
    height: 140,
    marginBottom: 0,
  },
  brandNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 12,
  },
  brandLine: {
    width: 48,
    height: 1,
    backgroundColor: COLORS.border,
  },
  brandName: {
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 3,
    color: COLORS.title,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.title,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.subtitle,
    textAlign: 'center',
  },
});
