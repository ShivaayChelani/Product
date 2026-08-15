import React, { useCallback } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  StatusBar,
  Alert,
  Linking,
  Platform,
  Text,
  TouchableOpacity,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useUserContext } from '../context/UserContext';
import { useUserAppSettings } from '../features/settings/hooks/useUserAppSettings';
import { clearAppCaches } from '../features/settings/utils/storageManager';
import { scale, verticalScale, fontScale, radiusScale } from '../design/responsive';

export default function SettingsScreen({
  navigation: navigationProp,
  onLogout,
}: {
  navigation?: any;
  onLogout?: () => void;
}) {
  const navigation = useNavigation<any>();
  const nav = navigationProp || navigation;
  const insets = useSafeAreaInsets();
  const { isAuthenticated, isGuest, onLogout: contextLogout, confirmLogout } = useUserContext();
  const { data: appSettings } = useUserAppSettings(isAuthenticated);

  const openLegal = useCallback(
    (type: string, title: string) => {
      nav.navigate('LegalDocument', { type, title });
    },
    [nav],
  );

  const handleSignOut = useCallback(() => {
    confirmLogout();
  }, [confirmLogout]);

  const handleWhatsApp = () => {
    const url = 'https://wa.me/917089812343';
    Linking.openURL(url).catch(() => {
      Alert.alert('Error', 'Could not open WhatsApp.');
    });
  };

  const handleSave = () => {
    Alert.alert('Saved', 'Your preferences have been saved successfully.');
    nav.goBack();
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      
      <ScrollView 
        showsVerticalScrollIndicator={false} 
        contentContainerStyle={[styles.scrollContent, { paddingTop: Math.max(insets.top, 24), paddingBottom: insets.bottom + 32 }]}
      >
        {/* Header */}
        <View style={styles.header}>
          {/* Faded Background Illustration */}
          <Image 
            source={require('../assets/explore_map.png')} 
            style={styles.headerBg}
            resizeMode="cover"
          />
          <View style={styles.headerContent}>
            <TouchableOpacity onPress={() => nav.goBack()} style={styles.backBtn} hitSlop={12}>
              <Icon name="arrow-back" size={24} color="#6B3A12" />
            </TouchableOpacity>
            <View style={styles.headerTextWrap}>
              <Text style={styles.title}>Settings</Text>
              <Text style={styles.subtitle}>Manage your account and app preferences</Text>
            </View>
          </View>
        </View>

        {/* SECTION 1: ACCOUNT */}
        <Text style={styles.sectionTitle}>ACCOUNT</Text>
        <View style={styles.card}>
          {!isGuest ? (
            <>
              <TouchableOpacity style={styles.row} onPress={() => nav.navigate('ChangePassword')}>
                <View style={[styles.iconBox, { backgroundColor: '#FFF5E1' }]}>
                  <Icon name="lock-closed-outline" size={20} color="#C79A4B" />
                </View>
                <View style={styles.rowContent}>
                  <Text style={styles.rowTitle}>Change Password</Text>
                  <Text style={styles.rowSubtitle}>Update your account password</Text>
                </View>
                <Icon name="chevron-forward" size={18} color="#C4A484" />
              </TouchableOpacity>

              <TouchableOpacity style={styles.row} onPress={() => nav.navigate('PrivacySettings')}>
                <View style={[styles.iconBox, { backgroundColor: '#ECFDF5' }]}>
                  <Icon name="shield-checkmark-outline" size={20} color="#059669" />
                </View>
                <View style={styles.rowContent}>
                  <Text style={styles.rowTitle}>Privacy Settings</Text>
                  <Text style={styles.rowSubtitle}>Manage your privacy preferences</Text>
                </View>
                <Icon name="chevron-forward" size={18} color="#C4A484" />
              </TouchableOpacity>
            </>
          ) : null}

          <TouchableOpacity style={[styles.row, isGuest && { borderBottomWidth: 0 }]} onPress={() => nav.navigate('NotificationSettings')}>
            <View style={[styles.iconBox, { backgroundColor: '#FFF5E1' }]}>
              <Icon name="notifications-outline" size={20} color="#C79A4B" />
            </View>
            <View style={styles.rowContent}>
              <Text style={styles.rowTitle}>Notifications</Text>
              <Text style={styles.rowSubtitle}>Manage push, email & alert preferences</Text>
            </View>
            <Icon name="chevron-forward" size={18} color="#C4A484" />
          </TouchableOpacity>

          {!isGuest ? (
            <TouchableOpacity style={[styles.row, { borderBottomWidth: 0 }]} onPress={() => nav.navigate('DeleteAccount')}>
              <View style={[styles.iconBox, { backgroundColor: '#FEF2F2' }]}>
                <Icon name="trash-outline" size={20} color="#DC2626" />
              </View>
              <View style={styles.rowContent}>
                <Text style={[styles.rowTitle, { color: '#DC2626' }]}>Delete Account</Text>
                <Text style={styles.rowSubtitle}>Permanently delete your account</Text>
              </View>
              <Icon name="chevron-forward" size={18} color="#C4A484" />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* SECTION 3: SUPPORT */}
        <Text style={styles.sectionTitle}>SUPPORT</Text>
        <View style={styles.card}>
          <TouchableOpacity style={styles.row} onPress={() => nav.navigate('LegalHub')}>
            <View style={[styles.iconBox, { backgroundColor: '#F3E8FF' }]}>
              <Icon name="document-text-outline" size={20} color="#9333EA" />
            </View>
            <View style={styles.rowContent}>
              <Text style={styles.rowTitle}>Terms & Conditions</Text>
              <Text style={styles.rowSubtitle}>Read our terms and conditions</Text>
            </View>
            <Icon name="chevron-forward" size={18} color="#C4A484" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.row} onPress={() => Linking.openURL('mailto:support@palsafar.com')}>
            <View style={[styles.iconBox, { backgroundColor: '#ECFDF5' }]}>
              <Icon name="headset-outline" size={20} color="#059669" />
            </View>
            <View style={styles.rowContent}>
              <Text style={styles.rowTitle}>Contact Support</Text>
              <Text style={styles.rowSubtitle}>Get help from our support team</Text>
            </View>
            <Icon name="chevron-forward" size={18} color="#C4A484" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.row} onPress={() => nav.navigate('Feedback', { category: 'general', title: 'Feedback' })}>
            <View style={[styles.iconBox, { backgroundColor: '#EFF6FF' }]}>
              <Icon name="chatbubble-ellipses-outline" size={20} color="#2563EB" />
            </View>
            <View style={styles.rowContent}>
              <Text style={styles.rowTitle}>Feedback</Text>
              <Text style={styles.rowSubtitle}>Share your feedback with us</Text>
            </View>
            <Icon name="chevron-forward" size={18} color="#C4A484" />
          </TouchableOpacity>

          <TouchableOpacity style={[styles.row, { borderBottomWidth: 0 }]} onPress={() => openLegal('ABOUT_US', 'About PalSafar')}>
            <View style={[styles.iconBox, { backgroundColor: '#FEF2F2' }]}>
              <Icon name="information-circle-outline" size={20} color="#DC2626" />
            </View>
            <View style={styles.rowContent}>
              <Text style={styles.rowTitle}>About PalSafar</Text>
              <Text style={styles.rowSubtitle}>App info, terms & policies</Text>
            </View>
            <Icon name="chevron-forward" size={18} color="#C4A484" />
          </TouchableOpacity>
        </View>


        {/* SECTION 5: Security Status Card */}
        <View style={styles.securityCard}>
          <View style={styles.securityIconBox}>
            <Icon name="shield-checkmark-outline" size={20} color="#059669" />
          </View>
          <View style={styles.securityContent}>
            <Text style={styles.securityTitle}>Your account is secure</Text>
            <Text style={styles.securitySubtitle}>We keep your data safe and protected</Text>
          </View>
          <View style={styles.securityCheckBox}>
            <Icon name="checkmark" size={16} color="#059669" />
          </View>
        </View>

        <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>


    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  scrollContent: {
    paddingHorizontal: scale(16),
  },
  header: {
    position: 'relative',
    paddingVertical: verticalScale(12),
    marginBottom: verticalScale(24),
    minHeight: verticalScale(120),
    justifyContent: 'center',
  },
  headerBg: {
    position: 'absolute',
    right: -40,
    top: -40,
    width: 250,
    height: 250,
    opacity: 0.1,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 16,
    zIndex: 1,
  },
  backBtn: {
    width: scale(48),
    height: scale(48),
    borderRadius: radiusScale(24),
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E8D5C4',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
    marginTop: verticalScale(2),
  },
  headerTextWrap: {
    flex: 1,
  },
  title: {
    fontSize: fontScale(26),
    fontWeight: '800',
    color: '#6B3A12',
    letterSpacing: -0.5,
    marginBottom: verticalScale(4),
  },
  subtitle: {
    fontSize: fontScale(14),
    color: '#8B735F',
    fontWeight: '500',
    lineHeight: fontScale(20),
    paddingRight: scale(30),
  },
  sectionTitle: {
    fontSize: fontScale(12),
    fontWeight: '800',
    color: '#6B3A12',
    letterSpacing: 1.2,
    marginBottom: verticalScale(10),
    marginTop: verticalScale(8),
    paddingHorizontal: scale(4),
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: radiusScale(20),
    borderWidth: 1,
    borderColor: '#E8D5C4',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 12,
    elevation: 2,
    marginBottom: verticalScale(24),
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: scale(16),
    borderBottomWidth: 1,
    borderBottomColor: '#F0E6D8',
    gap: scale(14),
  },
  iconBox: {
    width: scale(40),
    height: scale(40),
    borderRadius: radiusScale(20),
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowContent: {
    flex: 1,
  },
  rowTitle: {
    fontSize: fontScale(15),
    fontWeight: '700',
    color: '#2D1E12',
    marginBottom: verticalScale(2),
  },
  rowSubtitle: {
    fontSize: fontScale(13),
    color: '#8B735F',
  },
  rowValueText: {
    fontSize: fontScale(13),
    fontWeight: '600',
    color: '#8B735F',
    marginRight: scale(4),
  },
  promoCard: {
    backgroundColor: '#F6EEDB',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E8D5C4',
    marginBottom: 16,
    flexDirection: 'column',
    gap: 16,
  },
  promoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  promoIconBox: {
    position: 'relative',
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FDF8F3',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E8D5C4',
  },
  promoSparkle1: {
    position: 'absolute',
    top: -2,
    right: -2,
  },
  promoSparkle2: {
    position: 'absolute',
    bottom: 4,
    left: 0,
  },
  promoContent: {
    flex: 1,
  },
  promoTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#2D1E12',
    marginBottom: 4,
  },
  promoSubtitle: {
    fontSize: 13,
    color: '#654C37',
    lineHeight: 18,
  },
  promoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4A2A0C',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 14,
    gap: 6,
  },
  promoBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  securityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAF5',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E8F3EC',
    marginBottom: 32,
    gap: 14,
  },
  securityIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  securityContent: {
    flex: 1,
  },
  securityTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2D1E12',
    marginBottom: 2,
  },
  securitySubtitle: {
    fontSize: 12,
    color: '#654C37',
  },
  securityCheckBox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#D1FAE5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  signOutBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    marginBottom: 40,
  },
  signOutText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#DC2626',
  },
  stickyFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingTop: 16,
    backgroundColor: '#FFFFFF',
  },
  saveBtn: {
    height: 58,
    backgroundColor: '#4A2A0C',
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 4,
  },
  saveBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
});
