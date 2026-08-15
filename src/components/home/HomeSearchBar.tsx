import React, { memo, useEffect, useRef, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { PressableScale } from './PressableScale';
import { HOME_SEARCH_PLACEHOLDERS } from './constants';
import {
  getLuxuryTheme,
  luxuryCardShadow,
  LuxuryRadii,
  LuxurySpacing,
  LuxuryTypography,
} from '../../design/luxuryTravel';

type Props = {
  onPress: () => void;
  onFilterPress?: () => void;
};

function HomeSearchBarComponent({ onPress, onFilterPress }: Props) {
  const theme = getLuxuryTheme('light');
  const [index, setIndex] = useState(0);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const timer = setInterval(() => {
      Animated.timing(fadeAnim, { toValue: 0, duration: 220, useNativeDriver: true }).start(() => {
        setIndex(prev => (prev + 1) % HOME_SEARCH_PLACEHOLDERS.length);
        Animated.timing(fadeAnim, { toValue: 1, duration: 220, useNativeDriver: true }).start();
      });
    }, 3200);
    return () => clearInterval(timer);
  }, [fadeAnim]);

  return (
    <View style={styles.wrap}>
      <PressableScale onPress={onPress} style={[styles.bar, luxuryCardShadow()]} activeScale={0.98}>
        <Icon name="search-outline" size={20} color={theme.textSecondary} />
        <View style={styles.placeholderWrap}>
          <Animated.Text
            style={[
              LuxuryTypography.bodyMedium,
              { opacity: fadeAnim, color: theme.textSecondary },
            ]}
            numberOfLines={1}
          >
            {HOME_SEARCH_PLACEHOLDERS[index]}
          </Animated.Text>
        </View>
        <View style={[styles.divider, { backgroundColor: theme.divider }]} />
        <TouchableOpacity
          onPress={onFilterPress ?? onPress}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Search filters"
        >
          <Icon name="options-outline" size={20} color={theme.textSecondary} />
        </TouchableOpacity>
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: LuxurySpacing.screenHorizontal,
    marginBottom: 22,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    height: LuxurySpacing.searchHeight,
    paddingHorizontal: 16,
    borderRadius: LuxuryRadii.search,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#ECE3D8',
    gap: 10,
  },
  placeholderWrap: {
    flex: 1,
    justifyContent: 'center',
  },
  divider: {
    width: 1,
    height: 22,
    marginHorizontal: 4,
  },
});

export const HomeSearchBar = memo(HomeSearchBarComponent);
