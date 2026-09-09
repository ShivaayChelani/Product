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
        source={require('../../assets/treasure_hunt_banner.png')}
        style={styles.banner}
        imageStyle={styles.bannerImage}
        resizeMode="cover"
      >
        <View style={styles.content}>
          <Text style={styles.title}>Treasure{'\n'}Hunt ✨</Text>
          <Text style={styles.subtitle}>Explore. Discover. Win!</Text>
          <Text style={styles.desc}>Find hidden treasures around you{'\n'}and earn exciting rewards!</Text>
          <View style={styles.ctaPill}>
            <Text style={styles.ctaText}>View Hunts on Map</Text>
            <Icon name="arrow-forward" size={14} color="#FFF" style={{ marginLeft: 4 }} />
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
    height: 180,
    borderRadius: 16,
    overflow: 'hidden',
  },
  bannerImage: {
    borderRadius: 16,
  },
  content: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
  },
  title: {
    fontSize: 28,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    fontWeight: '800',
    color: '#1E1B18',
    lineHeight: 32,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#1E1B18',
    marginTop: 4,
  },
  desc: {
    fontSize: 11,
    color: '#4B3B30',
    marginTop: 4,
    marginBottom: 12,
    lineHeight: 15,
  },
  ctaPill: {
    backgroundColor: '#A1622D',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
  },
  ctaText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
});

export const TreasureHuntBanner = memo(TreasureHuntBannerComponent);
