import React, { useMemo } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  StatusBar,
  Alert,
  Linking,
  Text,
  TouchableOpacity,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import { useUserContext } from '../context/UserContext';
import type { LegalDocumentType } from '../services/api/legal';

interface LegalHubScreenProps {
  onBack?: () => void;
  onSelect?: (type: LegalDocumentType, label: string) => void;
}

export default function LegalHubScreen({ onBack, onSelect }: LegalHubScreenProps) {
  const insets = useSafeAreaInsets();
  const { user } = useUserContext();
  
  const mode = String(user?.activeMode || user?.activeRole || 'USER').toUpperCase();
  const isVendor = mode === 'VENDOR';
  const isCreator = mode === 'CONTENT_CREATOR' || mode === 'CREATOR';

  const handleWhatsApp = () => {
    const url = 'https://wa.me/917089812343';
    Linking.openURL(url).catch(() => {
      Alert.alert('Error', 'Could not open WhatsApp.');
    });
  };

  const handleReadAll = () => {
    Alert.alert('Read All Policies', 'You have acknowledged the PalSafar terms and policies.');
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
          <Image 
            source={require('../assets/explore_map.png')} 
            style={styles.headerBg}
            resizeMode="cover"
          />
          <View style={styles.headerContent}>
            <TouchableOpacity onPress={onBack} style={styles.backBtn} hitSlop={12}>
              <Icon name="arrow-back" size={24} color="#6B3A12" />
            </TouchableOpacity>
            <View style={styles.headerTextWrap}>
              <Text style={styles.title}>Legal & Policies</Text>
              <Text style={styles.subtitle}>Everything you need to know about using PalSafar safely and responsibly.</Text>
            </View>
          </View>
        </View>

        {/* SECTION 1: Legal Documents */}
        <Text style={styles.sectionTitle}>LEGAL DOCUMENTS</Text>
        <View style={styles.card}>
          <TouchableOpacity style={styles.row} onPress={() => onSelect?.('PRIVACY_POLICY', 'Privacy Policy')}>
            <View style={[styles.iconBox, { backgroundColor: '#F3E4D6' }]}>
              <Icon name="shield-checkmark-outline" size={20} color="#6B3A12" />
            </View>
            <View style={styles.rowContent}>
              <Text style={styles.rowTitle}>Privacy Policy</Text>
              <Text style={styles.rowSubtitle}>Learn how we collect and protect your information.</Text>
            </View>
            <Icon name="chevron-forward" size={18} color="#C4A484" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.row} onPress={() => onSelect?.('TERMS_CONDITIONS', 'Terms & Conditions')}>
            <View style={[styles.iconBox, { backgroundColor: '#EBF4FF' }]}>
              <Icon name="document-text-outline" size={20} color="#3B82F6" />
            </View>
            <View style={styles.rowContent}>
              <Text style={styles.rowTitle}>Terms & Conditions</Text>
              <Text style={styles.rowSubtitle}>Rules and conditions for using PalSafar.</Text>
            </View>
            <Icon name="chevron-forward" size={18} color="#C4A484" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.row} onPress={() => onSelect?.('REWARDS_POLICY', 'Rewards Policy')}>
            <View style={[styles.iconBox, { backgroundColor: '#FFF5E1' }]}>
              <Icon name="gift-outline" size={20} color="#C79A4B" />
            </View>
            <View style={styles.rowContent}>
              <Text style={styles.rowTitle}>Rewards Policy</Text>
              <Text style={styles.rowSubtitle}>Understand points, rewards and redemption.</Text>
            </View>
            <Icon name="chevron-forward" size={18} color="#C4A484" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.row} onPress={() => onSelect?.('COMMUNITY_GUIDELINES', 'Community Guidelines')}>
            <View style={[styles.iconBox, { backgroundColor: '#F3E8FF' }]}>
              <Icon name="people-outline" size={20} color="#7E22CE" />
            </View>
            <View style={styles.rowContent}>
              <Text style={styles.rowTitle}>Community Guidelines</Text>
              <Text style={styles.rowSubtitle}>Help us keep PalSafar safe for everyone.</Text>
            </View>
            <Icon name="chevron-forward" size={18} color="#C4A484" />
          </TouchableOpacity>

          <TouchableOpacity style={[styles.row, { borderBottomWidth: 0 }]} onPress={() => onSelect?.('REFUND_POLICY', 'Refund Policy')}>
            <View style={[styles.iconBox, { backgroundColor: '#ECFDF5' }]}>
              <Icon name="card-outline" size={20} color="#059669" />
            </View>
            <View style={styles.rowContent}>
              <Text style={styles.rowTitle}>Refund & Cancellation Policy</Text>
              <Text style={styles.rowSubtitle}>Booking, cancellation and refund information.</Text>
            </View>
            <Icon name="chevron-forward" size={18} color="#C4A484" />
          </TouchableOpacity>
        </View>

        {/* SECTION 2: For Business Partners (Conditionally rendered) */}
        {(isVendor || isCreator) && (
          <>
            <Text style={styles.sectionTitle}>FOR BUSINESS PARTNERS</Text>
            <View style={styles.card}>
              {isVendor && (
                <TouchableOpacity style={[styles.row, { borderBottomWidth: 0 }]} onPress={() => onSelect?.('VENDOR_TERMS', 'Vendor Terms')}>
                  <View style={[styles.iconBox, { backgroundColor: '#FDF2E9' }]}>
                    <Icon name="storefront-outline" size={20} color="#9A3412" />
                  </View>
                  <View style={styles.rowContent}>
                    <Text style={styles.rowTitle}>Vendor Terms & Conditions</Text>
                    <Text style={styles.rowSubtitle}>Terms for businesses and verified vendors.</Text>
                  </View>
                  <Icon name="chevron-forward" size={18} color="#C4A484" />
                </TouchableOpacity>
              )}
              {isCreator && (
                <TouchableOpacity style={[styles.row, { borderBottomWidth: 0 }]} onPress={() => onSelect?.('CREATOR_TERMS', 'Creator Terms')}>
                  <View style={[styles.iconBox, { backgroundColor: '#FDF2E9' }]}>
                    <Icon name="videocam-outline" size={20} color="#9A3412" />
                  </View>
                  <View style={styles.rowContent}>
                    <Text style={styles.rowTitle}>Creator Terms & Conditions</Text>
                    <Text style={styles.rowSubtitle}>Terms for content creators and affiliates.</Text>
                  </View>
                  <Icon name="chevron-forward" size={18} color="#C4A484" />
                </TouchableOpacity>
              )}
            </View>
          </>
        )}

        {/* SECTION 3: Company */}
        <Text style={styles.sectionTitle}>COMPANY</Text>
        <View style={styles.card}>
          <TouchableOpacity style={styles.row} onPress={() => onSelect?.('ABOUT_US', 'About Us')}>
            <View style={[styles.iconBox, { backgroundColor: '#EFF6FF' }]}>
              <Icon name="information-circle-outline" size={20} color="#2563EB" />
            </View>
            <View style={styles.rowContent}>
              <Text style={styles.rowTitle}>About PalSafar</Text>
              <Text style={styles.rowSubtitle}>Learn more about our mission and vision.</Text>
            </View>
            <Icon name="chevron-forward" size={18} color="#C4A484" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.row} onPress={() => onSelect?.('CONTACT_INFO', 'Contact Information')}>
            <View style={[styles.iconBox, { backgroundColor: '#F6EEDB' }]}>
              <Icon name="mail-outline" size={20} color="#6B3A12" />
            </View>
            <View style={styles.rowContent}>
              <Text style={styles.rowTitle}>Contact Us</Text>
              <Text style={styles.rowSubtitle}>Email, phone and office information.</Text>
            </View>
            <Icon name="chevron-forward" size={18} color="#C4A484" />
          </TouchableOpacity>

          <TouchableOpacity style={[styles.row, { borderBottomWidth: 0 }]} onPress={() => onSelect?.('FAQ', 'FAQ')}>
            <View style={[styles.iconBox, { backgroundColor: '#FEF2F2' }]}>
              <Icon name="help-circle-outline" size={20} color="#DC2626" />
            </View>
            <View style={styles.rowContent}>
              <Text style={styles.rowTitle}>Help Center</Text>
              <Text style={styles.rowSubtitle}>FAQs and support articles.</Text>
            </View>
            <Icon name="chevron-forward" size={18} color="#C4A484" />
          </TouchableOpacity>
        </View>



        {/* SECTION 5: Security Status Banner */}
        <View style={styles.securityCard}>
          <View style={styles.securityIconBox}>
            <Icon name="shield-checkmark-outline" size={20} color="#059669" />
          </View>
          <View style={styles.securityContent}>
            <Text style={styles.securityTitle}>Your privacy matters</Text>
            <Text style={styles.securitySubtitle}>PalSafar protects your personal information using secure encryption and industry best practices.</Text>
          </View>
          <View style={styles.securityCheckBox}>
            <Icon name="checkmark" size={16} color="#059669" />
          </View>
        </View>

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
    paddingHorizontal: 16,
  },
  header: {
    position: 'relative',
    paddingVertical: 12,
    marginBottom: 24,
    minHeight: 120,
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
    width: 48,
    height: 48,
    borderRadius: 24,
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
    marginTop: 2,
  },
  headerTextWrap: {
    flex: 1,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: '#6B3A12',
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#8B735F',
    fontWeight: '500',
    lineHeight: 20,
    paddingRight: 10,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#6B3A12',
    letterSpacing: 1.2,
    marginBottom: 10,
    marginTop: 8,
    paddingHorizontal: 4,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E8D5C4',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 12,
    elevation: 2,
    marginBottom: 24,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0E6D8',
    gap: 14,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowContent: {
    flex: 1,
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#2D1E12',
    marginBottom: 2,
  },
  rowSubtitle: {
    fontSize: 13,
    color: '#8B735F',
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
    marginBottom: 40,
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
    lineHeight: 16,
  },
  securityCheckBox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#D1FAE5',
    alignItems: 'center',
    justifyContent: 'center',
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
