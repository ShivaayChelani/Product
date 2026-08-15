import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ImageBackground,
  useWindowDimensions,
  StatusBar,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import LinearGradient from 'react-native-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useToast } from '../context/ToastContext';
import { subscribeUnreadBadge } from '../services/notifications/notificationBadgeStore';
import { TH, SERIF, SANS, SANS_BOLD, SANS_SEMI } from '../features/treasureHunt/theme';

const PALPOINT_ICON = require('../assets/palpoint icon.png');

const JOURNEY = [
  { key: 'clues', color: TH.journey.clues, icon: 'location', lib: 'ion', title: 'Find Clues', sub: 'Explore hidden spots' },
  { key: 'puzzle', color: TH.journey.puzzle, icon: 'puzzle', lib: 'mci', title: 'Solve Puzzle', sub: 'Use hints and crack the clue' },
  { key: 'checkin', color: TH.journey.checkin, icon: 'camera', lib: 'ion', title: 'Check In', sub: 'Visit the place and check in' },
  { key: 'points', color: TH.journey.points, icon: 'palpoint', lib: 'img', title: 'Earn PalPoints', sub: 'Collect points and climb the ranks' },
  { key: 'treasure', color: TH.journey.treasure, icon: 'gift', lib: 'ion', title: 'Unlock Treasure', sub: 'Unlock exciting rewards' },
] as const;

const FEATURES = [
  { icon: 'map-outline', lib: 'ion' as const, color: '#5C8FD4', bg: '#EAF2FB', title: 'Hidden Locations', sub: 'Discover lesser-known gems across India' },
  { icon: 'target', lib: 'mci' as const, color: '#D4843A', bg: '#FFF3E8', title: 'Daily Missions', sub: 'New challenges every day' },
  { icon: 'robot-outline', lib: 'mci' as const, color: '#7B6BB8', bg: '#F1EDFA', title: 'AI Hints', sub: 'Smart hints to help you on the way' },
  { icon: 'camera-outline', lib: 'ion' as const, color: '#5A9E72', bg: '#EAF6EE', title: 'Photo Challenges', sub: 'Capture, upload and earn more points' },
  { icon: 'gift-outline', lib: 'ion' as const, color: '#C76B52', bg: '#FDEEEA', title: 'Exclusive Rewards', sub: 'Win exciting rewards and offers' },
  { icon: 'people-outline', lib: 'ion' as const, color: '#4A8FA8', bg: '#E8F4F8', title: 'Team Adventures', sub: 'Play with friends and earn together' },
];

function SectionHeader({ title }: { title: string }) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionLine} />
      <View style={styles.sectionDiamond} />
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionDiamond} />
      <View style={styles.sectionLine} />
    </View>
  );
}

function JourneyIcon({ step }: { step: (typeof JOURNEY)[number] }) {
  return (
    <View style={[styles.journeyCircle, { backgroundColor: step.color }]}>
      {step.lib === 'img' ? (
        <Image source={PALPOINT_ICON} style={styles.palpointIcon} resizeMode="contain" />
      ) : step.lib === 'mci' ? (
        <MaterialCommunityIcons name={step.icon as any} size={22} color="#FFF" />
      ) : (
        <Icon name={`${step.icon}-outline` as any} size={22} color="#FFF" />
      )}
    </View>
  );
}

function FeatureIcon({ item }: { item: (typeof FEATURES)[number] }) {
  return (
    <View style={[styles.featureIconBox, { backgroundColor: item.bg }]}>
      {item.lib === 'mci' ? (
        <MaterialCommunityIcons name={item.icon as any} size={22} color={item.color} />
      ) : (
        <Icon name={item.icon as any} size={22} color={item.color} />
      )}
    </View>
  );
}

function NotifyButton({
  label,
  compact,
  notified,
  onPress,
}: {
  label: string;
  compact?: boolean;
  notified: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity activeOpacity={0.88} onPress={onPress} disabled={notified}>
      <LinearGradient
        colors={notified ? ['#A88858', '#7A5A32'] : ['#C4A06A', '#7A4E24']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.notifyBtn, compact && styles.notifyBtnCompact]}
      >
        <Icon name={notified ? 'checkmark-circle' : 'notifications-outline'} size={compact ? 14 : 17} color="#FFF" />
        <Text style={[styles.notifyBtnText, compact && styles.notifyBtnTextCompact]}>
          {notified ? 'Notification Set' : label}
        </Text>
      </LinearGradient>
    </TouchableOpacity>
  );
}

export default function TreasureHuntScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { showSuccess } = useToast();
  const [unreadCount, setUnreadCount] = useState(0);
  const [notified, setNotified] = useState(false);

  const journeyStepW = Math.min(96, (width - 48) / 3.4);
  const featureW = (width - 52) / 2;

  useEffect(() => {
    subscribeUnreadBadge(setUnreadCount);
    (async () => {
      try {
        const val = await AsyncStorage.getItem('TREASURE_HUNT_NOTIFIED');
        if (val === 'true') {
          setNotified(true);
        }
      } catch (e) {
        // ignore
      }
    })();
  }, []);

  const handleNotify = useCallback(async () => {
    if (notified) return;
    setNotified(true);
    try {
      await AsyncStorage.setItem('TREASURE_HUNT_NOTIFIED', 'true');
    } catch (e) {
      // ignore
    }
    showSuccess("You're on the list! We'll notify you when Treasure Hunt launches.");
  }, [notified, showSuccess]);

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={TH.bg} />

      <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
        <TouchableOpacity style={styles.headerBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <Icon name="chevron-back" size={24} color={TH.brown} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Treasure Hunt</Text>
        <TouchableOpacity
          style={styles.headerBtn}
          onPress={() => navigation.navigate('Notifications')}
          activeOpacity={0.7}
        >
          <Icon name="notifications-outline" size={22} color={TH.brown} />
          {unreadCount > 0 ? (
            <View style={styles.notifBadge}>
              <Text style={styles.notifBadgeText}>
                {unreadCount > 9 ? '9+' : unreadCount}
              </Text>
            </View>
          ) : null}
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Hero */}
        <View style={styles.heroCard}>
          <ImageBackground
            source={require('../assets/treasure_hunt_bg_new.jpg')}
            style={styles.heroBg}
            imageStyle={styles.heroBgImage}
          >
            <LinearGradient
              colors={['rgba(252,249,242,0.65)', 'rgba(252,249,242,0.4)', 'rgba(252,249,242,0.15)', 'rgba(0,0,0,0.3)']}
              locations={[0, 0.4, 0.7, 1]}
              style={StyleSheet.absoluteFillObject}
            />
            <View style={styles.heroInner}>
              <View style={styles.heroTitleRow}>
                <Text style={styles.heroTreasure}>TREASURE</Text>
                <Text style={styles.heroHunt}>HUNT</Text>
              </View>

              <View style={styles.heroValues}>
                <View style={styles.heroValueCol}>
                  <View style={styles.heroValueIconWrap}>
                    <Icon name="location" size={18} color={TH.brown} />
                  </View>
                  <Text style={styles.heroValueText}>Discover{'\n'}Hidden Places</Text>
                </View>
                <View style={styles.heroValueCol}>
                  <View style={styles.heroValueIconWrap}>
                    <MaterialCommunityIcons name="puzzle-outline" size={18} color={TH.green} />
                  </View>
                  <Text style={styles.heroValueText}>Solve{'\n'}Clues</Text>
                </View>
                <View style={styles.heroValueCol}>
                  <View style={styles.heroValueIconWrap}>
                    <Image source={PALPOINT_ICON} style={styles.heroCoinIcon} resizeMode="contain" />
                  </View>
                  <Text style={styles.heroValueText}>Earn{'\n'}Rewards</Text>
                </View>
              </View>

              <View style={styles.comingSoonWrap}>
                <View style={styles.comingSoonRibbon}>
                  <Text style={styles.comingSoonText}>COMING SOON</Text>
                </View>
              </View>

              <NotifyButton label="Notify Me" notified={notified} onPress={handleNotify} />
            </View>
          </ImageBackground>
        </View>

        {/* Journey */}
        <View style={styles.block}>
          <SectionHeader title="Your Adventure Journey" />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.journeyScroll}
            nestedScrollEnabled
          >
            {JOURNEY.map((step, index) => (
              <View key={step.key} style={styles.journeyItem}>
                <View style={[styles.journeyStep, { width: journeyStepW }]}>
                  <JourneyIcon step={step} />
                  <Text style={styles.journeyTitle}>{step.title}</Text>
                  <Text style={styles.journeySub}>{step.sub}</Text>
                </View>
                {index < JOURNEY.length - 1 ? (
                  <View style={styles.journeyDash}>
                    <View style={styles.dashDot} />
                    <View style={styles.dashDot} />
                    <Icon name="chevron-forward" size={12} color={TH.textMuted} />
                  </View>
                ) : null}
              </View>
            ))}
          </ScrollView>
        </View>

        {/* Features */}
        <View style={styles.block}>
          <SectionHeader title="Why You'll Love It" />
          <View style={styles.featureGrid}>
            {FEATURES.map(item => (
              <View key={item.title} style={[styles.featureCard, { width: featureW }]}>
                <FeatureIcon item={item} />
                <View style={styles.featureCopy}>
                  <Text style={styles.featureTitle}>{item.title}</Text>
                  <Text style={styles.featureSub}>{item.sub}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* Promo banner */}
        <View style={styles.promoCard}>
          <Image source={require('../assets/wallet.png')} style={styles.promoChest} resizeMode="contain" />
          <View style={styles.promoCenter}>
            <Text style={styles.promoLineBrown}>Bigger Adventures.</Text>
            <Text style={styles.promoLineGreen}>Bigger Rewards.</Text>
            <Text style={styles.promoLineSub}>Across India.</Text>
            <NotifyButton label="Get Notified" compact notified={notified} onPress={handleNotify} />
          </View>
          <Image source={require('../assets/explore_map.png')} style={styles.promoMap} resizeMode="contain" />
        </View>


      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: TH.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 8,
    backgroundColor: TH.bg,
  },
  headerBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontFamily: SERIF,
    fontSize: 21,
    color: TH.brown,
    letterSpacing: 0.2,
  },
  notifBadge: {
    position: 'absolute',
    top: 6,
    right: 4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#E05252',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  notifBadgeText: {
    fontFamily: SANS_BOLD,
    fontSize: 9,
    color: '#FFF',
  },

  heroCard: {
    marginHorizontal: 16,
    marginTop: 4,
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: TH.border,
    ...TH.shadow,
  },
  heroBg: { minHeight: 360 },
  heroBgImage: { borderRadius: 22 },
  heroInner: {
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 22,
    alignItems: 'center',
  },
  heroTitleRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    marginBottom: 14,
  },
  heroTreasure: {
    fontFamily: SERIF,
    fontSize: 40,
    color: '#FFFFFF',
    letterSpacing: 1.5,
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  heroHunt: {
    fontFamily: SERIF,
    fontSize: 40,
    color: '#F9C22E', // Vibrant gold
    letterSpacing: 1.5,
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  heroValues: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: 4,
    marginBottom: 16,
  },
  heroValueCol: { flex: 1, alignItems: 'center' },
  heroValueIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.88)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
    borderWidth: 1,
    borderColor: TH.border,
  },
  heroCoinIcon: { width: 22, height: 22 },
  heroValueText: {
    fontFamily: SANS_BOLD,
    fontSize: 11,
    color: '#FFFFFF',
    textAlign: 'center',
    lineHeight: 14,
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  comingSoonWrap: { marginBottom: 14 },
  comingSoonRibbon: {
    backgroundColor: TH.brownDark,
    paddingHorizontal: 22,
    paddingVertical: 7,
    borderRadius: 6,
    transform: [{ rotate: '-2deg' }],
  },
  comingSoonText: {
    fontFamily: SANS_BOLD,
    fontSize: 11,
    color: '#FFF',
    letterSpacing: 1.4,
  },
  notifyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 26,
    minWidth: 210,
  },
  notifyBtnCompact: {
    minWidth: 0,
    alignSelf: 'flex-start',
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 20,
    marginTop: 8,
  },
  notifyBtnText: {
    fontFamily: SANS_BOLD,
    fontSize: 15,
    color: '#FFF',
  },
  notifyBtnTextCompact: { fontSize: 12 },

  block: { marginTop: 28, paddingHorizontal: 16 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 18,
    gap: 8,
  },
  sectionLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: TH.border,
  },
  sectionDiamond: {
    width: 7,
    height: 7,
    backgroundColor: TH.gold,
    transform: [{ rotate: '45deg' }],
  },
  sectionTitle: {
    fontFamily: SERIF,
    fontSize: 18,
    color: TH.brown,
  },

  journeyScroll: { paddingRight: 8, alignItems: 'center' },
  journeyItem: { flexDirection: 'row', alignItems: 'center' },
  journeyStep: { alignItems: 'center', paddingHorizontal: 2 },
  journeyCircle: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.65)',
    ...TH.shadow,
  },
  palpointIcon: { width: 26, height: 26 },
  journeyTitle: {
    fontFamily: SANS_BOLD,
    fontSize: 11,
    color: TH.text,
    textAlign: 'center',
    marginBottom: 3,
  },
  journeySub: {
    fontFamily: SANS,
    fontSize: 9,
    color: TH.textSecondary,
    textAlign: 'center',
    lineHeight: 12,
  },
  journeyDash: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginHorizontal: 2,
    marginBottom: 28,
  },
  dashDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: TH.textMuted,
  },

  featureGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  featureCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: TH.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: TH.border,
    padding: 12,
    ...TH.shadow,
  },
  featureIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureCopy: { flex: 1, minWidth: 0 },
  featureTitle: {
    fontFamily: SANS_BOLD,
    fontSize: 12,
    color: TH.text,
    marginBottom: 3,
  },
  featureSub: {
    fontFamily: SANS,
    fontSize: 10,
    color: TH.textSecondary,
    lineHeight: 13,
  },

  promoCard: {
    marginHorizontal: 16,
    marginTop: 28,
    backgroundColor: TH.cream,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: TH.border,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
    ...TH.shadow,
  },
  promoChest: { width: 52, height: 52 },
  promoCenter: { flex: 1, paddingHorizontal: 8 },
  promoLineBrown: {
    fontFamily: SERIF,
    fontSize: 16,
    color: TH.brown,
    lineHeight: 20,
  },
  promoLineGreen: {
    fontFamily: SERIF,
    fontSize: 16,
    color: TH.greenBright,
    lineHeight: 20,
  },
  promoLineSub: {
    fontFamily: SANS_SEMI,
    fontSize: 12,
    color: TH.textSecondary,
    marginBottom: 4,
  },
  promoMap: { width: 68, height: 68, opacity: 0.95 },

  footerCard: {
    marginHorizontal: 16,
    marginTop: 28,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#D4E4C8',
    minHeight: 130,
  },
  footerBg: { minHeight: 130, justifyContent: 'flex-end' },
  footerBgImage: { borderRadius: 20 },
  footerPathRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    flex: 1,
    paddingTop: 20,
  },
  footerPin: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: TH.journey.treasure,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFF',
  },
  signpost: {
    position: 'absolute',
    right: 14,
    bottom: 12,
    alignItems: 'flex-end',
    gap: 3,
  },
  signpostPlank: {
    backgroundColor: '#6B4423',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: '#523318',
    minWidth: 68,
    alignItems: 'center',
  },
  signpostText: {
    fontFamily: SANS_SEMI,
    fontSize: 9,
    color: '#FFF',
  },
});
