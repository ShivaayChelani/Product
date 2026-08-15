import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Dimensions, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '../utils/Icons';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { SERIF, SANS, SANS_BOLD, SANS_SEMI } from '../components/profile/profileTheme';
import { useHeaderSafePadding } from '../design/responsive';

interface HowItWorksScreenProps {
  navigation: any;
  onBack: () => void;
}

const { width } = Dimensions.get('window');

// Colors
const C = {
  bg: '#FAFAFA',
  white: '#FFFFFF',
  textDark: '#111827',
  textGray: '#4B5563',
  textLightGray: '#9CA3AF',
  orange: '#F59E0B',
  blue: '#63300E', // Now a brown color
  blueLight: '#F5EDE3', // Light cream/brown
  blueBorder: '#E8D2BB', // Brown border
  purple: '#8B5CF6',
  green: '#10B981',
  red: '#EF4444',
  shadow: 'rgba(0,0,0,0.06)',
};

export default function HowItWorksScreen({ navigation, onBack }: HowItWorksScreenProps) {
  const insets = useSafeAreaInsets();
  const headerPadTop = useHeaderSafePadding(12);

  const earnActivities = [
    { id: 'checkin', icon: 'location-sharp', iconColor: '#3B82F6', iconBg: '#EFF6FF', title: 'Check-in\nat Places', points: '+10 to +50 P', pointsColor: '#3B82F6' },
    { id: 'gem', icon: 'diamond', iconColor: '#8B5CF6', iconBg: '#F5F3FF', title: 'Submit\nHidden Gem', points: '+20 to +200 P', pointsColor: '#8B5CF6' },
    { id: 'review', icon: 'star', iconColor: '#F59E0B', iconBg: '#FFFBEB', title: 'Write\na Review', points: '+5 to +50 P', pointsColor: '#F59E0B' },
  ];

  const redeemSteps = [
    { id: '1', icon: 'storefront', iconBg: '#3B82F6', title: 'Find a\nPartner Vendor', desc: 'Browse vendors\nnear you' },
    { id: '2', icon: 'cellphone', iconBg: '#1E3A8A', title: 'Show Your\nPal ID', desc: 'Share your Pal ID\nor QR code' },
    { id: '3', icon: 'wallet', iconBg: '#F59E0B', title: 'Confirm &\nRedeem', desc: 'Pay with PalPoints\nat the vendor' },
    { id: '4', icon: 'gift', iconBg: '#10B981', title: 'Enjoy Offer\nor Service', desc: 'Get discounts,\ndeals & more' },
    { id: '5', icon: 'tag', iconBg: '#EF4444', title: 'Earn More\nPalPoints', desc: 'Keep exploring\n& earning' },
  ];

  const renderSectionHeader = (num: string, title: string, subtitle?: string) => (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionTitleRow}>
        <Ionicons name="leaf-outline" size={16} color="#93C5FD" style={{ transform: [{ scaleX: -1 }] }} />
        <View style={styles.stepBadge}>
          <Text style={styles.stepBadgeText}>{num}</Text>
        </View>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Ionicons name="leaf-outline" size={16} color="#93C5FD" />
      </View>
      {subtitle && <Text style={styles.sectionSubtitle}>{subtitle}</Text>}
    </View>
  );

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
        
        {/* Top Header */}
        <View style={[styles.header, { paddingTop: headerPadTop }]}>
          <TouchableOpacity style={styles.backButton} onPress={onBack}>
            <Ionicons name="arrow-back" size={24} color={C.textDark} />
          </TouchableOpacity>
        </View>

        {/* Title Area */}
        <View style={styles.titleArea}>
          <View style={styles.mainTitleRow}>
            <Ionicons name="sparkles" size={20} color={C.orange} style={styles.sparkleLeft} />
            <Text style={styles.mainTitle}>How <Text style={{ color: C.orange }}>PalPoints</Text> Work</Text>
            <Ionicons name="sparkles" size={20} color={C.orange} style={styles.sparkleRight} />
          </View>
          <View style={styles.subtitleRow}>
            <Text style={styles.headerSubtitle}>Explore</Text>
            <View style={styles.dot} />
            <Text style={styles.headerSubtitle}>Earn</Text>
            <View style={styles.dot} />
            <Text style={styles.headerSubtitle}>Redeem</Text>
          </View>
        </View>

        {/* Hero Card */}
        <View style={styles.heroCard}>
          <View style={styles.heroContent}>
            <Text style={styles.heroTitle}>Travel More. Earn More.</Text>
            <Text style={styles.heroText}>
              Earn <Text style={{ color: C.orange, fontWeight: '700' }}>PalPoints</Text> while you travel, complete activities and redeem them for exciting rewards from our partner vendors.
            </Text>
          </View>
          <Image source={require('../assets/wallet.png')} style={styles.heroImage} resizeMode="contain" />
          <Ionicons name="sparkles" size={14} color={C.orange} style={styles.heroSparkleLeft} />
          <Ionicons name="sparkles" size={14} color={C.orange} style={styles.heroSparkleRight} />
        </View>

        {/* Section 1: Earn PalPoints */}
        <View style={styles.sectionContainer}>
          {renderSectionHeader('1', 'Earn PalPoints', 'Complete simple activities and earn PalPoints')}
          
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalScroll}>
            {earnActivities.map((item) => (
              <View key={item.id} style={styles.earnCard}>
                <View style={[styles.earnIconWrap, { backgroundColor: item.iconBg }]}>
                  <Ionicons name={item.icon} size={28} color={item.iconColor} />
                </View>
                <Text style={styles.earnCardTitle}>{item.title}</Text>
                <View style={styles.dotsRow}>
                  {[...Array(4)].map((_, i) => <View key={i} style={[styles.miniDot, { backgroundColor: item.iconColor }]} />)}
                </View>
                <View style={[styles.pointsBadge, { borderColor: item.pointsColor }]}>
                  <Text style={[styles.pointsText, { color: item.pointsColor }]}>{item.points}</Text>
                </View>
              </View>
            ))}
          </ScrollView>
        </View>

        {/* Section 2: Redeem with Vendors */}
        <View style={styles.sectionContainer}>
          {renderSectionHeader('2', 'Redeem with Vendors', 'Use your PalPoints in easy steps and enjoy amazing rewards')}
          
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.timelineScroll}>
            <View style={styles.timelineLineWrapper}>
              <View style={styles.timelineLineDotted} />
            </View>
            
            {redeemSteps.map((step, index) => (
              <View key={step.id} style={styles.timelineStep}>
                <View style={[styles.timelineIconNode, { backgroundColor: step.iconBg }]}>
                  <MaterialCommunityIcons name={step.icon} size={24} color={C.white} />
                  <View style={styles.timelineNumberBadge}>
                    <Text style={styles.timelineNumberText}>{step.id}</Text>
                  </View>
                </View>
                <Text style={styles.timelineTitle}>{step.title}</Text>
                <Text style={styles.timelineDesc}>{step.desc}</Text>
              </View>
            ))}
          </ScrollView>
        </View>

        {/* Section 3: Benefits for You & Vendors */}
        <View style={styles.sectionContainer}>
          {renderSectionHeader('3', 'Benefits for You & Vendors')}
          
          <View style={styles.benefitsRow}>
            {/* For You */}
            <View style={styles.benefitsCard}>
              <View style={styles.benefitsHeaderForYou}>
                <View style={styles.benefitsIconYouWrap}>
                  <Ionicons name="person" size={24} color={C.white} />
                </View>
                <Text style={[styles.benefitsCardTitle, { color: C.blue }]}>For You</Text>
              </View>
              <View style={styles.benefitsList}>
                {['Earn points for every activity', 'Unlock exciting rewards', 'Save more with exclusive offers', 'Enjoy better travel experiences'].map((text, i) => (
                  <View key={i} style={styles.benefitItem}>
                    <Ionicons name="checkmark-circle" size={14} color={C.blue} style={{ marginRight: 6, marginTop: 1 }} />
                    <Text style={styles.benefitText}>{text}</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* For Vendors */}
            <View style={styles.benefitsCard}>
              <View style={styles.benefitsHeaderForVendors}>
                <View style={styles.benefitsIconVendorWrap}>
                  <MaterialCommunityIcons name="storefront" size={24} color={C.white} />
                </View>
                <Text style={[styles.benefitsCardTitle, { color: C.orange }]}>For Vendors</Text>
              </View>
              <View style={styles.benefitsList}>
                {['Increase visibility & footfall', 'Build customer loyalty', 'More engagement', 'Stronger relationships & growth'].map((text, i) => (
                  <View key={i} style={styles.benefitItem}>
                    <Ionicons name="checkmark-circle" size={14} color={C.orange} style={{ marginRight: 6, marginTop: 1 }} />
                    <Text style={styles.benefitText}>{text}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
        </View>

        {/* Ecosystem Banner */}
        <View style={styles.ecosystemBanner}>
          <Ionicons name="trophy" size={46} color={C.blue} />
          <View style={styles.ecosystemContent}>
            <Text style={styles.ecosystemTitle}>PalPoints create a win-win</Text>
            <Text style={styles.ecosystemDesc}>ecosystem for travelers and local businesses.</Text>
          </View>
          <View style={styles.ecosystemCoins}>
            {/* Just an illustrative group of coins */}
            <View style={[styles.mockCoin, { top: 0, left: 10, transform: [{ scale: 0.8 }] }]}><Text style={styles.mockCoinText}>P</Text></View>
            <View style={[styles.mockCoin, { top: 20, left: -10, transform: [{ scale: 0.9 }] }]}><Text style={styles.mockCoinText}>P</Text></View>
            <View style={[styles.mockCoin, { top: 25, left: 15, transform: [{ scale: 0.7 }] }]}><Text style={styles.mockCoinText}>P</Text></View>
          </View>
        </View>
        
      </ScrollView>

      {/* Sticky Bottom Button */}
      <View style={[styles.bottomSticky, { paddingBottom: Math.max(insets.bottom, 24) }]}>
        <TouchableOpacity style={styles.startButton} onPress={onBack}>
          <Ionicons name="wallet-outline" size={22} color={C.white} style={{ marginRight: 8 }} />
          <Text style={styles.startButtonText}>Start Earning PalPoints</Text>
          <Ionicons name="chevron-forward" size={20} color={C.white} style={{ position: 'absolute', right: 20 }} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.bg,
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 10,
    alignItems: 'flex-start',
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: C.white,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: C.textDark,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  titleArea: {
    alignItems: 'center',
    marginTop: 10,
    paddingHorizontal: 20,
  },
  mainTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
  },
  sparkleLeft: {
    marginRight: 8,
    marginTop: -10,
  },
  sparkleRight: {
    marginLeft: 8,
    marginTop: -10,
  },
  mainTitle: {
    fontFamily: SANS_BOLD,
    fontSize: 26,
    fontWeight: '800',
    color: C.textDark,
    letterSpacing: -0.5,
  },
  subtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  headerSubtitle: {
    fontFamily: SANS_SEMI,
    fontSize: 13,
    color: C.textDark,
    fontWeight: '600',
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.orange,
    marginHorizontal: 12,
  },
  heroCard: {
    marginHorizontal: 20,
    backgroundColor: C.white,
    borderRadius: 20,
    padding: 24,
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.04,
    shadowRadius: 20,
    elevation: 3,
    position: 'relative',
    overflow: 'visible',
  },
  heroContent: {
    flex: 1,
    paddingRight: 10,
  },
  heroTitle: {
    fontFamily: SANS_BOLD,
    fontSize: 16,
    color: C.textDark,
    marginBottom: 8,
  },
  heroText: {
    fontFamily: SANS,
    fontSize: 11,
    color: C.textGray,
    lineHeight: 18,
  },
  heroImage: {
    width: 110,
    height: 110,
  },
  heroSparkleLeft: {
    position: 'absolute',
    bottom: 20,
    left: '50%',
  },
  heroSparkleRight: {
    position: 'absolute',
    top: 20,
    right: -10,
  },
  sectionContainer: {
    marginTop: 36,
  },
  sectionHeader: {
    alignItems: 'center',
    marginBottom: 20,
    paddingHorizontal: 20,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stepBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: C.blue,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 8,
  },
  stepBadgeText: {
    fontFamily: SANS_BOLD,
    fontSize: 12,
    color: C.white,
  },
  sectionTitle: {
    fontFamily: SANS_BOLD,
    fontSize: 16,
    color: C.textDark,
    marginRight: 8,
  },
  sectionSubtitle: {
    fontFamily: SANS,
    fontSize: 12,
    color: C.textGray,
    marginTop: 6,
    textAlign: 'center',
  },
  horizontalScroll: {
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  earnCard: {
    width: 116,
    backgroundColor: C.white,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    marginRight: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 10,
    elevation: 2,
  },
  earnIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  earnCardTitle: {
    fontFamily: SANS_BOLD,
    fontSize: 12,
    color: C.textDark,
    textAlign: 'center',
    lineHeight: 16,
    height: 32,
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginVertical: 10,
  },
  miniDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
  },
  pointsBadge: {
    borderWidth: 1.5,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  pointsText: {
    fontFamily: SANS_BOLD,
    fontSize: 10,
  },
  timelineScroll: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  timelineLineWrapper: {
    position: 'absolute',
    top: 26,
    left: 40,
    right: 40,
    height: 1,
    overflow: 'hidden',
  },
  timelineLineDotted: {
    borderBottomWidth: 1.5,
    borderBottomColor: '#93C5FD',
    borderStyle: 'dashed',
    width: 1000,
  },
  timelineStep: {
    width: 90,
    alignItems: 'center',
    marginRight: 8,
  },
  timelineIconNode: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  timelineNumberBadge: {
    position: 'absolute',
    bottom: -6,
    backgroundColor: C.white,
    width: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  timelineNumberText: {
    fontFamily: SANS_BOLD,
    fontSize: 9,
    color: C.blue,
  },
  timelineTitle: {
    fontFamily: SANS_BOLD,
    fontSize: 10,
    color: C.textDark,
    textAlign: 'center',
    lineHeight: 14,
    marginBottom: 6,
  },
  timelineDesc: {
    fontFamily: SANS,
    fontSize: 9,
    color: C.textGray,
    textAlign: 'center',
    lineHeight: 12,
  },
  benefitsRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 12,
  },
  benefitsCard: {
    flex: 1,
    backgroundColor: C.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#F3F4F6',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 10,
    elevation: 2,
    overflow: 'hidden',
  },
  benefitsHeaderForYou: {
    alignItems: 'center',
    paddingVertical: 16,
    backgroundColor: '#EFF6FF',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E7FF',
  },
  benefitsHeaderForVendors: {
    alignItems: 'center',
    paddingVertical: 16,
    backgroundColor: '#FFF7ED',
    borderBottomWidth: 1,
    borderBottomColor: '#FFEDD5',
  },
  benefitsIconYouWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: C.blue,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  benefitsIconVendorWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: C.orange,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  benefitsCardTitle: {
    fontFamily: SANS_BOLD,
    fontSize: 14,
  },
  benefitsList: {
    padding: 12,
    gap: 10,
  },
  benefitItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  benefitText: {
    fontFamily: SANS_SEMI,
    fontSize: 9.5,
    color: C.textDark,
    flex: 1,
    lineHeight: 13,
  },
  ecosystemBanner: {
    marginHorizontal: 20,
    marginTop: 36,
    marginBottom: 20,
    backgroundColor: '#EFF6FF',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  ecosystemContent: {
    flex: 1,
    marginLeft: 12,
  },
  ecosystemTitle: {
    fontFamily: SANS_BOLD,
    fontSize: 12,
    color: C.textDark,
    marginBottom: 2,
  },
  ecosystemDesc: {
    fontFamily: SANS,
    fontSize: 11,
    color: C.textGray,
  },
  ecosystemCoins: {
    width: 40,
    height: 40,
    position: 'relative',
    marginLeft: 8,
  },
  mockCoin: {
    position: 'absolute',
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: C.orange,
    borderWidth: 1.5,
    borderColor: '#FCD34D',
    justifyContent: 'center',
    alignItems: 'center',
  },
  mockCoinText: {
    color: C.white,
    fontSize: 11,
    fontWeight: '800',
  },
  bottomSticky: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingTop: 16,
    backgroundColor: C.bg,
  },
  startButton: {
    backgroundColor: C.blue,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 16,
    shadowColor: C.blue,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 4,
  },
  startButtonText: {
    fontFamily: SANS_BOLD,
    fontSize: 16,
    color: C.white,
  },
});
