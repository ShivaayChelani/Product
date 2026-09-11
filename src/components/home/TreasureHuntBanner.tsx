import React, { memo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ImageBackground,
  Platform,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';

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
        source={require('../../assets/treasure_hunt_bg.png')}
        style={styles.banner}
        imageStyle={styles.bannerImage}
        resizeMode="cover"
      >
        <View style={styles.livePill}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>Live Now</Text>
        </View>
        <View style={styles.content}>
          <Text style={styles.titleBlack}>Treasure</Text>
          <Text style={styles.titleBrown}>Hunt ✨</Text>
          <Text style={styles.subtitle}>Explore. Discover. Win!</Text>
          <Text style={styles.desc}>Solve city riddles in your city{'\n'}and earn coins & badges!</Text>
          <View style={styles.ctaPill}>
            <Text style={styles.ctaText}>Start Hunt</Text>
            <Icon name="arrow-forward" size={16} color="#FFF" style={{ marginLeft: 6 }} />
          </View>
        </View>
      </ImageBackground>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 24,
    paddingHorizontal: 20,
  },
  banner: {
    width: '100%',
    height: 200,
    borderRadius: 16,
    overflow: 'hidden',
  },
  bannerImage: {
    borderRadius: 16,
  },
  livePill: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: '#1E3E2A',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 2,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#4ADE80',
    marginRight: 6,
  },
  liveText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: 'bold',
  },
  content: {
    flex: 1,
    paddingLeft: 24,
    paddingVertical: 24,
    justifyContent: 'center',
    maxWidth: '65%', // ensure text doesn't overlap chest
  },
  titleBlack: {
    fontSize: 32,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    fontWeight: '900',
    color: '#000000',
    lineHeight: 36,
    letterSpacing: -0.5,
  },
  titleBrown: {
    fontSize: 32,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    fontWeight: '900',
    color: '#9C642A',
    lineHeight: 36,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#000000',
    marginTop: 8,
  },
  desc: {
    fontSize: 13,
    color: '#333333',
    marginTop: 4,
    marginBottom: 4,
    lineHeight: 18,
    fontWeight: '500',
  },
  ctaPill: {
    backgroundColor: '#A1622D',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 24,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
  },
  ctaText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
});

export const TreasureHuntBanner = memo(TreasureHuntBannerComponent);
