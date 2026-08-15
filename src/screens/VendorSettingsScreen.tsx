import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  Alert,
  ActivityIndicator,
  Switch,
  Image,
  KeyboardAvoidingView,
  Platform,
  Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBottomSafePadding } from '../design/responsive';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Geolocation from 'react-native-geolocation-service';
import { launchImageLibrary } from 'react-native-image-picker';
import Icon from 'react-native-vector-icons/Ionicons';
import { useDataContext } from '../context/DataContext';
import { uploadApi } from '../services/api/upload';
import { copyToClipboard } from '../utils/clipboard';
import { useVendorScreenInsets, VendorUI } from '../design/vendorLayout';
import type { RootStackParamList } from '../navigation/types';

const CATEGORIES = [
  'cafe', 'restaurant', 'hotel', 'homestay', 'guide',
  'bike_rental', 'car_rental', 'boating', 'adventure', 'tour_experience',
  'event_organizer',
] as const;

function formatCategory(cat: string) {
  return cat.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function VendorSettingsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const contentPadBottom = useBottomSafePadding(24);
  const vendorInsets = useVendorScreenInsets({ withTabBar: false });
  const { currentVendor, updateVendorProfile } = useDataContext();

  const [businessName, setBusinessName] = useState('');
  const [phone, setPhone] = useState('');
  const [category, setCategory] = useState('');
  const [city, setCity] = useState('');
  const [stateName, setStateName] = useState('');
  const [address, setAddress] = useState('');
  const [openingHours, setOpeningHours] = useState('');
  const [website, setWebsite] = useState('');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState<string | undefined>();
  const [latitude, setLatitude] = useState<number | undefined>();
  const [longitude, setLongitude] = useState<number | undefined>();
  const [showOnMap, setShowOnMap] = useState(true);
  const [showContact, setShowContact] = useState(true);
  const [showWebsite, setShowWebsite] = useState(true);
  const [showImages, setShowImages] = useState(true);
  const [showOffers, setShowOffers] = useState(true);
  const [showReels, setShowReels] = useState(true);
  const [showNavigation, setShowNavigation] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  useEffect(() => {
    if (!currentVendor) return;
    setBusinessName(currentVendor.businessName || '');
    setPhone(currentVendor.phone || '');
    setCategory(currentVendor.category || '');
    setCity(currentVendor.city || '');
    setStateName(currentVendor.state || '');
    setAddress(currentVendor.address || '');
    setOpeningHours(currentVendor.openingHours || currentVendor.operatingHours || '');
    setWebsite(currentVendor.website || '');
    setDescription(currentVendor.description || '');
    setImageUrl(currentVendor.imageUrl);
    setLatitude(currentVendor.latitude);
    setLongitude(currentVendor.longitude);
    setShowOnMap(currentVendor.showOnMap !== false);
    setShowContact(currentVendor.showContact !== false);
    setShowWebsite(currentVendor.showWebsite !== false);
    setShowImages(currentVendor.showImages !== false);
    setShowOffers(currentVendor.showOffers !== false);
    setShowReels(currentVendor.showReels !== false);
    setShowNavigation(currentVendor.showNavigation !== false);
  }, [currentVendor]);

  const canSave = useMemo(() => {
    return businessName.trim().length >= 2
      && phone.trim().length >= 10
      && address.trim().length > 0
      && city.trim().length > 0
      && stateName.trim().length > 0
      && !!category;
  }, [businessName, phone, address, city, stateName, category]);

  const pickImage = async () => {
    try {
      const result = await launchImageLibrary({ mediaType: 'photo', quality: 0.8 });
      const asset = result.assets?.[0];
      if (!asset?.uri) return;
      setUploading(true);
      const uploaded = await uploadApi.uploadImage(asset.uri);
      const url = (uploaded as any)?.url || (uploaded as any)?.secure_url || (uploaded as any)?.data?.url;
      if (!url) throw new Error('Upload failed');
      setImageUrl(url);
    } catch (err: any) {
      Alert.alert('Upload failed', err?.message || 'Could not upload image.');
    } finally {
      setUploading(false);
    }
  };

  const useMyLocation = () => {
    setLocating(true);
    Geolocation.getCurrentPosition(
      (pos) => {
        setLatitude(pos.coords.latitude);
        setLongitude(pos.coords.longitude);
        setLocating(false);
      },
      (err) => {
        setLocating(false);
        Alert.alert('Location unavailable', err.message || 'Enable GPS and try again.');
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 },
    );
  };

  const handleCopyCode = async () => {
    if (!currentVendor?.vendorCode) return;
    await copyToClipboard(currentVendor.vendorCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleContactWhatsApp = () => {
    const url = 'https://wa.me/917089812343?text=Hello%20PalSafar%20Team,%20I%20want%20a%20website%20for%20my%20business.';
    Linking.openURL(url).catch(() => {
      Alert.alert('Error', 'Could not open WhatsApp.');
    });
  };

  const handleSupportWhatsApp = () => {
    const url = 'https://wa.me/917089812343';
    Linking.openURL(url).catch(() => {
      Alert.alert('Error', 'Could not open WhatsApp.');
    });
  };

  const handleSave = async () => {
    if (!canSave) {
      Alert.alert('Missing details', 'Please fill business name, phone, category, address, city, and state.');
      return;
    }
    setSaving(true);
    try {
      await updateVendorProfile({
        businessName: businessName.trim(),
        phone: phone.trim(),
        category: category as any,
        city: city.trim(),
        state: stateName.trim(),
        address: address.trim(),
        openingHours: openingHours.trim() || undefined,
        website: website.trim() || undefined,
        description: description.trim() || undefined,
        imageUrl,
        latitude,
        longitude,
        showOnMap,
        showContact,
        showWebsite,
        showImages,
        showOffers,
        showReels,
        showNavigation,
      });
      Alert.alert('Saved', 'Your business details were updated.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (err: any) {
      Alert.alert('Update failed', err?.message || 'Could not save business details.');
    } finally {
      setSaving(false);
    }
  };

  if (!currentVendor) {
    return (
      <View style={[styles.container, { paddingTop: Math.max(insets.top, 16) }]}>
        <StatusBar barStyle="dark-content" backgroundColor={VendorUI.colors.bg} />
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={12}>
            <Icon name="arrow-back" size={22} color={VendorUI.colors.primaryDark} />
          </TouchableOpacity>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>VENDOR WORKSPACE</Text>
            <Text style={styles.title}>Business settings</Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: Math.max(insets.top, 16) }]}>
      <View style={{ flex: 1 }}>
        <StatusBar barStyle="dark-content" backgroundColor={VendorUI.colors.bg} />
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={12}>
            <Icon name="arrow-back" size={22} color={VendorUI.colors.primaryDark} />
          </TouchableOpacity>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>VENDOR WORKSPACE</Text>
            <Text style={styles.title}>Business settings</Text>
            <Text style={styles.subtitle}>Manage your business profile and visibility on PalSafar.</Text>
          </View>
        </View>

        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView
            contentContainerStyle={[styles.content, { paddingBottom: contentPadBottom + 120 }]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* 1. Business Profile */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Icon name="storefront" size={20} color={VendorUI.colors.primaryDark} />
                <Text style={styles.cardTitle}>Business Profile</Text>
              </View>

              <TouchableOpacity style={styles.coverPhotoContainer} onPress={pickImage} disabled={uploading}>
                {imageUrl ? (
                  <Image source={{ uri: imageUrl }} style={styles.coverPhoto} />
                ) : (
                  <View style={styles.coverPhotoPlaceholder}>
                    <Icon name="camera-outline" size={28} color={VendorUI.colors.primary} />
                  </View>
                )}
                <View style={styles.coverPhotoOverlay}>
                  <Icon name="camera" size={16} color="#473323" />
                  <Text style={styles.coverPhotoText}>{uploading ? 'Uploading...' : 'Change cover'}</Text>
                </View>
              </TouchableOpacity>

              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>Business name</Text>
                <TextInput style={styles.input} value={businessName} onChangeText={setBusinessName} placeholder="Your shop name" placeholderTextColor={VendorUI.colors.textMuted} />
              </View>

              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>Phone</Text>
                <TextInput style={styles.input} value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="10-digit phone" placeholderTextColor={VendorUI.colors.textMuted} />
              </View>

              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>Category</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                  {CATEGORIES.map((cat) => (
                    <TouchableOpacity
                      key={cat}
                      style={[styles.chip, category === cat && styles.chipActive]}
                      onPress={() => setCategory(cat)}
                    >
                      <Text style={[styles.chipText, category === cat && styles.chipTextActive]}>
                        {formatCategory(cat)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              {currentVendor.vendorCode ? (
                <View style={styles.vendorCodeBox}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.fieldLabel}>Vendor code</Text>
                    <Text style={styles.codeValue} selectable>{currentVendor.vendorCode}</Text>
                  </View>
                  <TouchableOpacity style={styles.copyCodeBtn} onPress={handleCopyCode}>
                    <Icon name={copiedCode ? 'checkmark' : 'copy-outline'} size={16} color={VendorUI.colors.primaryDark} />
                    <Text style={styles.copyCodeText}>{copiedCode ? 'Copied' : 'Copy code'}</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>

            {/* 2. Business Location */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Icon name="location" size={20} color={VendorUI.colors.primaryDark} />
                <Text style={styles.cardTitle}>Business Location</Text>
              </View>

              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>Address</Text>
                <TextInput style={[styles.input, styles.multiline]} value={address} onChangeText={setAddress} multiline placeholder="Street address" placeholderTextColor={VendorUI.colors.textMuted} />
              </View>

              <View style={styles.row}>
                <View style={[styles.fieldRow, { flex: 1, marginRight: 8 }]}>
                  <Text style={styles.fieldLabel}>City</Text>
                  <TextInput style={styles.input} value={city} onChangeText={setCity} placeholder="City" placeholderTextColor={VendorUI.colors.textMuted} />
                </View>
                <View style={[styles.fieldRow, { flex: 1, marginLeft: 8 }]}>
                  <Text style={styles.fieldLabel}>State</Text>
                  <TextInput style={styles.input} value={stateName} onChangeText={setStateName} placeholder="State" placeholderTextColor={VendorUI.colors.textMuted} />
                </View>
              </View>

              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>GPS Location</Text>
                <Text style={styles.gpsText}>
                  {latitude != null && longitude != null ? `${latitude.toFixed(5)}, ${longitude.toFixed(5)}` : 'Not set'}
                </Text>
              </View>

              <TouchableOpacity style={styles.detectLocationBtn} onPress={useMyLocation} disabled={locating}>
                {locating ? <ActivityIndicator color="#fff" /> : (
                  <>
                    <Icon name="locate" size={18} color="#fff" />
                    <Text style={styles.detectLocationText}>Detect My Location</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>

            {/* 3. Business Information */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Icon name="information-circle" size={20} color={VendorUI.colors.primaryDark} />
                <Text style={styles.cardTitle}>Business Information</Text>
              </View>

              <View style={styles.row}>
                <View style={[styles.fieldRow, { flex: 1, marginRight: 8 }]}>
                  <Text style={styles.fieldLabel}>Opening hours</Text>
                  <TextInput style={styles.input} value={openingHours} onChangeText={setOpeningHours} placeholder="e.g. 9 AM – 9 PM" placeholderTextColor={VendorUI.colors.textMuted} />
                </View>
                <View style={[styles.fieldRow, { flex: 1, marginLeft: 8 }]}>
                  <Text style={styles.fieldLabel}>Website</Text>
                  <TextInput style={styles.input} value={website} onChangeText={setWebsite} autoCapitalize="none" placeholder="https://" placeholderTextColor={VendorUI.colors.textMuted} />
                </View>
              </View>

              {/* Promo Info Card */}
              <View style={styles.promoWebsiteCard}>
                <View style={styles.promoWebsiteIcon}>
                  <Icon name="globe-outline" size={24} color="#876241" />
                </View>
                <View style={styles.promoWebsiteContent}>
                  <Text style={styles.promoWebsiteTitle}>Need a website for your business?</Text>
                  <Text style={styles.promoWebsiteDesc}>Get a professional business website from the PalSafar team and grow your online presence.</Text>
                  <TouchableOpacity style={styles.promoWebsiteBtn} onPress={handleContactWhatsApp}>
                    <Icon name="logo-whatsapp" size={16} color="#fff" />
                    <Text style={styles.promoWebsiteBtnText}>Contact on WhatsApp</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>Description</Text>
                <TextInput style={[styles.input, styles.multiline]} value={description} onChangeText={setDescription} multiline placeholder="Tell tourists about your business" placeholderTextColor={VendorUI.colors.textMuted} />
              </View>
            </View>

            {/* 4. Listing Visibility */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Icon name="eye" size={20} color={VendorUI.colors.primaryDark} />
                <Text style={styles.cardTitle}>Listing Visibility</Text>
              </View>

              <View style={styles.gridContainer}>
                {[
                  { label: 'Show on Map', desc: 'Show your business on PalSafar map.', icon: 'map', value: showOnMap, set: setShowOnMap },
                  { label: 'Show Phone', desc: 'Allow customers to call you directly.', icon: 'call', value: showContact, set: setShowContact },
                  { label: 'Show Website', desc: 'Display your website on your profile.', icon: 'globe', value: showWebsite, set: setShowWebsite },
                  { label: 'Show Gallery', desc: 'Show photos of your business to customers.', icon: 'images', value: showImages, set: setShowImages },
                  { label: 'Show Offers', desc: 'Display active offers on your profile.', icon: 'pricetags', value: showOffers, set: setShowOffers },
                  { label: 'Show Reels', desc: 'Show your reels on your profile.', icon: 'play-circle', value: showReels, set: setShowReels },
                  { label: 'Show Navigation', desc: 'Allow customers to navigate to your location.', icon: 'navigate', value: showNavigation, set: setShowNavigation },
                ].map((row) => (
                  <View key={row.label} style={styles.gridCard}>
                    <View style={styles.gridCardTop}>
                      <View style={styles.iconBox}>
                        <Icon name={row.icon} size={18} color="#876241" />
                      </View>
                      <Switch
                        value={row.value}
                        onValueChange={row.set}
                        trackColor={{ false: VendorUI.colors.border, true: '#574130' }}
                        thumbColor="#fff"
                        style={{ transform: [{ scale: 0.8 }] }}
                      />
                    </View>
                    <Text style={styles.gridLabel}>{row.label}</Text>
                    <Text style={styles.gridDesc}>{row.desc}</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* 5. Account */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Icon name="person" size={20} color={VendorUI.colors.primaryDark} />
                <Text style={styles.cardTitle}>Account</Text>
              </View>

              <View style={styles.gridContainer}>
                {[
                  { label: 'App notifications', desc: 'Manage notification preferences', icon: 'notifications-outline', route: 'Notifications' as const },
                  { label: 'Change password', desc: 'Update your account password', icon: 'lock-closed-outline', route: 'ChangePassword' as const },
                  { label: 'Terms & Conditions', desc: 'Read our terms and conditions', icon: 'document-text-outline', route: 'LegalHub' as const },
                  { label: 'Delete account', desc: 'Permanently delete your account', icon: 'trash-outline', route: 'DeleteAccount' as const, danger: true },
                ].map((row) => (
                  <TouchableOpacity
                    key={row.label}
                    style={[styles.gridCard, row.danger && styles.dangerCard]}
                    onPress={() => row.route ? navigation.navigate(row.route as any) : null}
                  >
                    <View style={styles.gridCardTop}>
                      <View style={[styles.iconBox, row.danger && styles.dangerIconBox]}>
                        <Icon name={row.icon} size={18} color={row.danger ? '#DC2626' : '#876241'} />
                      </View>
                      <Icon name="chevron-forward" size={18} color={row.danger ? '#DC2626' : VendorUI.colors.textMuted} />
                    </View>
                    <Text style={[styles.gridLabel, row.danger && styles.dangerText]}>{row.label}</Text>
                    <Text style={styles.gridDesc}>{row.desc}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* 6. Support / Growth */}
            <View style={styles.supportCard}>
              <View style={styles.supportContent}>
                <Text style={styles.supportTitle}>Grow your business with PalSafar</Text>
                <Text style={styles.supportDesc}>We help vendors grow digitally and reach more customers.</Text>

                <View style={styles.supportFeatures}>
                  {[
                    { title: 'Website Development', icon: 'globe-outline' },
                    { title: 'Google Business Setup', icon: 'business-outline' },
                    { title: 'Social Media Marketing', icon: 'share-social-outline' },
                    { title: 'Featured Listing', icon: 'star-outline' }
                  ].map((feat) => (
                    <View key={feat.title} style={styles.supportFeature}>
                      <View style={styles.supportFeatIcon}>
                        <Icon name={feat.icon} size={16} color="#876241" />
                      </View>
                      <Text style={styles.supportFeatText}>{feat.title}</Text>
                    </View>
                  ))}
                </View>

                <View style={styles.supportActionRow}>
                  <TouchableOpacity style={styles.supportBtn} onPress={handleSupportWhatsApp}>
                    <Icon name="logo-whatsapp" size={18} color="#fff" />
                    <Text style={styles.supportBtnText}>Chat on WhatsApp</Text>
                  </TouchableOpacity>
                  <Text style={styles.supportContactText}>Talk to our team{'\n'}on 7089812343</Text>
                </View>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>

      {/* 7. Sticky Save Button */}
      <View style={[styles.stickyFooter, { paddingBottom: Math.max(contentPadBottom, 20) }]}>
        <TouchableOpacity
          style={[styles.stickySaveBtn, (!canSave || saving) && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={!canSave || saving}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Icon name="checkmark" size={20} color="#fff" />
              <Text style={styles.stickySaveBtnText}>Save Business Settings</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F6F0', // Soft creamy background
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  headerCopy: {
    flex: 1,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: '#876241',
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#2D1E12',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 13,
    color: '#654C37',
    marginTop: 2,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 10,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    gap: 8,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#2D1E12',
    letterSpacing: -0.3,
  },
  coverPhotoContainer: {
    width: '100%',
    height: 160,
    borderRadius: 16,
    backgroundColor: '#F3E4D6',
    overflow: 'hidden',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
  },
  coverPhoto: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  coverPhotoPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverPhotoOverlay: {
    position: 'absolute',
    alignSelf: 'center',
    top: '50%',
    transform: [{ translateY: -16 }],
    backgroundColor: 'rgba(255,255,255,0.9)',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  coverPhotoText: {
    color: '#473323',
    fontSize: 10,
    fontWeight: '800',
    marginTop: 4,
  },
  fieldRow: {
    marginBottom: 16,
  },
  row: {
    flexDirection: 'row',
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#654C37',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#FAFAFA',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 14 : 10,
    fontSize: 14,
    color: '#2D1E12',
    fontWeight: '600',
  },
  multiline: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  chips: {
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#FAFAFA',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  chipActive: {
    backgroundColor: '#F6EEDB',
    borderColor: '#D4B895',
  },
  chipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#654C37',
  },
  chipTextActive: {
    color: '#574130',
  },
  vendorCodeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FAFAFA',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
  },
  codeValue: {
    fontSize: 16,
    fontWeight: '800',
    color: '#2D1E12',
    letterSpacing: 0.5,
  },
  copyCodeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3E4D6',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6,
  },
  copyCodeText: {
    color: '#574130',
    fontSize: 12,
    fontWeight: '800',
  },
  gpsText: {
    fontSize: 14,
    color: '#2D1E12',
    fontWeight: '600',
    marginBottom: 8,
  },
  detectLocationBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#B9834B',
    paddingVertical: 14,
    borderRadius: 14,
    gap: 8,
    marginTop: 8,
  },
  detectLocationText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  promoWebsiteCard: {
    backgroundColor: '#FDF8F3',
    borderWidth: 1,
    borderColor: '#E8D5C4',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    gap: 16,
    marginBottom: 20,
  },
  promoWebsiteIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F3E4D6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  promoWebsiteContent: {
    flex: 1,
  },
  promoWebsiteTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#2D1E12',
    marginBottom: 4,
  },
  promoWebsiteDesc: {
    fontSize: 12,
    color: '#654C37',
    lineHeight: 18,
    marginBottom: 12,
  },
  promoWebsiteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#574130',
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6,
  },
  promoWebsiteBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  gridCard: {
    width: '48%',
    backgroundColor: '#FAFAFA',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
  },
  gridCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  iconBox: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: '#2D1E12',
    marginBottom: 4,
  },
  gridDesc: {
    fontSize: 11,
    color: '#8B735F',
    lineHeight: 16,
  },
  dangerCard: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FCA5A5',
  },
  dangerIconBox: {
    backgroundColor: '#FEE2E2',
    borderColor: '#FCA5A5',
  },
  dangerText: {
    color: '#DC2626',
  },
  supportCard: {
    backgroundColor: '#F6EEDB',
    borderRadius: 20,
    padding: 24,
  },
  supportContent: {
    marginBottom: 8,
  },
  supportTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#473323',
    marginBottom: 6,
  },
  supportDesc: {
    fontSize: 14,
    color: '#654C37',
    marginBottom: 20,
  },
  supportFeatures: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
  supportFeature: {
    width: '46%',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 12,
  },
  supportFeatIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F3E4D6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  supportFeatText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#473323',
    textAlign: 'center',
  },
  supportActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  supportBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#574130',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  supportBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
  },
  supportContactText: {
    fontSize: 11,
    color: '#654C37',
    fontWeight: '600',
  },
  stickyFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#F8F6F0',
    paddingHorizontal: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.06)',
  },
  stickySaveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#473323',
    borderRadius: 16,
    paddingVertical: 16,
    gap: 8,
  },
  saveBtnDisabled: {
    opacity: 0.5,
  },
  stickySaveBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
  },
});
