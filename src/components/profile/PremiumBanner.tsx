import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { PalPointsIcon } from '../PalPointsIcon';
import { ProfileColors as C, SANS, SANS_BOLD } from './profileTheme';

interface PremiumBannerProps {
  onUpgradePress: () => void;
}

const PERKS: Array<{ icon?: string; label: string; palPointsIcon?: boolean; imageSource?: any }> = [
  { icon: 'eye-off-outline', label: 'Ads Free\nExperience' },
  { icon: 'star-outline', label: 'Extra\nPal Points', palPointsIcon: true },
  { icon: 'rocket-outline', label: 'Early Access to\nNew Features' },
  { icon: 'pricetag-outline', label: 'Exclusive\nDiscounts' },
] as const;

export const PremiumBanner = ({ onUpgradePress }: PremiumBannerProps) => {
  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <View style={styles.headerLeft}>
          <View style={styles.crownCircle}>
            <Icon name="medal-outline" size={24} color="#7B563D" />
          </View>
          <View style={styles.headerTextCol}>
            <Text style={styles.goPremiumText}>Go Premium</Text>
            <Text style={styles.subtitle}>Unlock ad-free travel & exclusive perks</Text>
          </View>
        </View>

        <TouchableOpacity style={styles.upgradeBtn} onPress={onUpgradePress} activeOpacity={0.85}>
          <Text style={styles.upgradeBtnText}>Upgrade Now</Text>
          <Icon name="arrow-forward" size={14} color="#FFF" />
        </TouchableOpacity>
      </View>


      <View style={styles.perksRow}>
        {PERKS.map((perk, index) => (
          <PerkItem
            key={perk.label}
            icon={perk.icon}
            label={perk.label}
            palPointsIcon={perk.palPointsIcon}
            imageSource={perk.imageSource}
          />
        ))}
      </View>
    </View>
  );
};

const PerkItem = ({
  icon,
  label,
  palPointsIcon,
  imageSource,
}: {
  icon?: string;
  label: string;
  palPointsIcon?: boolean;
  imageSource?: any;
}) => (
  <View style={styles.perkItem}>
    <View style={styles.perkIconCircle}>
      {imageSource ? (
        <Image source={imageSource} style={styles.perkImage} resizeMode="cover" />
      ) : palPointsIcon ? (
        <View style={styles.palPointsWrap}>
           <Text style={styles.palPointsText}>P</Text>
        </View>
      ) : (
        <Icon name={icon as any} size={22} color="#A67B48" />
      )}
    </View>
    <Text style={styles.perkLabel}>{label}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: {
    marginBottom: 20,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 20,
    shadowColor: '#2B1D15',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#F3EBE3',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  crownCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FDF7F2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTextCol: {
    flex: 1,
    justifyContent: 'center',
  },
  goPremiumText: {
    color: '#13111C',
    fontSize: 16,
    fontFamily: SANS_BOLD,
    marginBottom: 0,
  },
  subtitle: {
    color: '#6A6158',
    fontSize: 10,
    fontFamily: SANS,
    lineHeight: 12,
  },
  upgradeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#7B563D',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 20,
    gap: 4,
    marginLeft: 8,
  },
  upgradeBtnText: {
    color: '#FFF',
    fontSize: 11,
    fontFamily: SANS_BOLD,
  },
  perksRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  perkItem: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 2,
  },
  perkIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FDF7F2',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#E8DDD0',
  },
  perkImage: {
    width: 40,
    height: 40,
  },
  perkLabel: {
    color: '#13111C',
    fontSize: 9,
    fontFamily: SANS,
    textAlign: 'center',
    lineHeight: 11,
  },
  palPointsWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#F59E0B',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFF',
  },
  palPointsText: {
    color: '#FFF',
    fontSize: 14,
    fontFamily: SANS_BOLD,
    marginTop: -1,
  },
});
