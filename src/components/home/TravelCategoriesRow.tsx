import React, { memo } from 'react';
import { ScrollView, View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import Animated, { FadeInRight } from 'react-native-reanimated';
import { HOME_CATEGORIES } from './constants';
import {
  getLuxuryTheme,
  luxurySoftShadow,
  LuxuryRadii,
  LuxurySpacing,
  LuxuryTypography,
} from '../../design/luxuryTravel';

type Props = {
  onCategoryPress: (category: (typeof HOME_CATEGORIES)[number]) => void;
};

function TravelCategoriesRowComponent({ onCategoryPress }: Props) {
  const theme = getLuxuryTheme('light');

  return (
    <View style={styles.section}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {HOME_CATEGORIES.map((cat, idx) => (
          <Animated.View key={cat.id} entering={FadeInRight.delay(idx * 40).duration(380)}>
            <TouchableOpacity
              style={styles.item}
              activeOpacity={0.85}
              onPress={() => onCategoryPress(cat)}
              accessibilityRole="button"
              accessibilityLabel={cat.name}
            >
              <View style={[styles.iconBox, luxurySoftShadow(), { backgroundColor: theme.card, borderColor: theme.border }]}>
                <Icon name={cat.icon} size={22} color={theme.primaryBrown} />
              </View>
              <Text style={[LuxuryTypography.label, styles.label, { color: theme.textSecondary }]}>
                {cat.name}
              </Text>
            </TouchableOpacity>
          </Animated.View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: LuxurySpacing.sectionGap,
  },
  scrollContent: {
    paddingHorizontal: LuxurySpacing.screenHorizontal,
    gap: 14,
  },
  item: {
    alignItems: 'center',
    width: 68,
  },
  iconBox: {
    width: LuxurySpacing.categoryIcon,
    height: LuxurySpacing.categoryIcon,
    borderRadius: LuxuryRadii.category,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    marginBottom: 8,
  },
  label: {
    textAlign: 'center',
  },
});

export const TravelCategoriesRow = memo(TravelCategoriesRowComponent);
