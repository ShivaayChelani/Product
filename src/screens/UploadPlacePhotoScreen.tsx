import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Image,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { MaterialIcons } from '../utils/Icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBottomSafePadding } from '../design/responsive';
import * as ImagePicker from 'react-native-image-picker';
import NetInfo from '@react-native-community/netinfo';
import { placesApi, PlaceResponse } from '../services/api/places';
import { haversineDistance, isValidLatLng } from '../services/location/distance';
import { uploadApi } from '../services/api/upload';
import { userPlaceImagesApi } from '../services/api/userPlaceImages';
import { pointRulesApi } from '../services/api/pointRules';

type SelectedPlace = {
  id: string;
  name: string;
  location: string;
  latitude?: number;
  longitude?: number;
};

export default function UploadPlacePhotoScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const contentPadBottom = useBottomSafePadding(24);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PlaceResponse[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedPlace, setSelectedPlace] = useState<SelectedPlace | null>(null);

  const [imageUri, setImageUri] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [uploading, setUploading] = useState(false);
  const [rewardPoints, setRewardPoints] = useState(5);
  const [distanceM, setDistanceM] = useState<number | null>(null);
  const [locationStatus, setLocationStatus] = useState<'idle' | 'checking' | 'ok' | 'far' | 'denied'>('idle');
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await pointRulesApi.getByKey('place_image_approved');
        const data: any = (res as any)?.data ?? res;
        if (!cancelled && typeof data?.points === 'number' && data.points > 0) {
          setRewardPoints(data.points);
        }
      } catch {
        /* keep product default +5 */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const runPlaceSearch = useCallback(async (q: string) => {
    const query = q.trim();
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const res = await placesApi.list({ search: query, limit: 8, status: 'APPROVED' });
      const rows = Array.isArray(res) ? res : Array.isArray((res as any)?.data) ? (res as any).data : [];
      setSearchResults(rows);
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      void runPlaceSearch(searchQuery);
    }, 350);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [searchQuery, runPlaceSearch]);

  const refreshDistance = useCallback(async (place: SelectedPlace | null) => {
    if (!place || !isValidLatLng(place.latitude, place.longitude)) {
      setDistanceM(null);
      setLocationStatus('idle');
      return;
    }
    setLocationStatus('checking');
    try {
      const { Geolocation } = require('react-native-geolocation-service');
      const position: any = await new Promise((resolve, reject) => {
        Geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 12000,
          maximumAge: 10000,
        });
      });
      const meters = haversineDistance(
        position.coords.latitude,
        position.coords.longitude,
        place.latitude as number,
        place.longitude as number,
      );
      if (!Number.isFinite(meters)) {
        setDistanceM(null);
        setLocationStatus('idle');
        return;
      }
      setDistanceM(Math.round(meters));
      setLocationStatus(meters <= 500 ? 'ok' : 'far');
    } catch (err: any) {
      setDistanceM(null);
      const code = err?.code;
      if (code === 1 || /permission/i.test(String(err?.message || ''))) {
        setLocationStatus('denied');
      } else {
        setLocationStatus('idle');
      }
    }
  }, []);

  useEffect(() => {
    void refreshDistance(selectedPlace);
  }, [selectedPlace, refreshDistance]);

  const handleSelectPlace = (place: PlaceResponse) => {
    const location = [place.city, place.state].filter(Boolean).join(', ') || 'India';
    setSelectedPlace({
      id: place.id,
      name: place.name,
      location,
      latitude: place.latitude,
      longitude: place.longitude,
    });
    setSearchQuery('');
    setSearchResults([]);
  };

  const handlePickImage = async () => {
    const result = await ImagePicker.launchImageLibrary({
      mediaType: 'photo',
      quality: 0.8,
    });
    if (result.assets && result.assets[0].uri) {
      setImageUri(result.assets[0].uri);
    }
  };

  const handleUpload = async () => {
    if (uploading) return;
    if (!selectedPlace?.id) {
      Alert.alert('Required', 'Please select a place.');
      return;
    }
    if (!imageUri) {
      Alert.alert('Required', 'Please upload a photo.');
      return;
    }

    setUploading(true);
    try {
      const net = await NetInfo.fetch();
      if (!(net.isConnected && net.isInternetReachable !== false)) {
        throw new Error("You're offline. Please reconnect and try again.");
      }

      const uploadRes = await uploadApi.uploadImage(imageUri);
      await userPlaceImagesApi.contribute(selectedPlace.id, uploadRes.url);
      Alert.alert(
        'Submitted',
        `Your photo was submitted for admin review. You'll earn +${rewardPoints} PalPoints if approved.`,
        [{ text: 'OK', onPress: () => navigation.goBack() }],
      );
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        'Failed to submit photo. Please try again.';
      Alert.alert('Upload failed', msg);
    } finally {
      setUploading(false);
    }
  };

  const verificationTitle =
    locationStatus === 'ok'
      ? 'Location Verified'
      : locationStatus === 'far'
        ? 'Far from place'
        : locationStatus === 'denied'
          ? 'Location permission needed'
          : locationStatus === 'checking'
            ? 'Checking location…'
            : 'Location check';

  const verificationDesc1 =
    locationStatus === 'ok'
      ? `You are near ${selectedPlace?.name || 'the place'}.`
      : locationStatus === 'far'
        ? 'You can still upload. Admin approval is required for PalPoints.'
        : locationStatus === 'denied'
          ? 'Location permission is required to verify this visit.'
          : selectedPlace
            ? 'Select GPS permission to verify proximity (optional for upload).'
            : 'Select a place to check nearby status.';

  const verificationDesc2 =
    locationStatus === 'ok'
      ? 'Your location has been verified.'
      : locationStatus === 'denied'
        ? 'Enable location in Settings if you want proximity checks.'
        : 'PalPoints are awarded only after admin approval.';

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back-ios" size={20} color="#311A0B" style={{ marginLeft: 6 }} />
        </TouchableOpacity>

        <View style={styles.headerTextContainer}>
          <Text style={styles.headerTitle}>Upload Place Photo</Text>
          <View style={styles.titleUnderline} />
          <Text style={styles.headerSubtitle}>Upload a photo of the place and earn PalPoints</Text>
        </View>

        <View style={styles.headerRightIcon}>
           {/* Placeholder for the balloon illustration. In real app, this might be an absolute positioned Image. */}
        </View>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={[styles.contentPad, { paddingBottom: contentPadBottom + 100 }]} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

        {/* Hero Card */}
        <View style={styles.heroCard}>
          <View style={styles.heroLeft}>
            <Image source={require('../assets/upload_place.png')} style={styles.heroImg} resizeMode="contain" />
          </View>
          <View style={styles.heroMid}>
            <Text style={styles.earnText}>Earn</Text>
            <Text style={styles.pointsText}>+{rewardPoints}</Text>
            <Text style={styles.palPointsText}>PalPoints</Text>
            <Text style={styles.heroDesc}>for uploading a valid photo of the place</Text>
          </View>
          <View style={styles.heroRight}>
            <View style={styles.benefitRow}>
              <MaterialIcons name="verified-user" size={16} color="#B58D3D" />
              <Text style={styles.benefitText}>Share real places</Text>
            </View>
            <View style={styles.benefitRow}>
              <MaterialIcons name="card-giftcard" size={16} color="#D85C3A" />
              <Text style={styles.benefitText}>Earn PalPoints</Text>
            </View>
            <View style={styles.benefitRow}>
              <MaterialIcons name="workspace-premium" size={16} color="#D4AF37" />
              <Text style={styles.benefitText}>Inspire other travelers</Text>
            </View>
            <View style={styles.benefitRow}>
              <MaterialIcons name="people-outline" size={16} color="#825936" />
              <Text style={styles.benefitText}>Build your journey reputation</Text>
            </View>
          </View>
        </View>

        {/* 1. Select Place */}
        <View style={styles.formSection}>
          <Text style={styles.sectionTitle}>1. Select Place <Text style={styles.requiredText}>(Required)</Text></Text>

          <View style={styles.searchInputWrapper}>
            <MaterialIcons name="search" size={20} color="#96816E" style={styles.inputIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search or select a place"
              placeholderTextColor="#96816E"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            <TouchableOpacity onPress={() => void refreshDistance(selectedPlace)}>
              <MaterialIcons name="my-location" size={20} color="#825936" />
            </TouchableOpacity>
          </View>

          {searching ? (
            <ActivityIndicator color="#825936" style={{ marginBottom: 8 }} />
          ) : null}

          {searchResults.length > 0 && !selectedPlace ? (
            <View style={styles.searchResults}>
              {searchResults.map((place) => (
                <TouchableOpacity
                  key={place.id}
                  style={styles.searchResultRow}
                  onPress={() => handleSelectPlace(place)}
                >
                  <Text style={styles.selectedPlaceName}>{place.name}</Text>
                  <Text style={styles.selectedPlaceLoc}>
                    {[place.city, place.state].filter(Boolean).join(', ')}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}

          {selectedPlace && (
            <View style={styles.selectedPlaceCard}>
              <View style={styles.pinIconWrapper}>
                <MaterialIcons name="place" size={20} color="#D85C3A" />
              </View>
              <View style={styles.selectedPlaceTextCol}>
                <Text style={styles.selectedPlaceName}>{selectedPlace.name}</Text>
                <Text style={styles.selectedPlaceLoc}>{selectedPlace.location}</Text>
              </View>
              <TouchableOpacity onPress={() => setSelectedPlace(null)}>
                <MaterialIcons name="close" size={20} color="#311A0B" />
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* 2. Upload Photo */}
        <View style={styles.formSection}>
          <Text style={styles.sectionTitle}>2. Upload Photo of the Place <Text style={styles.requiredText}>(Required)</Text></Text>

          <TouchableOpacity style={styles.uploadBox} onPress={handlePickImage} disabled={uploading}>
            {imageUri ? (
               <Image source={{ uri: imageUri }} style={styles.uploadedImg} />
            ) : (
              <>
                <MaterialIcons name="image" size={40} color="#D85C3A" />
                <Text style={styles.uploadBoxTitle}>Upload a clear photo of the place</Text>
                <Text style={styles.uploadBoxSub}>Tap to upload or drag and drop</Text>
                <Text style={styles.uploadBoxHint}>JPG, PNG up to 10MB</Text>
              </>
            )}
          </TouchableOpacity>

          <View style={styles.infoBanner}>
            <MaterialIcons name="info-outline" size={16} color="#1976D2" style={{ marginRight: 8 }} />
            <Text style={styles.infoBannerText}>Make sure the photo shows the place clearly. No selfies or people-focused photos.</Text>
          </View>
        </View>

        {/* 3. Add Caption */}
        <View style={styles.formSection}>
          <Text style={styles.sectionTitle}>3. Add a Caption <Text style={styles.optionalText}>(Optional)</Text></Text>
          <View style={styles.captionWrapper}>
            <TextInput
              style={styles.captionInput}
              placeholder="Write a caption about this place..."
              placeholderTextColor="#96816E"
              multiline
              maxLength={150}
              value={caption}
              onChangeText={setCaption}
            />
            <Text style={styles.charCount}>{caption.length}/150</Text>
          </View>
        </View>

        {/* 4. Location Verification */}
        <View style={styles.formSection}>
          <Text style={styles.sectionTitle}>4. Location Verification</Text>
          <View style={[
            styles.verificationCard,
            locationStatus === 'far' || locationStatus === 'denied' ? { backgroundColor: '#FFF8E1', borderColor: '#FFE0B2' } : null,
          ]}>
            <View style={styles.verificationIconCol}>
              <MaterialIcons
                name="location-on"
                size={32}
                color={locationStatus === 'ok' ? '#2E7D32' : '#F57C00'}
              />
              {locationStatus === 'ok' ? (
                <View style={styles.verificationCheck}>
                  <MaterialIcons name="check-circle" size={14} color="#FFF" />
                </View>
              ) : null}
            </View>
            <View style={styles.verificationMidCol}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={styles.verificationTitle}>{verificationTitle}</Text>
                {locationStatus === 'ok' ? (
                  <MaterialIcons name="verified" size={16} color="#2E7D32" style={{ marginLeft: 4 }} />
                ) : null}
              </View>
              <Text style={styles.verificationDesc}>{verificationDesc1}</Text>
              <Text style={styles.verificationDesc}>{verificationDesc2}</Text>
              {locationStatus === 'denied' ? (
                <TouchableOpacity onPress={() => Linking.openSettings()} style={{ marginTop: 6 }}>
                  <Text style={[styles.verificationDesc, { fontWeight: 'bold' }]}>Open Settings</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            <View style={styles.verificationRightCol}>
              <Text style={styles.verificationDistLabel}>Distance</Text>
              <Text style={styles.verificationDistValue}>
                {distanceM != null ? `${distanceM} m` : '—'}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                <Text style={styles.verificationStatusText}>
                  {locationStatus === 'ok' ? 'Excellent' : locationStatus === 'far' ? 'Far' : '—'}
                </Text>
                {locationStatus === 'ok' ? <View style={styles.statusDot} /> : null}
              </View>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Footer */}
      <View style={[styles.footer, { paddingBottom: Math.max(contentPadBottom, 16) }]}>
        <View style={styles.footerLeft}>
          <Image source={require('../assets/palpoint icon.png')} style={styles.coinIcon} />
          <View style={{ marginLeft: 8 }}>
            <Text style={styles.footerEarnLabel}>You will earn</Text>
            <Text style={styles.footerEarnValue}>
              <Text style={styles.footerEarnHighlight}>+{rewardPoints} PalPoints</Text> after approval.
            </Text>
          </View>
        </View>
        <TouchableOpacity
          style={[styles.uploadBtn, uploading && { opacity: 0.6 }]}
          onPress={() => { void handleUpload(); }}
          disabled={uploading}
        >
          {uploading ? (
            <ActivityIndicator color="#FFF" style={{ marginRight: 6 }} />
          ) : (
            <MaterialIcons name="file-upload" size={20} color="#FFF" style={{ marginRight: 6 }} />
          )}
          <Text style={styles.uploadBtnText}>{uploading ? 'Uploading…' : 'Upload Photo'}</Text>
        </TouchableOpacity>
      </View>

    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFDF9',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 16,
    backgroundColor: '#FFFDF9',
    justifyContent: 'space-between',
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#F0E5D8',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  headerTextContainer: {
    alignItems: 'center',
    flex: 1,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#311A0B',
    fontFamily: 'serif',
  },
  titleUnderline: {
    width: 60,
    height: 2,
    backgroundColor: '#D4AF37',
    marginTop: 4,
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#6B4C33',
  },
  headerRightIcon: {
    width: 40,
  },
  content: {
    flex: 1,
  },
  contentPad: {
    padding: 16,
  },
  heroCard: {
    flexDirection: 'row',
    backgroundColor: '#FFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#FFFFFF',
    padding: 12,
    marginBottom: 24,
    alignItems: 'center',
  },
  heroLeft: {
    width: '30%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroImg: {
    width: 80,
    height: 80,
  },
  heroMid: {
    width: '30%',
    alignItems: 'center',
    borderRightWidth: 1,
    borderColor: '#F0E5D8',
    paddingRight: 8,
  },
  earnText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#311A0B',
  },
  pointsText: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#D85C3A',
    lineHeight: 32,
  },
  palPointsText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#311A0B',
    marginBottom: 4,
  },
  heroDesc: {
    fontSize: 10,
    color: '#6B4C33',
    textAlign: 'center',
  },
  heroRight: {
    width: '40%',
    paddingLeft: 12,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  benefitText: {
    fontSize: 10,
    color: '#4A3320',
    marginLeft: 6,
    flex: 1,
  },
  formSection: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#311A0B',
    marginBottom: 10,
  },
  requiredText: {
    fontWeight: 'normal',
    color: '#96816E',
    fontSize: 11,
  },
  optionalText: {
    fontWeight: 'normal',
    color: '#96816E',
    fontSize: 11,
  },
  searchInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E8DED1',
    borderRadius: 8,
    height: 48,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  inputIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#311A0B',
  },
  searchResults: {
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E8DED1',
    borderRadius: 8,
    marginBottom: 12,
    overflow: 'hidden',
  },
  searchResultRow: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F0E5D8',
  },
  selectedPlaceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FAF5EF',
    borderRadius: 8,
    padding: 12,
  },
  pinIconWrapper: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  selectedPlaceTextCol: {
    flex: 1,
  },
  selectedPlaceName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#311A0B',
  },
  selectedPlaceLoc: {
    fontSize: 12,
    color: '#6B4C33',
    marginTop: 2,
  },
  uploadBox: {
    borderWidth: 1,
    borderColor: '#E8DED1',
    borderStyle: 'dashed',
    borderRadius: 12,
    backgroundColor: '#FFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    marginBottom: 12,
    overflow: 'hidden',
  },
  uploadedImg: {
    width: '100%',
    height: 200,
    resizeMode: 'cover',
  },
  uploadBoxTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#311A0B',
    marginTop: 12,
  },
  uploadBoxSub: {
    fontSize: 12,
    color: '#6B4C33',
    marginTop: 4,
  },
  uploadBoxHint: {
    fontSize: 11,
    color: '#96816E',
    marginTop: 8,
  },
  infoBanner: {
    flexDirection: 'row',
    backgroundColor: '#FFF8E1',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  infoBannerText: {
    fontSize: 12,
    color: '#5D4037',
    flex: 1,
  },
  captionWrapper: {
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E8DED1',
    borderRadius: 8,
    minHeight: 100,
    padding: 12,
  },
  captionInput: {
    flex: 1,
    fontSize: 14,
    color: '#311A0B',
    textAlignVertical: 'top',
    padding: 0,
  },
  charCount: {
    alignSelf: 'flex-end',
    fontSize: 11,
    color: '#96816E',
    marginTop: 8,
  },
  verificationCard: {
    flexDirection: 'row',
    backgroundColor: '#F1F8E9',
    borderWidth: 1,
    borderColor: '#C8E6C9',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  verificationIconCol: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#E8F5E9',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  verificationCheck: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    backgroundColor: '#2E7D32',
    borderRadius: 8,
    padding: 1,
  },
  verificationMidCol: {
    flex: 1,
  },
  verificationTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1B5E20',
    marginBottom: 4,
  },
  verificationDesc: {
    fontSize: 11,
    color: '#2E7D32',
  },
  verificationRightCol: {
    alignItems: 'flex-end',
  },
  verificationDistLabel: {
    fontSize: 11,
    color: '#2E7D32',
  },
  verificationDistValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1B5E20',
  },
  verificationStatusText: {
    fontSize: 10,
    color: '#2E7D32',
    marginRight: 4,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#2E7D32',
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    backgroundColor: '#FFFDF9',
    padding: 16,
    borderTopWidth: 1,
    borderColor: '#E8DED1',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  footerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
  },
  coinIcon: {
    width: 32,
    height: 32,
  },
  footerEarnLabel: {
    fontSize: 11,
    color: '#96816E',
  },
  footerEarnValue: {
    fontSize: 11,
    color: '#6B4C33',
  },
  footerEarnHighlight: {
    fontWeight: 'bold',
    color: '#D85C3A',
  },
  uploadBtn: {
    backgroundColor: '#311A0B',
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  uploadBtnText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#FFF',
  },
});
