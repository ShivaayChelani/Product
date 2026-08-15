import React, { useRef, useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  ScrollView,
  ImageBackground,
  useWindowDimensions,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const COLORS = {
  brown: '#4B3B30',
  inactiveDot: '#ECE3D7',
};

const SLIDES = [
  {
    image: require('../assets/onboarding_1.png'),
  },
  {
    image: require('../assets/onboarding_2.png'),
  },
  {
    image: require('../assets/onboarding_3.png'),
  },
];

export default function OnboardingScreen({ onDone }: { onDone: () => void }) {
  const insets = useSafeAreaInsets();
  const { width: W, height: H } = useWindowDimensions();
  const [page, setPage] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const doneOnceRef = useRef(false);

  const finishOnboarding = useCallback(() => {
    if (doneOnceRef.current) return;
    doneOnceRef.current = true;
    onDone();
  }, [onDone]);

  const handleScroll = useCallback(
    (e: any) => {
      const offsetX = e.nativeEvent.contentOffset.x;
      const newPage = Math.round(offsetX / W);
      if (newPage >= 0 && newPage < SLIDES.length) {
        setPage(newPage);
      }
    },
    [W]
  );

  const goNext = useCallback(() => {
    if (page >= SLIDES.length - 1) {
      finishOnboarding();
    } else {
      const next = page + 1;
      setPage(next);
      scrollRef.current?.scrollTo({ x: next * W, animated: true });
    }
  }, [page, finishOnboarding, W]);

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" translucent={false} />

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScroll}
        bounces={false}
        contentInsetAdjustmentBehavior="never"
        style={styles.root}
      >
        {SLIDES.map((slide, i) => (
          <View key={i} style={{ width: W, height: H }}>
            <View style={styles.imageContainer}>
              <ImageBackground
                source={slide.image}
                style={{ width: '100%', height: '100%' }}
                resizeMode="cover"
              />
            </View>
          </View>
        ))}
      </ScrollView>

      {/* Bottom Controls */}
      <View style={[styles.bottomContainer, { paddingBottom: Math.max(insets.bottom, 24) }]}>
        <View style={styles.pagination}>
          {SLIDES.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                page === i ? styles.activeDot : styles.inactiveDot,
              ]}
            />
          ))}
        </View>

        <TouchableOpacity onPress={goNext} style={styles.nextBtn} activeOpacity={0.8}>
          <Icon name="arrow-forward" size={18} color="#FFFFFF" style={styles.nextIcon} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  imageContainer: {
    flex: 1,
    width: '100%',
  },
  bottomContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: 24,
    backgroundColor: 'transparent',
    zIndex: 20,
  },
  pagination: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    position: 'absolute',
    left: 0,
    right: 0,
    justifyContent: 'center',
    zIndex: -1,
  },
  dot: {
    height: 6,
    borderRadius: 3,
  },
  activeDot: {
    width: 24,
    backgroundColor: COLORS.brown,
  },
  inactiveDot: {
    width: 6,
    backgroundColor: COLORS.inactiveDot,
  },
  nextBtn: {
    backgroundColor: COLORS.brown,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    height: 44,
    borderRadius: 22,
  },
  nextIcon: {
    marginLeft: 6,
  },
});
