import React, { memo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ImageBackground,
  Platform,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';

type Props = {
  onPress?: () => void;
};

function TreasureHuntBannerComponent({ onPress }: Props) {
  return (
    <TouchableOpacity
      style={styles.wrap}
      activeOpacity={0.94}
      onPress={onPress}
    >
      <ImageBackground
        source={require('../../assets/treasure_hunt_banner.png')}
        style={styles.banner}
        imageStyle={styles.bannerImage}
        resizeMode="cover"
      >
        <LinearGradient
          colors={['rgba(18, 12, 8, 0.82)', 'rgba(18, 12, 8, 0.45)', 'rgba(18, 12, 8, 0.78)']}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFillObject}
        />

        <View style={styles.content}>
          <View style={styles.leftCopy}>
            <Text style={styles.title}>Treasure Hunt</Text>
            <Text style={styles.subtitle}>Exciting rewards coming your way!</Text>
            <LinearGradient
              colors={['#E5C07A', '#B9834B']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.ctaPill}
            >
              <Text style={styles.ctaText}>Coming Soon</Text>
            </LinearGradient>
          </View>

          <View style={styles.rightCopy}>
            <Text style={styles.rightText}>Stay tuned for thrilling adventures!</Text>
            <View style={styles.dotsRow}>
              <View style={styles.dotActive} />
              <View style={styles.dotLine} />
              <View style={styles.dot} />
              <View style={styles.dot} />
            </View>
          </View>
        </View>
      </ImageBackground>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 28,
    marginBottom: 30,
    paddingHorizontal: 20,
  },
  banner: {
    minHeight: 150,
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: '#1A1410',
  },
  bannerImage: {
    borderRadius: 22,
  },
  content: {
    minHeight: 150,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  leftCopy: {
    flex: 1,
    paddingRight: 12,
  },
  title: {
    fontSize: 24,
    color: '#E5C07A',
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    fontWeight: '700',
  },
  subtitle: {
    marginTop: 4,
    fontSize: 12,
    color: 'rgba(255,255,255,0.92)',
    fontWeight: '500',
    lineHeight: 16,
  },
  ctaPill: {
    alignSelf: 'flex-start',
    marginTop: 12,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  ctaText: {
    color: '#2B1D15',
    fontSize: 11,
    fontWeight: '800',
  },
  rightCopy: {
    maxWidth: 120,
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    alignSelf: 'stretch',
    paddingVertical: 2,
  },
  rightText: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.9)',
    textAlign: 'right',
    lineHeight: 15,
    fontWeight: '500',
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 'auto',
  },
  dotActive: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E5C07A',
  },
  dotLine: {
    width: 14,
    height: 2,
    borderRadius: 1,
    backgroundColor: '#E5C07A',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.28)',
  },
});

export const TreasureHuntBanner = memo(TreasureHuntBannerComponent);
