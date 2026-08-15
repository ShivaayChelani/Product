import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Switch,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import { useDataContext } from '../context/DataContext';
import { useUserContext } from '../context/UserContext';
import { useBottomSafePadding } from '../design/responsive';
import { DEV_FLAGS } from '../config/devFlags';
import { ApiErrorCodes, getApiErrorCode } from '../services/api/client';
import Geolocation from 'react-native-geolocation-service';
import {
  VF,
  SERIF,
  SANS,
  SANS_BOLD,
  SANS_SEMI,
  VENDOR_FORM_STEPS,
  VENDOR_CATEGORIES,
  SUB_CATEGORIES,
  BUSINESS_TYPES,
  YEARS,
  INDIAN_STATES,
  VENDOR_BENEFITS,
} from '../components/vendor/vendorFormTheme';
import { SelectModal } from '../components/ui/SelectModal';
import { INDIAN_CITIES_BY_STATE, ALL_INDIAN_CITIES } from '../constants/locations';

interface VendorRegisterScreenProps {
  onBack: () => void;
  onCheckStatus?: () => void;
}



function RequiredLabel({ children }: { children: string }) {
  return (
    <Text style={styles.label}>
      {children}
      <Text style={styles.required}> *</Text>
    </Text>
  );
}

const SECTION_ICONS: Record<string, string> = {
  'Business Information': 'storefront-outline',
  'Business Location': 'location-outline',
};

function SectionHeader({ title }: { title: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Icon name={SECTION_ICONS[title] || 'document-outline'} size={20} color={VF.accentDark} />
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

export default function VendorRegisterScreen({ onBack, onCheckStatus }: VendorRegisterScreenProps) {
  const insets = useSafeAreaInsets();
  const contentPadBottom = useBottomSafePadding(24);
  const { width } = useWindowDimensions();
  const twoCol = width >= 360;
  const { registerVendor, currentVendor } = useDataContext();
  const { user, isAuthenticated } = useUserContext();
  const isResubmission =
    currentVendor?.verificationStatus === 'rejected'
    || currentVendor?.verificationStatus === 'changes_requested';

  const [businessName, setBusinessName] = useState(currentVendor?.businessName || '');
  const [phone, setPhone] = useState(currentVendor?.phone || user.phoneNumber || '');
  const [category, setCategory] = useState(currentVendor?.category || '');
  const [subCategory, setSubCategory] = useState('');
  const [businessType, setBusinessType] = useState('');
  const [yearEstablished, setYearEstablished] = useState('');
  const [description, setDescription] = useState(currentVendor?.description || '');
  const [addressLine1, setAddressLine1] = useState(currentVendor?.address || '');
  const [addressLine2, setAddressLine2] = useState('');
  const [city, setCity] = useState(currentVendor?.city || '');
  const [state, setState] = useState(currentVendor?.state || '');
  const [pincode, setPincode] = useState('');
  const [showExactLocation, setShowExactLocation] = useState(true);
  const [latitude, setLatitude] = useState<string>(currentVendor?.latitude ? String(currentVendor.latitude) : '');
  const [longitude, setLongitude] = useState<string>(currentVendor?.longitude ? String(currentVendor.longitude) : '');
  const [capturingLocation, setCapturingLocation] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [selectModal, setSelectModal] = useState<{
    visible: boolean;
    title: string;
    options: readonly string[];
    selectedValue?: string;
    onSelect: (v: string) => void;
  } | null>(null);

  const descMax = 300;

  const openSelectModal = (title: string, options: readonly string[], selectedValue: string, onSelect: (v: string) => void) => {
    setSelectModal({ visible: true, title, options, selectedValue, onSelect });
  };
  const subCategoryOptions = category ? SUB_CATEGORIES[category] || [] : [];
  const businessTypeOptions = category ? BUSINESS_TYPES[category] || [] : [];

  const captureMapLocation = () => {
    setCapturingLocation(true);
    Geolocation.getCurrentPosition(
      pos => {
        setLatitude(String(pos.coords.latitude));
        setLongitude(String(pos.coords.longitude));
        setCapturingLocation(false);
      },
      err => {
        setCapturingLocation(false);
        Alert.alert('Location unavailable', err.message || 'Enable GPS and try again.');
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 },
    );
  };

  const buildFullAddress = () => {
    const lines = [addressLine1.trim(), addressLine2.trim()].filter(Boolean);
    const base = lines.join(', ');
    return pincode.trim() ? `${base}${base ? ', ' : ''}${pincode.trim()}` : base;
  };

  const buildDescription = () => {
    const meta = [
      subCategory.trim() ? `Sub-category: ${subCategory.trim()}` : '',
      businessType.trim() ? `Business type: ${businessType.trim()}` : '',
      yearEstablished.trim() ? `Year established: ${yearEstablished.trim()}` : '',
    ].filter(Boolean);
    const body = description.trim();
    return meta.length ? `${body}\n\n${meta.join('\n')}` : body;
  };

  const handleRegister = async (confirmSwitch = false) => {
    if (!isAuthenticated || user.uid === 'guest-user') {
      Alert.alert('Sign in required', 'Sign in with your existing PalSafar account before registering a business.');
      return;
    }

    const errors: string[] = [];
    if (!businessName.trim()) errors.push('Business name is required');
    if (!phone.trim()) errors.push('Phone number is required');
    if (!category) errors.push('Business category is required');
    if (!businessType.trim()) errors.push('Business type is required');
    if (description.trim().length < 20) {
      errors.push(`Business description must be at least 20 characters (currently ${description.trim().length})`);
    }
    if (!addressLine1.trim()) errors.push('Address line 1 is required');
    if (!city.trim()) errors.push('City is required');
    if (!state.trim()) errors.push('State is required');
    if (!pincode.trim()) errors.push('Pincode is required');

    if (latitude.trim() || longitude.trim()) {
      if (!latitude.trim() || !longitude.trim()) {
        errors.push('Please provide both latitude and longitude, or leave both blank');
      } else if (isNaN(parseFloat(latitude)) || isNaN(parseFloat(longitude))) {
        errors.push('Coordinates must be valid numbers');
      }
    }

    if (errors.length > 0) {
      Alert.alert('Please fix these issues:', '• ' + errors.slice(0, 6).join('\n• '));
      return;
    }

    setRegistering(true);
    try {
      const vendorId = currentVendor?.id || `vendor_${Date.now()}`;
      const now = new Date().toISOString();

      const vendor = {
        id: vendorId,
        businessName: businessName.trim(),
        ownerName: user.displayName || businessName.trim(),
        email: user.email || '',
        phone: phone.trim(),
        category: category as any,
        city: city.trim(),
        state: state.trim(),
        address: buildFullAddress(),
        latitude: latitude.trim() ? parseFloat(latitude) : undefined,
        longitude: longitude.trim() ? parseFloat(longitude) : undefined,
        openingHours: currentVendor?.openingHours || '',
        website: currentVendor?.website,
        description: buildDescription(),
        linkedSpotIds: currentVendor?.linkedSpotIds || [],
        verificationStatus: 'pending' as const,
        createdAt: currentVendor?.createdAt || now,
        images: currentVendor?.images || [],
        imageUrl: currentVendor?.imageUrl,
      };

      const result = await registerVendor(
        vendor,
        confirmSwitch ? { confirmSwitch: true } : undefined,
      );

      if (result) {
        Alert.alert(
          isResubmission ? 'Application Updated' : 'Registration Submitted',
          DEV_FLAGS.USE_SERVER_API
            ? 'Your vendor application is submitted for verification.\n\nOnce approved, you can start creating offers.'
            : 'Your vendor application is submitted for verification.',
          [{ text: 'OK', onPress: onBack }],
        );
      } else {
        Alert.alert('Registration Failed', 'Could not complete registration. Please check your details and try again.');
      }
    } catch (err: unknown) {
      if (!confirmSwitch && getApiErrorCode(err) === ApiErrorCodes.SWITCH_CONFIRMATION_REQUIRED) {
        Alert.alert(
          'Switch to Vendor?',
          'You already have a Creator workspace.\nYou must deactivate Creator before activating Vendor.\n\nContinuing will retire your Creator role.',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Continue',
              style: 'destructive',
              onPress: () => { void handleRegister(true); },
            },
          ],
        );
        return;
      }
      let message = 'Could not complete registration.';
      if (err instanceof Error) message = err.message;
      if (err && typeof err === 'object' && 'response' in err) {
        const responseData = (err as any).response?.data;
        if (responseData && typeof responseData === 'object') {
          message = responseData.message || responseData.error || message;
        }
      }
      Alert.alert('Registration Failed', message);
    } finally {
      setRegistering(false);
    }
  };

  const handleCheckStatus = useCallback(() => {
    const status = String(currentVendor?.verificationStatus || '').toLowerCase();
    if (status === 'pending') {
      Alert.alert('Application Pending', 'Your vendor application is under review. We will notify you once approved.');
      return;
    }
    onCheckStatus?.();
  }, [currentVendor?.verificationStatus, onCheckStatus]);

  const renderInput = (
    label: React.ReactNode,
    icon: string,
    value: string,
    onChange: (v: string) => void,
    placeholder: string,
    options?: { keyboard?: 'default' | 'phone-pad' | 'number-pad'; fullWidth?: boolean },
  ) => (
    <View style={[styles.fieldCol, twoCol && !options?.fullWidth && styles.fieldHalf]}>
      {label}
      <View style={styles.inputWrap}>
        <Icon name={icon} size={16} color={VF.textSecondary} style={styles.inputIcon} />
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={VF.textMuted}
          keyboardType={options?.keyboard || 'default'}
        />
      </View>
    </View>
  );

  const renderSelect = (
    label: React.ReactNode,
    icon: string,
    value: string,
    placeholder: string,
    onPress: () => void,
  ) => (
    <View style={[styles.fieldCol, twoCol && styles.fieldHalf]}>
      {label}
      <TouchableOpacity style={styles.inputWrap} onPress={onPress} activeOpacity={0.85}>
        <Icon name={icon} size={16} color={VF.textSecondary} style={styles.inputIcon} />
        <Text style={[styles.selectText, !value && styles.placeholder]} numberOfLines={1}>
          {value || placeholder}
        </Text>
        <Icon name="chevron-down" size={16} color={VF.textMuted} />
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.root} edges={['left', 'right']}>
      <StatusBar barStyle="dark-content" backgroundColor={VF.bg} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={[styles.topBar, { paddingTop: Math.max(insets.top, 8) }]}>
          <TouchableOpacity style={styles.backBtn} onPress={onBack} hitSlop={8}>
            <Icon name="arrow-back" size={20} color={VF.text} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.checkStatusPill} onPress={handleCheckStatus} hitSlop={8}>
            <Icon name="checkbox-outline" size={15} color={VF.accentDark} />
            <View>
              <Text style={styles.checkStatusTop}>Already applied?</Text>
              <Text style={styles.checkStatusBottom}>Check Status  →</Text>
            </View>
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.flex}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: contentPadBottom }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.hero}>
            <Text style={styles.heroTitle}>Become a Vendor</Text>
            <Text style={styles.heroSubtitle}>Join Pal Safar and grow your business</Text>
          </View>

          {/* Promo banner */}
          <View style={styles.promoBanner}>
            <View style={styles.promoBannerTop}>
              <View style={styles.promoIllustration}>
                <Text style={styles.storeEmoji}>🏪</Text>
                <Icon name="location" size={20} color={VF.accentDark} style={styles.pinIcon} />
              </View>
              <View style={styles.promoContent}>
                <Text style={styles.promoTitle}>Grow with Pal Safar</Text>
                <Text style={styles.promoSubtitle}>
                  Reach thousands of travelers, showcase your business, and get more customers.
                </Text>
              </View>
            </View>
            <View style={styles.promoDivider} />
            <View style={styles.promoBenefits}>
              {VENDOR_BENEFITS.map(item => (
                <View key={item.label} style={styles.promoBenefitItem}>
                  <Icon name={item.icon} size={15} color={VF.accentDark} />
                  <Text style={styles.promoBenefitText}>{item.label}</Text>
                </View>
              ))}
            </View>
          </View>

          {isResubmission ? (
            <View style={styles.resubmitNotice}>
              <Icon name="information-circle-outline" size={18} color={VF.accentDark} />
              <Text style={styles.resubmitText}>Update your details and resubmit for verification.</Text>
            </View>
          ) : null}

          <SectionHeader title="Business Information" />

          {renderInput(
            <RequiredLabel>Business Name</RequiredLabel>,
            'storefront-outline',
            businessName,
            setBusinessName,
            'Enter your business name',
            { fullWidth: true }
          )}

          {renderInput(
            <RequiredLabel>Phone Number</RequiredLabel>,
            'call-outline',
            phone,
            setPhone,
            'Enter business phone number',
            { fullWidth: true, keyboard: 'phone-pad' }
          )}

          <View style={styles.fieldGrid}>
            {renderSelect(
              <RequiredLabel>Business Category</RequiredLabel>,
              'grid-outline',
              category ? VENDOR_CATEGORIES.find(c => c.key === category)?.label || category : '',
              'Select category',
              () =>
                openSelectModal(
                  'Business Category',
                  VENDOR_CATEGORIES.map(c => c.label),
                  category ? VENDOR_CATEGORIES.find(c => c.key === category)?.label || '' : '',
                  label => {
                    const match = VENDOR_CATEGORIES.find(c => c.label === label);
                    if (match) {
                      setCategory(match.key);
                      setSubCategory('');
                      setBusinessType('');
                    }
                  },
                ),
            )}
            {renderSelect(
              <Text style={styles.label}>Sub Category (Optional)</Text>,
              'person-outline',
              subCategory,
              category ? 'Select sub category' : 'Select category first',
              () => {
                if (!category) {
                  Alert.alert('Select category first', 'Choose a business category before selecting a sub category.');
                  return;
                }
                openSelectModal('Sub Category', subCategoryOptions, subCategory, setSubCategory);
              },
            )}
            {renderSelect(
              <RequiredLabel>Business Type</RequiredLabel>,
              'briefcase-outline',
              businessType,
              category ? 'Select business type' : 'Select category first',
              () => {
                if (!category) {
                  Alert.alert('Select category first', 'Choose a business category before selecting a business type.');
                  return;
                }
                openSelectModal('Business Type', businessTypeOptions, businessType, setBusinessType);
              }
            )}
            {renderSelect(
              <Text style={styles.label}>Year Established</Text>,
              'calendar-outline',
              yearEstablished,
              'Select year',
              () => openSelectModal('Year Established', YEARS, yearEstablished, setYearEstablished),
            )}
          </View>

          <View style={styles.fieldCol}>
            <RequiredLabel>Business Description</RequiredLabel>
            <View style={styles.bioWrap}>
              <TextInput
                style={styles.bioInput}
                value={description}
                onChangeText={v => setDescription(v.slice(0, descMax))}
                placeholder="Tell us about your business, products or services (min. 20 characters)"
                placeholderTextColor={VF.textMuted}
                multiline
                textAlignVertical="top"
              />
              <Text style={styles.bioCount}>{description.length} / {descMax}</Text>
            </View>
          </View>

          <SectionHeader title="Business Location" />

          {renderInput(
            <RequiredLabel>Address Line 1</RequiredLabel>,
            'location-outline',
            addressLine1,
            setAddressLine1,
            'House no., Building, Street',
            { fullWidth: true }
          )}
          {renderInput(
            <Text style={styles.label}>Address Line 2</Text>,
            'map-outline',
            addressLine2,
            setAddressLine2,
            'Area, Landmark (Optional)',
            { fullWidth: true }
          )}

          <View style={styles.fieldGrid}>
            {renderSelect(
              <RequiredLabel>City</RequiredLabel>,
              'business-outline',
              city,
              state ? 'Select city' : 'Select state first',
              () => {
                if (!state) {
                  Alert.alert('Select state first', 'Please choose a state before selecting a city.');
                  return;
                }
                openSelectModal('City', INDIAN_CITIES_BY_STATE[state] || [], city, setCity);
              },
            )}
            {renderSelect(
              <RequiredLabel>State</RequiredLabel>,
              'map-outline',
              state,
              'Select state',
              () => openSelectModal('State', INDIAN_STATES, state, setState),
            )}
            {renderInput(
              <RequiredLabel>Pincode</RequiredLabel>,
              'navigate-outline',
              pincode,
              setPincode,
              'Enter pincode',
              { keyboard: 'number-pad' },
            )}
          </View>

          <View style={styles.toggleCard}>
            <View style={styles.toggleIconWrap}>
              <Icon name="locate-outline" size={20} color={VF.accentDark} />
            </View>
            <View style={styles.toggleTextCol}>
              <Text style={styles.toggleTitle}>Auto-detect location from GPS</Text>
              <Text style={styles.toggleSub}>Turn off to enter coordinates manually.</Text>
              {showExactLocation && latitude ? (
                <Text style={styles.toggleCoords}>
                  GPS pinned ({parseFloat(latitude).toFixed(4)}, {parseFloat(longitude).toFixed(4)})
                </Text>
              ) : showExactLocation && capturingLocation ? (
                <Text style={styles.toggleCoords}>Capturing location…</Text>
              ) : null}
            </View>
            <Switch
              value={showExactLocation}
              onValueChange={val => {
                setShowExactLocation(val);
                if (val && !latitude) captureMapLocation();
              }}
              trackColor={{ false: VF.stepInactive, true: VF.accent }}
              thumbColor="#FFFFFF"
            />
          </View>

          {!showExactLocation && (
            <View style={[styles.fieldGrid, { marginTop: 16 }]}>
              {renderInput(
                <Text style={styles.label}>Latitude</Text>,
                'navigate-outline',
                latitude,
                setLatitude,
                'e.g. 28.7041',
                { keyboard: 'number-pad' }
              )}
              {renderInput(
                <Text style={styles.label}>Longitude</Text>,
                'navigate-outline',
                longitude,
                setLongitude,
                'e.g. 77.1025',
                { keyboard: 'number-pad' }
              )}
            </View>
          )}

          <View style={styles.securityBanner}>
            <Icon name="shield-checkmark-outline" size={22} color={VF.accent} />
            <Text style={styles.securityText}>
              Your information is safe with us. We use it only to verify and promote your business.
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.submitBtn, registering && styles.submitBtnDisabled]}
            onPress={() => handleRegister(false)}
            disabled={registering}
            activeOpacity={0.9}
          >
            {registering ? (
              <ActivityIndicator color={VF.btnText} />
            ) : (
              <>
                <Text style={styles.submitText}>
                  {isResubmission ? 'Update & Continue' : 'Save & Continue'}
                </Text>
                <Icon name="arrow-forward" size={18} color={VF.btnText} />
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      {selectModal && (
        <SelectModal
          visible={selectModal.visible}
          title={selectModal.title}
          options={selectModal.options}
          selectedValue={selectModal.selectedValue}
          onSelect={selectModal.onSelect}
          onClose={() => setSelectModal(null)}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: VF.bg },
  flex: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: VF.card,
    borderWidth: 1,
    borderColor: VF.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: VF.card,
    borderWidth: 1,
    borderColor: VF.border,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  checkStatusTop: {
    fontFamily: SANS,
    fontSize: 10,
    color: VF.textSecondary,
  },
  checkStatusBottom: {
    fontFamily: SANS_BOLD,
    fontSize: 11,
    color: VF.accentDark,
  },
  scrollContent: { paddingHorizontal: 20 },
  hero: {
    marginBottom: 16,
  },
  heroTitle: {
    fontFamily: SERIF,
    fontSize: 28,
    color: VF.text,
    marginBottom: 4,
  },
  heroSubtitle: {
    fontFamily: SANS,
    fontSize: 13,
    color: VF.textSecondary,
  },
  stepperTrack: {
    marginBottom: 20,
    position: 'relative',
    paddingTop: 14,
  },
  stepperLine: {
    position: 'absolute',
    top: 28,
    left: '10%',
    right: '10%',
    height: 2,
    backgroundColor: VF.stepLine,
  },
  stepper: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  stepItem: { flex: 1, alignItems: 'center', zIndex: 1 },
  stepCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: VF.stepInactive,
    backgroundColor: VF.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepCircleActive: {
    borderColor: VF.stepActive,
    backgroundColor: VF.stepActive,
  },
  stepNum: {
    fontFamily: SANS_BOLD,
    fontSize: 12,
    color: VF.textMuted,
  },
  stepNumActive: { color: '#FFFFFF' },
  stepLabel: {
    marginTop: 6,
    fontFamily: SANS,
    fontSize: 8,
    color: VF.textMuted,
    textAlign: 'center',
  },
  stepLabelActive: {
    fontFamily: SANS_SEMI,
    color: VF.accentDark,
  },
  promoBanner: {
    backgroundColor: '#FAF3EB',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: VF.border,
    padding: 16,
    marginBottom: 22,
  },
  promoBannerTop: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  promoIllustration: {
    width: 72,
    height: 72,
    borderRadius: 16,
    backgroundColor: '#F0E4D0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  storeEmoji: { fontSize: 34 },
  pinIcon: { marginTop: -6 },
  promoContent: { flex: 1, justifyContent: 'center' },
  promoTitle: {
    fontFamily: SANS_BOLD,
    fontSize: 15,
    color: VF.text,
    marginBottom: 4,
  },
  promoSubtitle: {
    fontFamily: SANS,
    fontSize: 12,
    color: VF.textSecondary,
    lineHeight: 17,
  },
  promoDivider: {
    height: 1,
    backgroundColor: VF.border,
    marginBottom: 12,
  },
  promoBenefits: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  promoBenefitItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  promoBenefitText: {
    fontFamily: SANS_SEMI,
    fontSize: 11,
    color: VF.accentDark,
  },
  resubmitNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: VF.securityBg,
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: VF.border,
  },
  resubmitText: {
    flex: 1,
    fontFamily: SANS,
    fontSize: 12,
    color: VF.accentDark,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    marginTop: 8,
    gap: 8,
  },
  sectionBar: {
    width: 0,
    height: 0,
  },
  sectionTitle: {
    fontFamily: SANS_BOLD,
    fontSize: 16,
    color: VF.text,
  },
  fieldGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  fieldCol: {
    width: '100%',
    marginBottom: 12,
  },
  fieldHalf: {
    width: '47%',
    flexGrow: 1,
  },
  label: {
    fontFamily: SANS_SEMI,
    fontSize: 12,
    color: VF.textSecondary,
    marginBottom: 6,
  },
  required: { color: VF.required },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: VF.inputBg,
    borderWidth: 1,
    borderColor: VF.border,
    borderRadius: 14,
    paddingHorizontal: 10,
    minHeight: 48,
  },
  inputIcon: { marginRight: 6 },
  input: {
    flex: 1,
    fontFamily: SANS,
    fontSize: 13,
    color: VF.text,
    paddingVertical: 10,
  },
  selectText: {
    flex: 1,
    fontFamily: SANS,
    fontSize: 13,
    color: VF.text,
  },
  placeholder: { color: VF.textMuted },
  bioWrap: {
    backgroundColor: VF.inputBg,
    borderWidth: 1,
    borderColor: VF.border,
    borderRadius: 14,
    padding: 12,
    minHeight: 110,
  },
  bioInput: {
    fontFamily: SANS,
    fontSize: 13,
    color: VF.text,
    lineHeight: 20,
    minHeight: 80,
    paddingBottom: 20,
  },
  bioCount: {
    alignSelf: 'flex-end',
    fontFamily: SANS,
    fontSize: 11,
    color: VF.textMuted,
  },
  toggleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: VF.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: VF.border,
    padding: 14,
    marginBottom: 16,
  },
  toggleIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: VF.securityBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleTextCol: { flex: 1 },
  toggleTitle: {
    fontFamily: SANS_SEMI,
    fontSize: 13,
    color: VF.text,
  },
  toggleSub: {
    fontFamily: SANS,
    fontSize: 11,
    color: VF.textMuted,
    marginTop: 2,
  },
  toggleCoords: {
    fontFamily: SANS,
    fontSize: 10,
    color: VF.accent,
    marginTop: 4,
  },
  securityBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: VF.securityBg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: VF.border,
    padding: 14,
    marginBottom: 20,
  },
  securityText: {
    flex: 1,
    fontFamily: SANS,
    fontSize: 12,
    color: VF.textSecondary,
    lineHeight: 18,
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 56,
    borderRadius: 18,
    backgroundColor: VF.btnBg,
    marginBottom: 16,
  },
  submitBtnDisabled: { opacity: 0.7 },
  submitText: {
    fontFamily: SANS_BOLD,
    fontSize: 16,
    color: VF.btnText,
    letterSpacing: 0.2,
  },
  statusLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingBottom: 8,
  },
  statusText: {
    fontFamily: SANS,
    fontSize: 13,
    color: VF.textSecondary,
  },
  statusBold: {
    fontFamily: SANS_BOLD,
    color: VF.link,
  },
});
