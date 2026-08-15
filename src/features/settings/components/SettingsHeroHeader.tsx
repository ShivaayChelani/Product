import React, { memo } from 'react';
import { View, Text, StyleSheet, ImageBackground, TouchableOpacity, Platform } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Ionicons';
import { SettingsTheme as T, SettingsFonts, SETTINGS_HERO } from '../theme';

type Props = {
  title: string;
  subtitle?: string;
  onBack: () => void;
  topInset: number;
  compact?: boolean;
  heroImage?: number;
};

function SettingsHeroHeaderComponent({
  title,
  subtitle,
  onBack,
  topInset,
  compact,
  heroImage = SETTINGS_HERO,
}: Props) {
  const heroHeight = compact ? 200 : 248;
  return (
    <View style={[styles.wrap, { height: heroHeight }]}>
      <ImageBackground source={heroImage} style={StyleSheet.absoluteFill} resizeMode="cover">
        <LinearGradient
          colors={['rgba(248,244,236,0.35)', 'rgba(248,244,236,0.88)', T.bg]}
          locations={[0, 0.45, 1]}
          style={StyleSheet.absoluteFill}
        />
      </ImageBackground>
      <View style={[styles.bar, { paddingTop: topInset + 8 }]}>
        <TouchableOpacity
          onPress={onBack}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Icon name="arrow-back" size={20} color={T.primary} />
        </TouchableOpacity>
      </View>
      <View style={styles.titleBlock}>
        <View style={styles.titleScrim}>
          <Text style={SettingsFonts.heroTitle}>{title}</Text>
          {subtitle ? <Text style={SettingsFonts.heroSubtitle}>{subtitle}</Text> : null}
        </View>
      </View>
    </View>
  );
}

export const SettingsHeroHeader = memo(SettingsHeroHeaderComponent);

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    overflow: 'hidden',
    backgroundColor: T.bg,
  },
  bar: {
    paddingHorizontal: 20,
    zIndex: 2,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: T.card,
    alignItems: 'center',
    justifyContent: 'center',
    ...T.cardShadow,
  },
  titleBlock: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 4,
    flex: 1,
    justifyContent: 'flex-end',
  },
  titleScrim: {
    backgroundColor: 'rgba(248,244,236,0.92)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(236,227,216,0.9)',
  },
});
