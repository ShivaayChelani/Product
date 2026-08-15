import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
  Switch,
  StatusBar,
  Image,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import Video from 'react-native-video';
import { launchImageLibrary, launchCamera } from 'react-native-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';

import { useBottomSafePadding } from '../design/responsive';
import { creatorUploadManager } from '../services/creator/creatorUploadManager';
import { detectReelMediaKind, isStaticImageUrl } from '../services/reels/reelMediaKind';
import { navigateToWorkspaceHome } from '../navigation/workspaceHome';
import { useUserContext } from '../context/UserContext';
import { useDataContext } from '../context/DataContext';

interface CreateVendorReelScreenProps {
  onBack: () => void;
}

const CATEGORIES = [
  { id: 'Hotel / Stay', icon: 'bed-outline' },
  { id: 'Restaurant / Food', icon: 'restaurant-outline' },
  { id: 'Cafe', icon: 'cafe-outline' },
  { id: 'Adventure Activity', icon: 'triangle-outline' },
  { id: 'Tourist Attraction', icon: 'location-outline' },
  { id: 'Shopping', icon: 'bag-handle-outline' },
  { id: 'Events', icon: 'calendar-outline' },
  { id: 'Transport', icon: 'car-outline' },
  { id: 'Offers & Discounts', icon: 'pricetag-outline' },
  { id: 'Resort', icon: 'leaf-outline' },
  { id: 'Other', icon: 'ellipsis-horizontal-circle-outline' },
];

export default function CreateVendorReelScreen({ onBack }: CreateVendorReelScreenProps) {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const contentPadBottom = useBottomSafePadding(24);
  const { user } = useUserContext();
  const { currentVendor } = useDataContext();

  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [videoMime, setVideoMime] = useState<string | null>(null);
  const [videoFileName, setVideoFileName] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [caption, setCaption] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [showOnHome, setShowOnHome] = useState(true);
  
  const [uploading, setUploading] = useState(false);
  const submitLockRef = useRef(false);

  const handlePickVideo = useCallback(async (source: 'gallery' | 'camera') => {
    try {
      const options: any = { mediaType: 'mixed', selectionLimit: 1, durationLimit: 60 };
      let result;
      if (source === 'camera') {
        result = await launchCamera(options);
      } else {
        result = await launchImageLibrary(options);
      }
      
      if (result.assets && result.assets[0]) {
        const asset = result.assets[0];
        setVideoUri(asset.uri || null);
        setVideoMime(asset.type || null);
        setVideoFileName(asset.fileName || null);
      }
    } catch {
      Alert.alert('Error', 'Failed to pick photo or video. Please try again.');
    }
  }, []);



  const handlePublish = useCallback(async () => {
    if (submitLockRef.current) return;
    if (!videoUri) {
      Alert.alert('Validation Error', 'Please select a video for your promotion.');
      return;
    }
    if (!title.trim()) {
      Alert.alert('Validation Error', 'Please enter a Business / Offer Title.');
      return;
    }
    if (!caption.trim()) {
      Alert.alert('Validation Error', 'Please write a caption for your promotion.');
      return;
    }
    if (!selectedCategory) {
      Alert.alert('Validation Error', 'Please select a Promotion Category.');
      return;
    }

    submitLockRef.current = true;
    setUploading(true);
    try {
      if (!user?.uid) {
        throw new Error('Please sign in again to publish this reel.');
      }

      const structuredData = {
        _isStructuredVendorReel: true,
        caption: caption.trim(),
        category: selectedCategory,
        settings: { showOnHome }
      };

      await creatorUploadManager.startReelUpload({
        kind: 'VENDOR',
        videoUri,
        title: title.trim(),
        caption: JSON.stringify(structuredData),
        tags: selectedCategory ? [selectedCategory] : [],
        userId: user.uid,
        userName: currentVendor?.businessName || user.displayName || 'Vendor',
        vendorId: currentVendor?.id,
        mimeType: videoMime || undefined,
        fileName: videoFileName || undefined,
        mediaKind: detectReelMediaKind(videoMime, videoUri, videoFileName),
      });

      navigateToWorkspaceHome(navigation, 'VENDOR');
    } catch (e: any) {
      submitLockRef.current = false;
      setUploading(false);
      if (e?.status === 403 || e?.code === 'PLAN_LIMIT_REACHED') {
        Alert.alert('Upgrade plan', e?.message || 'Your plan does not allow more reels this month.', [
          { text: 'Not now', style: 'cancel' },
          { text: 'Upgrade Plan', onPress: () => navigation.navigate('VendorSubscription') },
        ]);
      } else {
        Alert.alert('Couldn\'t publish your Reel', e?.message || 'Please check your connection and try again.', [
          { text: 'Try Again', style: 'cancel' }
        ]);
      }
    } finally {
      setUploading(false);
    }
  }, [videoUri, videoMime, videoFileName, title, caption, selectedCategory, showOnHome, user, currentVendor, navigation]);

  return (
    <View style={[styles.safe, { paddingTop: Math.max(insets.top, 16) }]}>
      <StatusBar barStyle="dark-content" backgroundColor="#FDFCF8" />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn} disabled={uploading}>
          <Icon name="arrow-back" size={24} color="#4A3018" />
        </TouchableOpacity>
        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerTitle}>Create Promotion Reel</Text>
          <Text style={styles.headerSub}>Share your offers and attract more travelers</Text>
        </View>

      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: contentPadBottom + 100 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Upload Container */}
          <View style={styles.uploadCard}>
            <View style={styles.uploadDashedWrap}>
              {videoUri ? (
                <View style={styles.videoPreviewContainer}>
                  {isStaticImageUrl(videoUri) || detectReelMediaKind(videoMime, videoUri, videoFileName) === 'image' ? (
                    <Image source={{ uri: videoUri }} style={styles.videoPlayer} resizeMode="cover" />
                  ) : (
                    <Video
                      source={{ uri: videoUri }}
                      style={styles.videoPlayer}
                      resizeMode="cover"
                      repeat
                      muted
                    />
                  )}
                  <TouchableOpacity style={styles.changeVideoBtn} onPress={() => handlePickVideo('gallery')}>
                    <Icon name="swap-horizontal" size={16} color="#FFF" />
                    <Text style={styles.changeVideoBtnText}>Change</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity style={styles.uploadArea} onPress={() => handlePickVideo('gallery')} activeOpacity={0.8}>
                  <View style={styles.uploadIconCircle}>
                    <Icon name="cloud-upload-outline" size={32} color="#4A3018" />
                    <View style={styles.playBadge}>
                      <Icon name="play" size={12} color="#FFF" style={{ marginLeft: 2 }} />
                    </View>
                  </View>
                  <Text style={styles.uploadMainText}>Tap to upload photo or video</Text>
                  <Text style={styles.uploadSubText}>Media is saved to the cloud only after your reel publishes</Text>
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.uploadOptionsRow}>
              <TouchableOpacity style={styles.uploadOptionBtn} onPress={() => handlePickVideo('camera')}>
                <Icon name="camera-outline" size={18} color="#4A3018" />
                <Text style={styles.uploadOptionText}>Camera</Text>
              </TouchableOpacity>
              <View style={styles.optionDivider} />
              <TouchableOpacity style={styles.uploadOptionBtn} onPress={() => handlePickVideo('gallery')}>
                <Icon name="images-outline" size={18} color="#4A3018" />
                <Text style={styles.uploadOptionText}>Gallery</Text>
              </TouchableOpacity>

            </View>
          </View>

          {/* Form Fields */}
          <Text style={styles.fieldLabel}>Business / Offer Title <Text style={styles.required}>*</Text></Text>
          <View style={styles.inputContainer}>
            <Icon name="gift-outline" size={20} color="#8C7765" style={styles.inputIcon} />
            <TextInput
              style={styles.textInput}
              placeholder="Enter a catchy title for your offer"
              placeholderTextColor="#A0968C"
              value={title}
              onChangeText={setTitle}
              maxLength={80}
            />
            <Text style={styles.charCount}>{title.length}/80</Text>
          </View>

          <Text style={styles.fieldLabel}>Caption <Text style={styles.required}>*</Text></Text>
          <View style={styles.captionContainer}>
            <Icon name="chatbubble-ellipses-outline" size={20} color="#8C7765" style={styles.inputIconTop} />
            <TextInput
              style={styles.captionInput}
              placeholder="Write a catchy caption for your promotion..."
              placeholderTextColor="#A0968C"
              value={caption}
              onChangeText={setCaption}
              multiline
              maxLength={2200}
            />
            <View style={styles.captionFooter}>
              <Text style={styles.charCount}>{caption.length}/2200</Text>
              <Icon name="happy-outline" size={20} color="#8C7765" style={{ marginLeft: 8 }} />
            </View>
          </View>

          <Text style={styles.fieldLabel}>Promotion Category <Text style={styles.required}>*</Text></Text>
          <Text style={styles.fieldSubLabel}>Choose the category that best describes your promotion</Text>
          <View style={styles.categoriesWrap}>
            {CATEGORIES.map(cat => (
              <TouchableOpacity
                key={cat.id}
                style={[styles.categoryBtn, selectedCategory === cat.id && styles.categoryBtnActive]}
                onPress={() => setSelectedCategory(cat.id)}
                activeOpacity={0.7}
              >
                <Icon
                  name={cat.icon}
                  size={16}
                  color={selectedCategory === cat.id ? '#A87C51' : '#4A3018'}
                  style={styles.categoryIcon}
                />
                <Text style={[styles.categoryText, selectedCategory === cat.id && styles.categoryTextActive]}>
                  {cat.id}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Boost Section */}
          <View style={styles.boostCard}>
            <View style={styles.boostHeaderRow}>
              <View style={styles.boostIconWrap}>
                <Icon name="megaphone-outline" size={22} color="#A87C51" />
              </View>
              <View style={styles.boostHeaderTextWrap}>
                <Text style={styles.boostTitle}>Boost your promotion</Text>
                <Text style={styles.boostSub}>Turn on to feature your reel on PalSafar home feed</Text>
              </View>
            </View>
            <View style={styles.boostSettingRow}>
              <Icon name="planet-outline" size={24} color="#4A3018" style={{ marginRight: 12 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.boostSettingTitle}>Show on PalSafar Home</Text>
                <Text style={styles.boostSettingSub}>Get more visibility and reach more travelers</Text>
              </View>
              <Switch
                value={showOnHome}
                onValueChange={setShowOnHome}
                trackColor={{ false: '#E3DACD', true: '#34C759' }}
                thumbColor="#FFF"
              />
              <TouchableOpacity style={styles.infoBtn}>
                <Icon name="information-circle-outline" size={20} color="#4A3018" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Previews */}
          <View style={styles.previewRow}>
            <TouchableOpacity style={styles.previewCard} onPress={() => {}}>
              <View style={[styles.previewIconWrap, { backgroundColor: '#F0EFFF' }]}>
                <Icon name="eye-outline" size={22} color="#6C5CE7" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.previewCardTitle}>Preview Reel</Text>
                <Text style={styles.previewCardSub}>See how your reel will appear on Map</Text>
              </View>
              <Icon name="chevron-forward" size={18} color="#4A3018" />
            </TouchableOpacity>

            <TouchableOpacity style={styles.previewCard} onPress={() => {}}>
              <View style={[styles.previewIconWrap, { backgroundColor: '#EBF7EE' }]}>
                <Icon name="location-outline" size={22} color="#27AE60" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.previewCardTitle}>View on Map</Text>
                <Text style={styles.previewCardSub}>See how your reel will appear in Business Reel on Map</Text>
              </View>
              <Icon name="chevron-forward" size={18} color="#4A3018" />
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Sticky Publish Button */}
      <View style={[styles.bottomSticky, { paddingBottom: insets.bottom || 24 }]}>
        <TouchableOpacity
          style={[styles.publishBtn, uploading && { opacity: 0.7 }]}
          onPress={handlePublish}
          disabled={uploading}
        >
          {uploading ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <>
              <Text style={styles.publishBtnText}>Publish Reel</Text>
              <Icon name="arrow-forward" size={20} color="#FFF" />
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FDFCF8' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#EFE7DB',
    backgroundColor: '#FFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleWrap: {
    flex: 1,
    paddingHorizontal: 12,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1C1C1E',
  },
  headerSub: {
    fontSize: 12,
    color: '#8C7765',
    marginTop: 2,
  },
  draftsBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 48,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#EFE7DB',
    backgroundColor: '#FFF',
  },
  draftsBtnText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#A87C51',
    marginTop: 2,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  uploadCard: {
    backgroundColor: '#FFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#EFE7DB',
    padding: 16,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 6,
    elevation: 2,
  },
  uploadDashedWrap: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#D4C4B5',
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#F9F7F4',
    marginBottom: 16,
  },
  uploadArea: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
  },
  uploadIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#F3EFE9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  playBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: '#A87C51',
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#F3EFE9',
  },
  uploadMainText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1C1C1E',
    marginBottom: 6,
  },
  uploadSubText: {
    fontSize: 12,
    color: '#8C7765',
  },
  videoPreviewContainer: {
    width: '100%',
    height: 300,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoPlayer: {
    width: '100%',
    height: '100%',
  },
  changeVideoBtn: {
    position: 'absolute',
    bottom: 16,
    right: 16,
    backgroundColor: 'rgba(0,0,0,0.6)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
  },
  changeVideoBtnText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '600',
  },
  uploadOptionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  uploadOptionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    gap: 6,
  },
  uploadOptionText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  optionDivider: {
    width: 1,
    height: 24,
    backgroundColor: '#EFE7DB',
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1C1C1E',
    marginBottom: 8,
  },
  fieldSubLabel: {
    fontSize: 12,
    color: '#8C7765',
    marginBottom: 12,
    marginTop: -4,
  },
  required: {
    color: '#D32F2F',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#EFE7DB',
    borderRadius: 12,
    paddingHorizontal: 14,
    marginBottom: 20,
  },
  inputIcon: {
    marginRight: 10,
  },
  textInput: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 14,
    color: '#1C1C1E',
  },
  charCount: {
    fontSize: 11,
    color: '#A0968C',
    marginLeft: 8,
  },
  captionContainer: {
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#EFE7DB',
    borderRadius: 12,
    padding: 14,
    marginBottom: 24,
  },
  inputIconTop: {
    position: 'absolute',
    top: 14,
    left: 14,
  },
  captionInput: {
    paddingLeft: 32,
    fontSize: 14,
    color: '#1C1C1E',
    minHeight: 80,
    textAlignVertical: 'top',
  },
  captionFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 8,
  },
  categoriesWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 32,
  },
  categoryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#EFE7DB',
    borderRadius: 100,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 6,
  },
  categoryBtnActive: {
    backgroundColor: '#FDF7F0',
    borderColor: '#D4C4B5',
  },
  categoryIcon: {
    // defined inline above
  },
  categoryText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4A3018',
  },
  categoryTextActive: {
    color: '#A87C51',
  },
  boostCard: {
    backgroundColor: '#F9F5EF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
  },
  boostHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  boostIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FDF7F0',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  boostHeaderTextWrap: {
    flex: 1,
  },
  boostTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  boostSub: {
    fontSize: 12,
    color: '#8C7765',
    marginTop: 2,
  },
  boostSettingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#EFE7DB',
  },
  boostSettingTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  boostSettingSub: {
    fontSize: 11,
    color: '#8C7765',
    marginTop: 2,
  },
  infoBtn: {
    marginLeft: 12,
  },
  previewRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  previewCard: {
    flex: 1,
    backgroundColor: '#FFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#EFE7DB',
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  previewIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  previewCardTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  previewCardSub: {
    fontSize: 10,
    color: '#8C7765',
    marginTop: 2,
    paddingRight: 4,
  },
  bottomSticky: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FDFCF8',
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#EFE7DB',
  },
  publishBtn: {
    backgroundColor: '#7D512D',
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    gap: 8,
    shadowColor: '#7D512D',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  publishBtnText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
