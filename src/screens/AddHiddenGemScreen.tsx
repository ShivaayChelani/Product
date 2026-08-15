import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, Alert, ActivityIndicator, Image, ImageBackground, Modal, KeyboardAvoidingView, Platform } from 'react-native';
import { colors, spacing, borderRadius } from '../config/theme';
import { MaterialIcons } from '../utils/Icons';
import { HiddenGemCategory, HiddenGemSubmission } from '../types';
import Geolocation from 'react-native-geolocation-service';
import { hiddenGemsApi } from '../services/api';
import { uploadApi } from '../services/api/upload';
import { apiClient } from '../services/api/client';
import { useUserContext } from '../context/UserContext';
import * as ImagePicker from 'react-native-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBottomSafePadding } from '../design/responsive';interface AddHiddenGemScreenProps {
  onBack: () => void;
  /** Optional local cache callback after successful API submit. */
  onSubmit?: (input: Omit<HiddenGemSubmission, 'id' | 'status' | 'submittedAt' | 'pointsReward'>) => void;
  userId: string;
  userName: string;
}

const CATEGORIES: { value: HiddenGemCategory; label: string; emoji: string }[] = [
  { value: 'waterfall', label: 'Waterfall', emoji: '💧' },
  { value: 'sunset_point', label: 'Sunset Point', emoji: '🌅' },
  { value: 'old_temple', label: 'Old Temple', emoji: '🛕' },
  { value: 'local_viewpoint', label: 'Viewpoint', emoji: '🏔️' },
  { value: 'photo_spot', label: 'Photo Spot', emoji: '📸' },
  { value: 'river_ghat', label: 'River Ghat', emoji: '🌊' },
  { value: 'small_fort', label: 'Small Fort', emoji: '🏰' },
  { value: 'nature_trail', label: 'Nature Trail', emoji: '🌲' },
  { value: 'cultural_place', label: 'Cultural Place', emoji: '🎭' },
  { value: 'lake', label: 'Lake', emoji: '🏞️' },
  { value: 'cave', label: 'Cave', emoji: '🕳️' },
  { value: 'wildlife', label: 'Wildlife', emoji: '🦌' },
  { value: 'heritage', label: 'Heritage', emoji: '🏛️' },
  { value: 'other', label: 'Other', emoji: '📍' },
];

const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
  'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand',
  'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur',
  'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab',
  'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura',
  'Uttar Pradesh', 'Uttarakhand', 'West Bengal', 'Delhi', 'Puducherry',
];

const STATE_ALIASES: Record<string, string> = {
  'nct of delhi': 'Delhi',
  'national capital territory of delhi': 'Delhi',
  delhi: 'Delhi',
  pondicherry: 'Puducherry',
  orissa: 'Odisha',
  uttaranchal: 'Uttarakhand',
  // ISO 3166-2 codes from Nominatim
  'in-ap': 'Andhra Pradesh',
  'in-ar': 'Arunachal Pradesh',
  'in-as': 'Assam',
  'in-br': 'Bihar',
  'in-ct': 'Chhattisgarh',
  'in-ga': 'Goa',
  'in-gj': 'Gujarat',
  'in-hr': 'Haryana',
  'in-hp': 'Himachal Pradesh',
  'in-jh': 'Jharkhand',
  'in-ka': 'Karnataka',
  'in-kl': 'Kerala',
  'in-mp': 'Madhya Pradesh',
  'in-mh': 'Maharashtra',
  'in-mn': 'Manipur',
  'in-ml': 'Meghalaya',
  'in-mz': 'Mizoram',
  'in-nl': 'Nagaland',
  'in-or': 'Odisha',
  'in-pb': 'Punjab',
  'in-rj': 'Rajasthan',
  'in-sk': 'Sikkim',
  'in-tn': 'Tamil Nadu',
  'in-tg': 'Telangana',
  'in-tr': 'Tripura',
  'in-up': 'Uttar Pradesh',
  'in-ut': 'Uttarakhand',
  'in-wb': 'West Bengal',
  'in-dl': 'Delhi',
  'in-py': 'Puducherry',
};

function normalizeStateKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^state of\s+/i, '')
    .replace(/\s+/g, ' ');
}

function matchIndianState(...candidates: Array<string | undefined>): string {
  for (const raw of candidates) {
    if (!raw?.trim()) continue;
    const n = normalizeStateKey(raw);
    if (STATE_ALIASES[n]) return STATE_ALIASES[n];
    const exact = INDIAN_STATES.find(s => s.toLowerCase() === n);
    if (exact) return exact;
    const partial = INDIAN_STATES.find(
      s => n.includes(s.toLowerCase()) || s.toLowerCase().includes(n),
    );
    if (partial) return partial;
  }
  return '';
}

async function reverseGeocodeCityState(lat: number, lng: number): Promise<{ city: string; state: string }> {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=14&addressdetails=1`,
    { headers: { 'Accept-Language': 'en', 'User-Agent': 'PalSafar-Mobile/1.0' } },
  );
  const data = await res.json();
  const addr = data?.address || {};
  const city =
    addr.city ||
    addr.town ||
    addr.village ||
    addr.suburb ||
    addr.municipality ||
    addr.county ||
    addr.state_district ||
    '';
  const state = matchIndianState(
    addr.state,
    addr['ISO3166-2-lvl4'],
    addr['ISO3166-2-lvl3'],
    addr.region,
  );
  return { city: String(city || '').trim(), state };
}

const TIME_PERIODS = [
  { value: 'Morning', label: 'Morning' },
  { value: 'Afternoon', label: 'Afternoon' },
  { value: 'Evening', label: 'Evening' },
  { value: 'Night', label: 'Night' },
  { value: 'Sunrise', label: 'Sunrise' },
  { value: 'Sunset', label: 'Sunset' },
  { value: 'Monsoon', label: 'Monsoon' },
  { value: 'Any', label: 'Any Time' },
] as const;

const PERIOD_TIME_DEFAULTS: Record<string, { from: string; to: string }> = {
  Morning: { from: '08:00 AM', to: '11:00 AM' },
  Afternoon: { from: '12:00 PM', to: '04:00 PM' },
  Evening: { from: '04:00 PM', to: '07:00 PM' },
  Night: { from: '07:00 PM', to: '11:00 PM' },
  Sunrise: { from: '05:00 AM', to: '07:00 AM' },
  Sunset: { from: '05:00 PM', to: '07:00 PM' },
  Monsoon: { from: '08:00 AM', to: '06:00 PM' },
  Any: { from: '08:00 AM', to: '08:00 PM' },
};

export default function AddHiddenGemScreen({ onBack, onSubmit, userId, userName }: AddHiddenGemScreenProps) {
  const insets = useSafeAreaInsets();
  const contentPadBottom = useBottomSafePadding(24);
  const { isGuest, onLogout } = useUserContext();
  const [placeName, setPlaceName] = useState('');
  const [category, setCategory] = useState<HiddenGemCategory | null>(null);
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [description, setDescription] = useState('');
  
  const [bestTimeLabel, setBestTimeLabel] = useState('');
  const [bestTimeFrom, setBestTimeFrom] = useState('');
  const [bestTimeTo, setBestTimeTo] = useState('');
  
  const [estimatedCost, setEstimatedCost] = useState('');
  const [tips, setTips] = useState('');
  
  const [images, setImages] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [loadingLocation, setLoadingLocation] = useState(false);
  const [locationConfirmed, setLocationConfirmed] = useState(false);
  const [locationMethod, setLocationMethod] = useState<'gps' | 'map_pick' | 'manual' | null>(null);
  
  // Modals for dropdowns
  const [categoryModalVisible, setCategoryModalVisible] = useState(false);
  const [timeModalVisible, setTimeModalVisible] = useState(false);

  const handlePickImage = async () => {
    if (images.length >= 4) {
      Alert.alert('Maximum photos reached');
      return;
    }
    const result = await ImagePicker.launchImageLibrary({
      mediaType: 'photo',
      quality: 0.8,
    });
    if (result.assets && result.assets[0].uri) {
      setImages(prev => [...prev, result.assets![0].uri!]);
    }
  };

  const applyGpsPosition = (lat: number, lng: number) => {
    setLatitude(lat.toFixed(6));
    setLongitude(lng.toFixed(6));
    setLocationConfirmed(true);
    setLocationMethod('gps');
    void (async () => {
      try {
        const { city: geoCity, state: geoState } = await reverseGeocodeCityState(lat, lng);
        if (geoCity) setCity(geoCity);
        if (geoState) setState(geoState);
        setAddress([geoCity, geoState].filter(Boolean).join(', '));
      } catch {
        setAddress('Location found, please enter city and state.');
      } finally {
        setLoadingLocation(false);
      }
    })();
  };

  const useCurrentLocation = () => {
    Alert.alert(
      'Use current GPS?',
      'This records YOUR current position as the Hidden Gem location. Only continue if you are standing at the place.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'I am at this place',
          onPress: () => {
            setLoadingLocation(true);
            Geolocation.getCurrentPosition(
              (position) => {
                applyGpsPosition(position.coords.latitude, position.coords.longitude);
              },
              () => {
                setLoadingLocation(false);
                Alert.alert('Location Error', 'Could not get current location.');
              },
              { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 },
            );
          },
        },
      ],
    );
  };

  const handleSubmit = () => {
    if (isGuest) {
      Alert.alert('Sign In Required', 'Please sign in to submit a hidden gem.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign In', onPress: () => onLogout() },
      ]);
      return;
    }

    if (!placeName.trim() || !category || !address.trim() || !description.trim() || images.length < 2) {
      Alert.alert('Required Fields', 'Please fill all required fields and add at least 2 photos.');
      return;
    }

    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    if (!locationConfirmed || !Number.isFinite(lat) || !Number.isFinite(lng) || (Math.abs(lat) < 0.0001 && Math.abs(lng) < 0.0001)) {
      Alert.alert(
        'Location Required',
        'Tap Use My Location only if you are at the Hidden Gem, or enter valid coordinates. Your GPS is never filled in automatically.',
      );
      return;
    }

    Alert.alert(
      'Submit Hidden Gem?',
      'Are you sure you want to submit this place for review?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Submit',
          onPress: async () => {
            setSubmitting(true);
            try {
              // Upload photos first — backend requires http(s) image URLs.
              const uploaded = await uploadApi.uploadMultiple(images.slice(0, 4));
              const urls = (Array.isArray(uploaded) ? uploaded : []).map((u) => u.url).filter(Boolean);
              if (urls.length === 0) {
                throw new Error('Photo upload failed. Please try again.');
              }

              const payload = {
                placeName: placeName.trim(),
                category: category!,
                city: city.trim() || address.split(',')[0] || 'Unknown',
                state: state.trim() || 'Unknown',
                latitude: lat,
                longitude: lng,
                description: description.trim(),
                bestTimeToVisit: bestTimeLabel
                  ? {
                      from: bestTimeFrom.trim() || '08:00 AM',
                      to: bestTimeTo.trim() || '05:00 PM',
                      label: bestTimeLabel,
                    }
                  : undefined,
                estimatedCost: estimatedCost.trim() || 'Free',
                safetyTip: 'None',
                worthVisitingReason: tips.trim() || 'Unique experience',
                imageUri: urls[0],
                images: urls,
                locationMethod: locationMethod || 'gps',
              };

              await hiddenGemsApi.create(payload);
              // Optional local mirror for offline UX caches
              onSubmit?.({
                userId,
                userName,
                ...payload,
                bestTimeToVisit: payload.bestTimeToVisit ?? null,
              });

              Alert.alert(
                'Submitted!',
                "Your hidden gem has been submitted for review. You'll earn PalPoints once it's approved!",
                [{ text: 'Great!', onPress: () => onBack() }],
              );
            } catch (err: any) {
              Alert.alert('Submission Failed', err?.message || 'Failed to submit.');
            } finally {
              setSubmitting(false);
            }
          },
        },
      ]
    );
  };

  const selectedCategoryObj = CATEGORIES.find(c => c.value === category);

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.container}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) }]}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack}>
          <MaterialIcons name="arrow-back" size={24} color="#311A0B" />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <View style={styles.diamondBadge}>
            <MaterialIcons name="diamond" size={12} color="#fff" />
          </View>
          <Text style={styles.headerTitle}>Submit Hidden Gem</Text>
          <Text style={styles.headerSubtitle}>Share unique places. Get verified. Earn PalPoints!</Text>
        </View>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false} contentContainerStyle={styles.contentPad}>
        


        <View style={styles.sectionHeader}>
          <View style={styles.sectionDiamond}><MaterialIcons name="diamond" size={14} color="#D4AF37" /></View>
          <Text style={styles.sectionTitle}>Basic Information</Text>
          <View style={styles.sectionLine} />
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>Place Name <Text style={styles.asterisk}>*</Text></Text>
          <View style={styles.inputWrapper}>
            <MaterialIcons name="place" size={20} color="#D4AF37" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              value={placeName}
              onChangeText={setPlaceName}
              placeholder="Enter place name"
              placeholderTextColor="#96816E"
            />
          </View>
        </View>

        <View style={styles.row}>
          <View style={[styles.formGroup, { flex: 1 }]}>
            <Text style={styles.label}>Category <Text style={styles.asterisk}>*</Text></Text>
            <TouchableOpacity style={styles.inputWrapper} onPress={() => setCategoryModalVisible(true)}>
              <MaterialIcons name="diamond" size={20} color="#D4AF37" style={styles.inputIcon} />
              <Text style={[styles.inputText, !category && styles.placeholderText]}>
                {selectedCategoryObj ? selectedCategoryObj.label : 'Select category'}
              </Text>
              <MaterialIcons name="keyboard-arrow-down" size={20} color="#311A0B" />
            </TouchableOpacity>
          </View>

          <View style={{ width: 12 }} />

          <View style={[styles.formGroup, { flex: 1 }]}>
            <Text style={styles.label}>Location <Text style={styles.asterisk}>*</Text></Text>
            <View style={[styles.inputWrapper, { paddingHorizontal: 4 }]}>
              <MaterialIcons name="place" size={20} color="#D4AF37" style={styles.inputIcon} />
              <TextInput
                style={[styles.input, { flex: 1 }]}
                value={city}
                onChangeText={setCity}
                placeholder="Search location"
                placeholderTextColor="#96816E"
              />
              <TouchableOpacity style={styles.useLocationBtn} onPress={useCurrentLocation} disabled={loadingLocation}>
                {loadingLocation ? (
                  <ActivityIndicator size="small" color="#D4AF37" />
                ) : (
                  <>
                    <MaterialIcons name="my-location" size={14} color="#D4AF37" />
                    <Text style={styles.useLocationText}>Use My Location</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {locationConfirmed ? (
          <Text style={{ color: '#5E544C', fontSize: 12, marginBottom: 12, marginTop: -4 }}>
            Place coordinates: {latitude}, {longitude} ({locationMethod === 'gps' ? 'confirmed at this place' : locationMethod})
          </Text>
        ) : (
          <Text style={{ color: '#B45309', fontSize: 12, marginBottom: 12, marginTop: -4 }}>
            Location is not set. Use My Location only if you are standing at the Hidden Gem.
          </Text>
        )}

        <View style={styles.formGroup}>
          <Text style={styles.label}>Address <Text style={styles.asterisk}>*</Text></Text>
          <View style={styles.inputWrapper}>
            <MaterialIcons name="map" size={20} color="#D4AF37" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              value={address}
              onChangeText={setAddress}
              placeholder="Enter exact address"
              placeholderTextColor="#96816E"
            />
          </View>
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>Short Description <Text style={styles.asterisk}>*</Text></Text>
          <View style={[styles.inputWrapper, styles.textAreaWrapper]}>
            <MaterialIcons name="edit" size={20} color="#D4AF37" style={styles.inputIconTop} />
            <TextInput
              style={styles.textArea}
              value={description}
              onChangeText={setDescription}
              placeholder="Tell us something about this place"
              placeholderTextColor="#96816E"
              multiline
              maxLength={200}
            />
            <Text style={styles.charCount}>{description.length}/200</Text>
          </View>
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>Photos <Text style={styles.asterisk}>*</Text></Text>
          <Text style={styles.subLabel}>Add at least 2 photos of this place</Text>
          
          <View style={styles.photoGrid}>
            {images.map((img, i) => (
              <View key={i} style={styles.photoBox}>
                <Image source={{ uri: img }} style={styles.photoImg} />
              </View>
            ))}
            {images.length < 4 && (
              <TouchableOpacity style={[styles.photoBox, styles.photoBoxEmpty]} onPress={handlePickImage}>
                <MaterialIcons name={images.length === 0 ? "add-a-photo" : "add"} size={24} color="#C4A485" />
                <Text style={styles.photoBoxText}>{images.length === 0 ? "Add Photo" : "Add More"}</Text>
              </TouchableOpacity>
            )}
          </View>
          
          <View style={styles.tipBox}>
            <MaterialIcons name="lightbulb-outline" size={16} color="#B58D3D" />
            <Text style={styles.tipText}>Clear and real photos help your hidden gem get approved faster.</Text>
          </View>
        </View>


        <View style={[styles.sectionHeader, { marginTop: 24 }]}>
          <View style={styles.sectionDiamond}><MaterialIcons name="diamond" size={14} color="#D4AF37" /></View>
          <Text style={styles.sectionTitle}>Additional Details <Text style={styles.optionalText}>(Optional)</Text></Text>
          <View style={styles.sectionLine} />
        </View>

        <View style={styles.row}>
          <View style={[styles.formGroup, { flex: 1 }]}>
            <Text style={styles.label}>Best Time to Visit</Text>
            <TouchableOpacity style={styles.inputWrapper} onPress={() => setTimeModalVisible(true)}>
              <MaterialIcons name="event" size={20} color="#D4AF37" style={styles.inputIcon} />
              <Text style={[styles.inputText, !bestTimeLabel && styles.placeholderText]}>
                {bestTimeLabel || 'Select time'}
              </Text>
              <MaterialIcons name="keyboard-arrow-down" size={20} color="#311A0B" />
            </TouchableOpacity>
          </View>

          <View style={{ width: 12 }} />

          <View style={[styles.formGroup, { flex: 1 }]}>
            <Text style={styles.label}>Entry Fee <Text style={styles.optionalText}>(Optional)</Text></Text>
            <View style={styles.inputWrapper}>
              <MaterialIcons name="currency-rupee" size={20} color="#D4AF37" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                value={estimatedCost}
                onChangeText={setEstimatedCost}
                placeholder="Ex: ₹0 / Free"
                placeholderTextColor="#96816E"
              />
            </View>
          </View>
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>Tips for Travelers <Text style={styles.optionalText}>(Optional)</Text></Text>
          <View style={[styles.inputWrapper, styles.textAreaWrapper]}>
            <MaterialIcons name="lightbulb-outline" size={20} color="#D4AF37" style={styles.inputIconTop} />
            <TextInput
              style={styles.textArea}
              value={tips}
              onChangeText={setTips}
              placeholder="Share useful tips for travelers"
              placeholderTextColor="#96816E"
              multiline
              maxLength={150}
            />
            <Text style={styles.charCount}>{tips.length}/150</Text>
          </View>
        </View>

        <ImageBackground source={require('../assets/hiddengem_note_banner.jpg')} style={styles.noteBanner} imageStyle={{ borderRadius: 12 }}>
          <View style={styles.noteOverlay}>
            <MaterialIcons name="security" size={24} color="#D4AF37" />
            <View style={styles.noteTextCol}>
              <Text style={styles.noteTitle}>Important Note</Text>
              <Text style={styles.noteDesc}>All hidden gem submissions are reviewed by our team.{'\n'}Fake or misleading submissions may lead to rejection.</Text>
            </View>
          </View>
        </ImageBackground>

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Sticky Bottom Bar */}
      <View style={[styles.bottomBar, { paddingBottom: contentPadBottom }]}>
        <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit} disabled={submitting}>
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <MaterialIcons name="send" size={20} color="#FFF" style={{ transform: [{ rotate: '-45deg' }], marginRight: 8 }} />
              <Text style={styles.submitBtnText}>Submit for Review</Text>
            </>
          )}
        </TouchableOpacity>
        <View style={styles.bottomDisclaimer}>
          <MaterialIcons name="lock" size={12} color="#96816E" />
          <Text style={styles.bottomDisclaimerText}>Your submission will be reviewed and you will be notified after approval.</Text>
        </View>
      </View>

      {/* Category Modal */}
      <Modal visible={categoryModalVisible} transparent animationType="slide">
        <View style={styles.modalBg}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Category</Text>
              <TouchableOpacity onPress={() => setCategoryModalVisible(false)}>
                <MaterialIcons name="close" size={24} color="#311A0B" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalScroll}>
              {CATEGORIES.map(c => (
                <TouchableOpacity key={c.value} style={styles.modalItem} onPress={() => { setCategory(c.value); setCategoryModalVisible(false); }}>
                  <Text style={styles.modalItemIcon}>{c.emoji}</Text>
                  <Text style={styles.modalItemText}>{c.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Time Modal */}
      <Modal visible={timeModalVisible} transparent animationType="slide">
        <View style={styles.modalBg}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Best Time to Visit</Text>
              <TouchableOpacity onPress={() => setTimeModalVisible(false)}>
                <MaterialIcons name="close" size={24} color="#311A0B" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalScroll}>
              {TIME_PERIODS.map(t => (
                <TouchableOpacity key={t.value} style={styles.modalItem} onPress={() => { setBestTimeLabel(t.label); setTimeModalVisible(false); }}>
                  <Text style={styles.modalItemText}>{t.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    alignItems: 'center',
    paddingBottom: 16,
    backgroundColor: '#FFFFFF',
  },
  backBtn: {
    position: 'absolute',
    left: 16,
    bottom: 24,
    width: 44,
    height: 44,
    borderRadius: 22,
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
  },
  headerTitleContainer: {
    alignItems: 'center',
  },
  diamondBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#D4AF37',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#311A0B',
    fontFamily: 'serif',
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#6B4C33',
    marginTop: 4,
  },
  contentPad: {
    padding: 16,
  },
  content: {
    flex: 1,
  },
  heroBanner: {
    width: '100%',
    height: 140,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 24,
  },
  heroOverlay: {
    flex: 1,
    padding: 16,
    backgroundColor: 'rgba(253,251,247,0.4)',
    justifyContent: 'center',
  },
  heroTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#311A0B',
    fontFamily: 'serif',
    marginBottom: 4,
  },
  heroSub: {
    fontSize: 12,
    color: '#311A0B',
    marginBottom: 12,
    fontWeight: '500',
  },
  pointsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  pointsBadgeText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#825936',
    marginLeft: 4,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionDiamond: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#F3E8C4',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#311A0B',
  },
  sectionLine: {
    flex: 1,
    height: 1,
    borderStyle: 'dashed',
    borderWidth: 1,
    borderColor: '#D4AF37',
    marginLeft: 12,
  },
  formGroup: {
    marginBottom: 16,
  },
  row: {
    flexDirection: 'row',
  },
  label: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#311A0B',
    marginBottom: 6,
  },
  asterisk: {
    color: '#EF4444',
  },
  optionalText: {
    fontWeight: 'normal',
    color: '#96816E',
    fontSize: 12,
  },
  subLabel: {
    fontSize: 12,
    color: '#96816E',
    marginBottom: 8,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E8DED1',
    borderRadius: 8,
    minHeight: 48,
    paddingHorizontal: 12,
  },
  textAreaWrapper: {
    alignItems: 'flex-start',
    paddingVertical: 12,
    minHeight: 100,
  },
  inputIcon: {
    marginRight: 8,
  },
  inputIconTop: {
    marginRight: 8,
    marginTop: 2,
  },
  input: {
    flex: 1,
    fontSize: 14,
    color: '#311A0B',
    padding: 0,
  },
  inputText: {
    flex: 1,
    fontSize: 14,
    color: '#311A0B',
  },
  placeholderText: {
    color: '#96816E',
  },
  textArea: {
    flex: 1,
    fontSize: 14,
    color: '#311A0B',
    textAlignVertical: 'top',
    padding: 0,
    minHeight: 80,
  },
  charCount: {
    position: 'absolute',
    bottom: 8,
    right: 12,
    fontSize: 11,
    color: '#96816E',
  },
  useLocationBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D4AF37',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginLeft: 4,
  },
  useLocationText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#D4AF37',
    marginLeft: 4,
  },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 12,
  },
  photoBox: {
    width: '22%',
    aspectRatio: 1,
    borderRadius: 8,
    overflow: 'hidden',
  },
  photoImg: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  photoBoxEmpty: {
    borderWidth: 1,
    borderColor: '#C4A485',
    borderStyle: 'dashed',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoBoxText: {
    fontSize: 10,
    color: '#6B4C33',
    marginTop: 4,
    fontWeight: '500',
  },
  tipBox: {
    flexDirection: 'row',
    backgroundColor: '#FDF6ED',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  tipText: {
    fontSize: 12,
    color: '#825936',
    marginLeft: 8,
    flex: 1,
  },
  noteBanner: {
    width: '100%',
    height: 80,
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 16,
  },
  noteOverlay: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    backgroundColor: 'rgba(253,246,237,0.7)',
  },
  noteTextCol: {
    marginLeft: 12,
    flex: 1,
  },
  noteTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#311A0B',
  },
  noteDesc: {
    fontSize: 11,
    color: '#4A3320',
    marginTop: 2,
    fontWeight: '500',
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderTopWidth: 1,
    borderColor: '#E8DED1',
    alignItems: 'center',
  },
  submitBtn: {
    width: '100%',
    height: 48,
    backgroundColor: '#311A0B',
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  submitBtnText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFF',
  },
  bottomDisclaimer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  bottomDisclaimerText: {
    fontSize: 11,
    color: '#96816E',
    marginLeft: 4,
  },
  modalBg: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '60%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderColor: '#E8DED1',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#311A0B',
  },
  modalScroll: {
    padding: 16,
  },
  modalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: '#F3E8C4',
  },
  modalItemIcon: {
    fontSize: 20,
    marginRight: 12,
  },
  modalItemText: {
    fontSize: 16,
    color: '#311A0B',
  },
});
