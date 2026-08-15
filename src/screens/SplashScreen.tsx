import React, { useEffect, useRef } from 'react';
import {
  View,
  StatusBar,
  ImageBackground,
  StyleSheet,
  Animated,
  Image,
  TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function SplashScreen({ onFinish }: { onFinish: () => void }) {
  const insets = useSafeAreaInsets();
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 800,
      useNativeDriver: true,
    }).start();

    // Auto-advance after 3 seconds or keep it interactive?
    // The design has pagination dots, indicating it might be a pager, but the user requested SplashScreen to be separate.
    // I'll add a touchable over the whole screen to allow advancing, as well as a timeout.
    const timer = setTimeout(() => {
      onFinish();
    }, 3000);
    return () => clearTimeout(timer);
  }, [fadeAnim, onFinish]);

  return (
    <TouchableOpacity style={styles.root} activeOpacity={1} onPress={onFinish}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      
      <ImageBackground
        source={require('../assets/splash.png')}
        style={styles.bg}
        resizeMode="cover"
      >
        <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
          <View style={styles.centerBlock}>
            <Image 
              source={require('../assets/logo.png')} 
              style={styles.logo} 
              resizeMode="contain" 
            />
          </View>
          
          <View style={[styles.bottomCard, { paddingBottom: Math.max(insets.bottom, 24) }]}>
            <View style={styles.pagination}>
              <View style={[styles.dot, styles.activeDot]} />
              <View style={[styles.dot, styles.inactiveDot]} />
              <View style={[styles.dot, styles.inactiveDot]} />
            </View>
          </View>
        </Animated.View>
      </ImageBackground>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  bg: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  content: {
    flex: 1,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  centerBlock: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  logo: {
    width: 280,
    height: 280,
    marginBottom: 160,
  },
  bottomCard: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 24,
  },
  pagination: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    height: 6,
    borderRadius: 3,
  },
  activeDot: {
    width: 24,
    backgroundColor: '#FFFFFF',
  },
  inactiveDot: {
    width: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
  },
});
