import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ImageBackground,
  Dimensions,
  Image,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { ProfileColors as C, SANS_BOLD, SANS } from './profileTheme';

const CARD_W = (Dimensions.get('window').width - 40 - 10) / 2;

interface PromotionalCardProps {
  heading: string;
  headingAccent?: string;
  subText?: string;
  buttonText: string;
  buttonColor: string;
  buttonTextColor?: string;
  buttonOutlined?: boolean;
  solidBg: string;
  imageSource: any;
  imageScale?: number;
  onPress: () => void;
}

const PromotionalCard = ({
  heading,
  headingAccent,
  subText,
  buttonText,
  buttonColor,
  buttonTextColor = '#FFF',
  buttonOutlined = false,
  solidBg,
  imageSource,
  imageScale = 1,
  onPress,
}: PromotionalCardProps) => {
  return (
    <View style={[styles.card, { width: CARD_W, backgroundColor: solidBg }]}>
      <View style={styles.contentOverlay}>
        <View style={styles.header}>
          <Text
            style={styles.heading}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.88}
          >
            {heading}
            {headingAccent ? <Text style={styles.headingAccent}>{headingAccent}</Text> : null}
          </Text>
          {subText ? <Text style={styles.subText}>{subText}</Text> : null}
        </View>
        <View style={styles.footer}>
          <TouchableOpacity
            style={[
              styles.button,
              buttonOutlined
                ? { backgroundColor: 'transparent', borderWidth: 1, borderColor: buttonColor }
                : { backgroundColor: buttonColor },
            ]}
            onPress={onPress}
            activeOpacity={0.85}
          >
            <Text style={[styles.buttonText, { color: buttonTextColor }]}>{buttonText}</Text>
            <Icon name="arrow-forward" size={12} color={buttonTextColor} />
          </TouchableOpacity>
        </View>
      </View>
      <Image
        source={imageSource}
        style={[styles.bgImage, { transform: [{ scale: imageScale }] }]}
        resizeMode="contain"
      />
    </View>
  );
};

export const PromotionalCardsRow = ({
  onApplyCreator,
  onApplyVendor,
  showCreator = true,
  showVendor = true,
}: {
  onApplyCreator: () => void;
  onApplyVendor: () => void;
  showCreator?: boolean;
  showVendor?: boolean;
}) => {
  if (!showCreator && !showVendor) return null;

  return (
    <View style={styles.grid}>
      {showCreator ? (
        <PromotionalCard
          heading="Become a "
          headingAccent="Creator"
          subText="Share, inspire & earn rewards"
          buttonText="Apply Now"
          buttonColor="#7B563D"
          buttonTextColor="#FFF"
          solidBg="#FCF7EE"
          imageSource={require('../../assets/creator_icon.png')}
          imageScale={0.8}
          onPress={onApplyCreator}
        />
      ) : null}

      {showVendor ? (
        <PromotionalCard
          heading="Become a "
          headingAccent="Vendor"
          subText="Grow your business with PalSafar"
          buttonText="Apply Now"
          buttonColor="#7B563D"
          buttonTextColor="#7B563D"
          buttonOutlined={true}
          solidBg="#F2FAEE"
          imageSource={require('../../assets/buisness_icon.png')}
          imageScale={0.8}
          onPress={onApplyVendor}
        />
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: 24,
  },
  card: {
    height: 140,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#F3EBE3',
    shadowColor: '#2B1D15',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
    overflow: 'hidden',
    position: 'relative',
  },
  contentOverlay: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 12,
    zIndex: 2,
  },
  header: {
    zIndex: 2,
  },
  heading: {
    fontSize: 14,
    lineHeight: 18,
    fontFamily: SANS_BOLD,
    color: '#13111C',
  },
  headingAccent: {
    color: '#944424',
    fontFamily: SANS_BOLD,
  },
  subText: {
    fontSize: 9,
    fontFamily: SANS,
    color: '#6A6158',
    marginTop: 2,
    maxWidth: '65%',
    lineHeight: 12,
  },
  bgImage: {
    position: 'absolute',
    bottom: -10,
    right: -15,
    width: 80,
    height: 80,
    zIndex: 1,
  },
  footer: {
    zIndex: 2,
    alignItems: 'flex-start',
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 4,
  },
  buttonText: {
    fontSize: 9,
    fontFamily: SANS_BOLD,
  },
});
