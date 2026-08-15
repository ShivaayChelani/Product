import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ImageSourcePropType,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { SANS, SANS_BOLD } from './tripsTheme';

interface NextAdventureSectionProps {
  onPlanWithAI: () => void;
  onBuildManually: () => void;
}

interface AdventureCardProps {
  title: string;
  subtitle: string;
  image: ImageSourcePropType;
  buttonLabel: string;
  buttonIcon: string;
  buttonColor: string;
  bgColor: string;
  textColor: string;
  onPress: () => void;
}

function AdventureCard({
  title,
  subtitle,
  image,
  buttonLabel,
  buttonIcon,
  buttonColor,
  bgColor,
  textColor,
  onPress,
}: AdventureCardProps) {
  return (
    <View style={[styles.card, { backgroundColor: bgColor }]}>
      <View style={styles.textContainer}>
        <Text style={[styles.cardTitle, { color: textColor }]}>{title}</Text>
        <Text style={[styles.cardSubtitle, { color: textColor, opacity: 0.8 }]}>{subtitle}</Text>
      </View>

      <View style={styles.imageContainer}>
        <Image source={image} style={styles.cardImage} resizeMode="contain" />
      </View>

      <TouchableOpacity
        style={[styles.btn, { backgroundColor: buttonColor }]}
        onPress={onPress}
        activeOpacity={0.85}
      >
        <Icon
          name={buttonIcon}
          size={14}
          color="#FFFFFF"
        />
        <Text style={styles.btnText}>{buttonLabel}</Text>
      </TouchableOpacity>
    </View>
  );
}

export const NextAdventureSection = ({ onPlanWithAI, onBuildManually }: NextAdventureSectionProps) => {
  return (
    <View style={styles.container}>
      <View style={styles.cardsRow}>
        <AdventureCard
          title="AI Trip Planner"
          subtitle="Get personalized itinerary in seconds with AI."
          image={require('../../assets/itinerary_ai_card.png')}
          buttonLabel="Plan with AI"
          buttonIcon="sparkles"
          buttonColor="#17344D"
          bgColor="#EAF0F6"
          textColor="#284357"
          onPress={onPlanWithAI}
        />
        <AdventureCard
          title="Build Manually"
          subtitle="Create your own itinerary step by step."
          image={require('../../assets/itinerary_manual_card.png')}
          buttonLabel="Build Trip"
          buttonIcon="map-outline"
          buttonColor="#8E5820"
          bgColor="#F5EDDE"
          textColor="#332517"
          onPress={onBuildManually}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    flexShrink: 0,
    paddingTop: 10,
    paddingBottom: 20,
  },
  cardsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  card: {
    flex: 1,
    borderRadius: 20,
    overflow: 'hidden',
    padding: 12,
    justifyContent: 'space-between',
    minHeight: 200,
  },
  textContainer: {
    marginBottom: 0,
  },
  cardTitle: {
    fontFamily: SANS_BOLD,
    fontSize: 18,
    marginBottom: 4,
    letterSpacing: -0.3,
  },
  cardSubtitle: {
    fontFamily: SANS,
    fontSize: 12,
    lineHeight: 16,
    opacity: 0.85,
  },
  imageContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 0,
    marginTop: -16,
  },
  cardImage: {
    width: 180,
    height: 180,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 24,
    gap: 4,
    alignSelf: 'center',
    width: '100%',
    marginTop: -20,
  },
  btnText: {
    fontSize: 11,
    fontFamily: SANS_BOLD,
    color: '#FFFFFF',
  },
});
