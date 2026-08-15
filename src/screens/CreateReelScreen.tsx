import React, { useState, useCallback } from 'react';
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
  Image,
  Modal,
} from 'react-native';
import Geolocation from 'react-native-geolocation-service';
import Icon from 'react-native-vector-icons/Ionicons';
import Video from 'react-native-video';
import { launchImageLibrary } from 'react-native-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUserContext } from '../context/UserContext';
import { useDataContext } from '../context/DataContext';
import { placesApi } from '../services/api';
import { creatorApi } from '../features/creator/api/creatorApi';
import { uploadReelVideo } from '../services/reelService';
import { caughtErrorMessage } from '../utils/caughtError';
import { useNavigation } from '@react-navigation/native';
import { creatorUploadManager } from '../services/creator/creatorUploadManager';

interface CreateReelScreenProps {
  onBack: () => void;
  onSaveReel: (
    data: { videoUri: string; caption: string; spotId: string; spotName?: string; tags: string[] },
    onProgress?: (p: number) => void
  ) => Promise<void>;
  uploadProgress?: number;
  sourceReelId?: string;
  captionHint?: string;
  suppressSuccessAlert?: boolean;
  prefillPlaceId?: string;
  prefillPlaceName?: string;
  editReel?: any;
  collaborationId?: string;
  useBackgroundUpload?: boolean;
}

const C = {
  bg: '#FCF9F5',
  white: '#FFFFFF',
  brown: '#4B3B30',
  brownLight: '#8C7765',
  text: '#1F1A17',
  textSub: '#5E544C',
  textMuted: '#A0968C',
  border: '#E3DACD',
  chipBg: '#F3EFE9',
  chipActiveBg: '#EFE7DB',
  green: '#2E7D32',
};

const REEL_TAGS = [
  { label: 'Travel', icon: 'briefcase-outline' },
  { label: 'Food', icon: 'restaurant-outline' },
  { label: 'Adventure', icon: 'triangle-outline' },
  { label: 'History', icon: 'library-outline' },
  { label: 'Hidden Gems', icon: 'diamond-outline' },
  { label: 'Events', icon: 'calendar-outline' },
  { label: 'Shopping', icon: 'bag-handle-outline' },
  { label: 'Temple', icon: 'business-outline' },
  { label: 'Nature', icon: 'leaf-outline' },
  { label: 'Culture', icon: 'color-palette-outline' },
];

export default function CreateReelScreen({
  onBack,
  onSaveReel,
  uploadProgress = 0,
  sourceReelId,
  captionHint,
  suppressSuccessAlert = false,
  prefillPlaceId,
  prefillPlaceName,
  editReel,
  collaborationId,
  useBackgroundUpload = true,
}: CreateReelScreenProps) {
  const { user } = useUserContext();
  const { currentVendor: _currentVendor } = useDataContext();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const isDraftEdit = String(editReel?.status || '').toUpperCase() === 'DRAFT';

  const [videoUri, setVideoUri] = useState<string | null>(editReel?.videoUrl || null);
  const [_videoThumbnail, setVideoThumbnail] = useState<string | null>(editReel?.thumbnail || null);
  const [videoMime, setVideoMime] = useState<string | null>(null);
  const [videoFileName, setVideoFileName] = useState<string | null>(null);
  const [caption, setCaption] = useState(editReel?.description || captionHint?.trim() || '');
  const [selectedTags, setSelectedTags] = useState<string[]>(editReel?.tags || []);
  const [uploading, setUploading] = useState(false);

  // Settings State
  const [audience, setAudience] = useState<'Everyone' | 'Followers' | 'Only Me'>('Everyone');
  const [allowComments, setAllowComments] = useState(true);
  const [allowRemix, setAllowRemix] = useState(true);

  const handleAudiencePress = () => {
    Alert.alert('Audience', 'Who can see this reel?', [
      { text: 'Everyone', onPress: () => setAudience('Everyone') },
      { text: 'Followers', onPress: () => setAudience('Followers') },
      { text: 'Only Me', onPress: () => setAudience('Only Me') },
    ]);
  };

  // Location State
  const [locationModalVisible, setLocationModalVisible] = useState(false);
  const [locationName, setLocationName] = useState(editReel?.place?.name || prefillPlaceName || '');
  const [spotId, setSpotId] = useState(editReel?.placeId || prefillPlaceId || '');
  const [suggestions, setSuggestions] = useState<any[]>([]);

  React.useEffect(() => {
    const fetchPlaces = async () => {
      if (!locationName.trim() || spotId) {
        setSuggestions([]);
        return;
      }
      try {
        const res = await placesApi.list({ search: locationName, limit: 5 });
        const data = (res as any)?.data || res;
        if (Array.isArray(data)) {
          setSuggestions(data);
        }
      } catch (err) {
        console.warn('Failed to fetch places', err);
      }
    };
    const timer = setTimeout(fetchPlaces, 300);
    return () => clearTimeout(timer);
  }, [locationName, spotId]);
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');

  const handleGetCurrentLocation = () => {
    Geolocation.getCurrentPosition(
      (position) => {
        setLatitude(position.coords.latitude.toFixed(6));
        setLongitude(position.coords.longitude.toFixed(6));
        if (!locationName) setLocationName('Current Location');
      },
      (error) => {
        Alert.alert('Location Error', error.message);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
    );
  };

  const roles = user?.roles?.length
    ? user.roles
    : [user?.activeRole || (user?.role === 'creator' ? 'CONTENT_CREATOR' : 'USER')];
  const creatorApproved =
    (roles.includes('CONTENT_CREATOR') || user?.permission === 'CONTENT_CREATOR' || user?.role === 'creator')
    && (user?.creatorProfile?.status === 'APPROVED');
  const canUpload = creatorApproved;

  const handlePickVideo = useCallback(async () => {
    try {
      const result = await launchImageLibrary({
        mediaType: 'video',
        selectionLimit: 1,
      });
      if (result.assets && result.assets[0]) {
        const asset = result.assets[0];
        setVideoUri(asset.uri || null);
        setVideoMime(asset.type || null);
        setVideoFileName(asset.fileName || null);
        setVideoThumbnail(null);
      }
    } catch (err: unknown) {
      Alert.alert('Error', caughtErrorMessage(err, 'Failed to pick video.'));
    }
  }, []);

  const handleToggleTag = useCallback((tag: string) => {
    setSelectedTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  }, []);

  const handlePost = useCallback(async () => {
    if (!videoUri) {
      Alert.alert('Error', 'Please select a video.');
      return;
    }
    if (!caption.trim()) {
      Alert.alert('Error', 'Please add a caption.');
      return;
    }
    setUploading(true);
    try {
      let finalSpotId = spotId;
      if (!finalSpotId && locationName.trim()) {
        try {
          const res = await placesApi.list({ search: locationName.trim(), limit: 1 });
          const data = (res as any)?.data || res;
          if (Array.isArray(data) && data[0]?.id) {
            finalSpotId = data[0].id;
          }
        } catch {}
      }

      const isNonDraftEdit = Boolean(editReel && !isDraftEdit);
      const shouldBackgroundUpload =
        useBackgroundUpload && !collaborationId && !isNonDraftEdit && user?.uid;

      if (shouldBackgroundUpload) {
        await creatorUploadManager.startReelUpload({
          videoUri,
          caption: caption.trim(),
          spotId: finalSpotId || undefined,
          spotName: locationName || undefined,
          tags: selectedTags,
          userId: user!.uid,
          userName: user!.displayName || 'Creator',
          mimeType: videoMime || undefined,
          fileName: videoFileName || undefined,
          editReelId: isDraftEdit && editReel?.id ? String(editReel.id) : undefined,
          publishDraft: isDraftEdit && Boolean(editReel?.id),
        });
        navigation.navigate('CreatorTabs', { screen: 'Dashboard' });
        return;
      }

      await onSaveReel({
        videoUri,
        caption: caption.trim(),
        spotId: finalSpotId,
        spotName: locationName,
        tags: selectedTags,
      }, (_progress) => {});
      if (isDraftEdit && editReel?.id) {
        await creatorApi.publishDraft(String(editReel.id));
      }
      if (!suppressSuccessAlert) {
        Alert.alert('Success', editReel ? 'Reel updated successfully!' : 'Reel posted successfully!');
        onBack();
      }
    } catch (err: unknown) {
      Alert.alert('Error', caughtErrorMessage(err, 'Failed to post reel. Please try again.'));
    } finally {
      setUploading(false);
    }
  }, [
    videoUri,
    caption,
    spotId,
    locationName,
    selectedTags,
    onSaveReel,
    onBack,
    suppressSuccessAlert,
    editReel,
    isDraftEdit,
    collaborationId,
    useBackgroundUpload,
    user,
    navigation,
    videoMime,
    videoFileName,
  ]);

  const handleOpenDrafts = useCallback(() => {
    navigation.navigate('CreatorTabs', { screen: 'Reels', params: { initialTab: 'DRAFT' } });
  }, [navigation]);

  const handleSaveDraft = useCallback(async () => {
    if (!videoUri) {
      Alert.alert('Video required', 'Select a video before saving a draft.');
      return;
    }
    setUploading(true);
    try {
      let finalSpotId = spotId;
      if (!finalSpotId && locationName.trim()) {
        try {
          const res = await placesApi.list({ search: locationName.trim(), limit: 1 });
          const data = (res as any)?.data || res;
          if (Array.isArray(data) && data[0]?.id) {
            finalSpotId = data[0].id;
          }
        } catch { /* optional place binding */ }
      }

      if (isDraftEdit && editReel?.id) {
        const { socialApi } = require('../services/api');
        await socialApi.updateReel(editReel.id, {
          title: caption.trim().slice(0, 200) || undefined,
          description: caption.trim() || undefined,
          placeId: finalSpotId || null,
          tags: selectedTags,
        });
        Alert.alert('Draft saved', 'Your draft was updated.', [{ text: 'OK', onPress: () => onBack() }]);
        return;
      }

      const alreadyRemote = /^https?:\/\//i.test(videoUri);
      const videoUrl = alreadyRemote ? videoUri : await uploadReelVideo(videoUri, undefined, videoMime, videoFileName);
      await creatorApi.saveDraft({
        videoUrl,
        title: caption.trim().slice(0, 200) || undefined,
        description: caption.trim() || undefined,
        placeId: finalSpotId || undefined,
      });
      Alert.alert('Draft saved', 'Find it under Creator → Reels → Drafts. It is not public.', [
        { text: 'OK', onPress: () => onBack() },
      ]);
    } catch (err: unknown) {
      Alert.alert('Could not save draft', caughtErrorMessage(err, 'Draft save failed. Please try again.'));
    } finally {
      setUploading(false);
    }
  }, [videoUri, caption, spotId, locationName, selectedTags, isDraftEdit, editReel, onBack, videoMime, videoFileName]);

  if (!canUpload) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onBack} style={styles.backBtn}>
            <Icon name="chevron-back" size={24} color={C.text} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>{editReel ? 'Edit Reel' : 'Create Reel'}</Text>
            <Text style={styles.headerSub}>{editReel ? 'Update your reel details' : 'Share your moments with PalSafar'}</Text>
          </View>
          <View style={{ width: 44 }} />
        </View>
        <View style={styles.unauthorizedContainer}>
          <Icon name="lock-closed" size={64} color={C.textMuted} />
          <Text style={styles.unauthorizedTitle}>Creators Only</Text>
          <Text style={styles.unauthorizedText}>
            Only approved Content Creators can upload reels.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: Math.max(insets.top, 16) }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Icon name="chevron-back" size={24} color={C.text} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>{editReel ? 'Edit Reel' : 'Create Reel'}</Text>
          <Text style={styles.headerSub}>{editReel ? 'Update your reel details' : 'Share your moments with PalSafar'}</Text>
        </View>
        <TouchableOpacity
          onPress={handlePost}
          disabled={uploading || !videoUri}
          style={[styles.headerPostBtn, (!videoUri || uploading) && { opacity: 0.5 }]}
        >
          {uploading ? (
            <ActivityIndicator size="small" color={C.white} />
          ) : (
            <Text style={styles.headerPostBtnText}>Post</Text>
          )}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView 
          contentContainerStyle={styles.scrollContent} 
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Upload Area */}
          <View style={styles.uploadCard}>
            <TouchableOpacity style={styles.uploadDashedArea} onPress={handlePickVideo} activeOpacity={0.8}>
              {videoUri ? (
                <View style={styles.videoPreviewWrap}>
                  <Video
                    source={{ uri: videoUri }}
                    style={styles.videoThumb}
                    resizeMode="cover"
                    repeat
                    muted
                  />
                  <View style={styles.changeBadge}>
                    <Icon name="swap-horizontal" size={14} color={C.white} />
                    <Text style={styles.changeBadgeText}>Change Video</Text>
                  </View>
                </View>
              ) : (
                <View style={styles.uploadPlaceholder}>
                  <View style={styles.uploadIconWrap}>
                    <Icon name="cloud-upload-outline" size={36} color={C.brown} />
                  </View>
                  <Text style={styles.uploadTitle}>Tap to select video</Text>
                  <Text style={styles.uploadSub}>MP4, MOV, AVI up to 100MB</Text>
                  <Text style={styles.uploadSub}>Recommended: 9:16 (Portrait)</Text>
                </View>
              )}
            </TouchableOpacity>

            <View style={styles.uploadTabs}>
              <TouchableOpacity 
                style={styles.uploadTab} 
                onPress={editReel ? undefined : handlePickVideo}
                activeOpacity={editReel ? 1 : 0.2}
              >
                <Icon name="camera-outline" size={18} color={C.text} />
                <Text style={styles.uploadTabText}>Camera</Text>
              </TouchableOpacity>
              <View style={styles.uploadTabDivider} />
              <TouchableOpacity 
                style={styles.uploadTab} 
                onPress={editReel ? undefined : handlePickVideo}
                activeOpacity={editReel ? 1 : 0.2}
              >
                <Icon name="images-outline" size={18} color={C.text} />
                <Text style={styles.uploadTabText}>Gallery</Text>
              </TouchableOpacity>
              <View style={styles.uploadTabDivider} />
              <TouchableOpacity style={styles.uploadTab} onPress={handleOpenDrafts}>
                <Icon name="folder-outline" size={18} color={C.text} />
                <Text style={styles.uploadTabText}>Drafts</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Upload Progress */}
          {uploading && (
            <View style={styles.progressContainer}>
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${uploadProgress}%` }]} />
              </View>
              <Text style={styles.progressText}>{uploadProgress}%</Text>
            </View>
          )}


          {/* Caption */}
          <Text style={styles.sectionLabel}>Caption</Text>
          <View style={styles.captionWrap}>
            <TextInput
              style={styles.captionInput}
              placeholder="Write a caption..."
              placeholderTextColor={C.textMuted}
              value={caption}
              onChangeText={setCaption}
              multiline
              maxLength={2200}
            />
            <View style={styles.captionFooter}>
              <Text style={styles.charCount}>{caption.length}/2200</Text>
              <TouchableOpacity>
                <Icon name="happy-outline" size={24} color={C.textMuted} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Tags */}
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionLabel}>Tags</Text>
            <TouchableOpacity>
              <Text style={styles.seeAllText}>See all</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.tagsWrap}>
            {REEL_TAGS.map(tagObj => {
              const active = selectedTags.includes(tagObj.label);
              return (
                <TouchableOpacity
                  key={tagObj.label}
                  style={[styles.tag, active && styles.tagActive]}
                  onPress={() => handleToggleTag(tagObj.label)}
                >
                  <Icon 
                    name={tagObj.icon} 
                    size={16} 
                    color={active ? C.brown : C.text} 
                    style={{ marginRight: 6 }} 
                  />
                  <Text style={[styles.tagText, active && styles.tagTextActive]}>{tagObj.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Location */}
          <TouchableOpacity style={styles.locationCard} onPress={() => setLocationModalVisible(true)}>
            <Icon name="location-outline" size={24} color={C.text} style={{ marginRight: 16 }} />
            <View style={{ flex: 1 }}>
              <Text style={styles.locationTitle}>{locationName || (latitude && longitude ? `${latitude}, ${longitude}` : 'Add Location')}</Text>
              <Text style={styles.locationSub}>{locationName || latitude ? 'Location attached' : 'Let people know where this was taken'}</Text>
            </View>
            <Icon name="chevron-forward" size={20} color={C.textMuted} />
          </TouchableOpacity>

          {/* Settings Row */}
          <View style={styles.settingsGrid}>
            <TouchableOpacity style={styles.settingCol} onPress={handleAudiencePress}>
              <Icon name="people-outline" size={24} color={C.text} />
              <Text style={styles.settingLabel} numberOfLines={1} adjustsFontSizeToFit>Audience</Text>
              <View style={styles.settingValRow}>
                <Text style={styles.settingValText} numberOfLines={1}>{audience}</Text>
                <Icon name="chevron-down" size={14} color={C.green} />
              </View>
            </TouchableOpacity>
            
            <View style={styles.settingDivider} />
            
            <TouchableOpacity style={styles.settingCol} onPress={() => setAllowComments(!allowComments)}>
              <Icon name="chatbubble-ellipses-outline" size={24} color={C.text} />
              <Text style={styles.settingLabel} numberOfLines={1} adjustsFontSizeToFit>Comments</Text>
              <View style={styles.settingValRow}>
                <Text style={styles.settingValText}>{allowComments ? 'On' : 'Off'}</Text>
                <Icon name="chevron-down" size={14} color={C.green} />
              </View>
            </TouchableOpacity>
          </View>
          
          <View style={{ height: 24 }} />
        </ScrollView>

        {/* Sticky Bottom Bar */}
        <View style={[styles.stickyBottom, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <TouchableOpacity style={styles.draftBtn} onPress={() => { void handleSaveDraft(); }} disabled={uploading}>
            <Icon name="bookmark-outline" size={20} color={C.brown} style={{ marginRight: 8 }} />
            <Text style={styles.draftBtnText}>Save as Draft</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.primaryPostBtn} onPress={handlePost} disabled={uploading || !videoUri}>
            {uploading ? (
              <ActivityIndicator color={C.white} />
            ) : (
              <>
                <Icon name="paper-plane-outline" size={20} color={C.white} style={{ marginRight: 8 }} />
                <Text style={styles.primaryPostBtnText}>{editReel ? 'Save Changes' : 'Post Reel'}</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

      </KeyboardAvoidingView>

      {/* Location Modal */}
      <Modal visible={locationModalVisible} transparent animationType="slide" onRequestClose={() => setLocationModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingBottom: Math.max(insets.bottom, 24) }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Location</Text>
              <TouchableOpacity onPress={() => setLocationModalVisible(false)} style={styles.modalCloseBtn}>
                <Icon name="close" size={24} color={C.text} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.gpsBtn} onPress={handleGetCurrentLocation}>
              <Icon name="navigate" size={20} color={C.white} style={{ marginRight: 8 }} />
              <Text style={styles.gpsBtnText}>Use Current Location</Text>
            </TouchableOpacity>

            <Text style={styles.inputLabel}>Location Name</Text>
            <TextInput
              style={styles.locationInput}
              placeholder="e.g. Bhedhaghat, jabalpur"
              placeholderTextColor={C.textMuted}
              value={locationName}
              onChangeText={(txt) => {
                setLocationName(txt);
                setSpotId('');
              }}
            />
            {suggestions.length > 0 && (
              <View style={styles.suggestionsBox}>
                {suggestions.map((p: any) => (
                  <TouchableOpacity 
                    key={p.id} 
                    style={styles.suggestionRow}
                    onPress={() => {
                      setLocationName(p.name);
                      setSpotId(p.id);
                      setSuggestions([]);
                    }}
                  >
                    <Icon name="location-outline" size={16} color={C.textSub} style={{ marginRight: 8 }} />
                    <View>
                      <Text style={styles.suggestionName}>{p.name}</Text>
                      <Text style={styles.suggestionAddress}>{p.city || 'Unknown City'}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <View style={styles.coordRow}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text style={styles.inputLabel}>Latitude</Text>
                <TextInput
                  style={styles.locationInput}
                  placeholder="0.000000"
                  placeholderTextColor={C.textMuted}
                  keyboardType="numeric"
                  value={latitude}
                  onChangeText={setLatitude}
                />
              </View>
              <View style={{ flex: 1, marginLeft: 8 }}>
                <Text style={styles.inputLabel}>Longitude</Text>
                <TextInput
                  style={styles.locationInput}
                  placeholder="0.000000"
                  placeholderTextColor={C.textMuted}
                  keyboardType="numeric"
                  value={longitude}
                  onChangeText={setLongitude}
                />
              </View>
            </View>

            <TouchableOpacity style={styles.saveLocationBtn} onPress={() => setLocationModalVisible(false)}>
              <Text style={styles.saveLocationBtnText}>Save Location</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  
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
    backgroundColor: C.white,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 20, fontWeight: '800', color: C.text },
  headerSub: { fontSize: 12, color: C.textSub, marginTop: 2 },
  
  headerPostBtn: {
    backgroundColor: C.brown,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  headerPostBtnText: { color: C.white, fontWeight: '700', fontSize: 14 },
  
  scrollContent: { padding: 16 },
  
  uploadCard: {
    backgroundColor: C.white,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: C.border,
    padding: 16,
    marginBottom: 24,
  },
  uploadDashedArea: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: C.border,
    borderRadius: 16,
    backgroundColor: '#FCFAF8',
    height: 200,
    overflow: 'hidden',
  },
  videoPreviewWrap: { flex: 1, backgroundColor: '#000' },
  videoThumb: { width: '100%', height: '100%' },
  changeBadge: {
    position: 'absolute',
    bottom: 12,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  changeBadgeText: { color: C.white, fontSize: 12, fontWeight: '600', marginLeft: 6 },
  uploadPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  uploadIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: C.white,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  uploadTitle: { fontSize: 16, fontWeight: '700', color: C.text, marginBottom: 4 },
  uploadSub: { fontSize: 12, color: C.textSub, marginTop: 2 },
  
  uploadTabs: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    paddingHorizontal: 8,
  },
  uploadTab: { flexDirection: 'row', alignItems: 'center' },
  uploadTabText: { fontSize: 13, fontWeight: '600', color: C.text, marginLeft: 6 },
  uploadTabDivider: { width: 1, height: 16, backgroundColor: C.border },
  
  sectionLabel: { fontSize: 15, fontWeight: '700', color: C.text, marginBottom: 12, marginLeft: 4 },
  
  coverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
    paddingHorizontal: 4,
  },
  coverPreview: {
    width: 64,
    height: 64,
    borderRadius: 12,
    overflow: 'hidden',
  },
  coverImage: { width: '100%', height: '100%' },
  editCoverBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: 'rgba(0,0,0,0.6)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  editCoverText: { color: C.white, fontSize: 10, fontWeight: '600' },
  coverCopy: { flex: 1, marginLeft: 16 },
  coverTitle: { fontSize: 14, fontWeight: '600', color: C.text },
  coverSub: { fontSize: 12, color: C.textSub, marginTop: 2 },
  autoSelectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: C.white,
  },
  autoSelectBtnText: { fontSize: 12, fontWeight: '600', color: C.brown },
  
  captionWrap: {
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
  },
  captionInput: {
    minHeight: 80,
    textAlignVertical: 'top',
    fontSize: 15,
    color: C.text,
  },
  captionFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  charCount: { fontSize: 12, color: C.textMuted },
  
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  seeAllText: { fontSize: 13, fontWeight: '700', color: C.brown },
  
  tagsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 24,
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.chipBg,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginRight: 8,
    marginBottom: 12,
  },
  tagActive: {
    backgroundColor: C.chipActiveBg,
    borderColor: '#D4C4B1',
    borderWidth: 1,
  },
  tagText: { fontSize: 13, fontWeight: '600', color: C.text },
  tagTextActive: { color: C.brown },
  
  locationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
  },
  locationTitle: { fontSize: 14, fontWeight: '600', color: C.text },
  locationSub: { fontSize: 12, color: C.textSub, marginTop: 2 },
  
  settingsGrid: {
    flexDirection: 'row',
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 8,
  },
  settingCol: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  settingDivider: { width: 1, backgroundColor: C.border },
  settingLabel: { fontSize: 12, fontWeight: '600', color: C.text, textAlign: 'center', marginTop: 8, marginBottom: 4 },
  settingValRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  settingValText: { fontSize: 13, fontWeight: '700', color: C.green, marginRight: 4, textAlign: 'center' },
  
  stickyBottom: {
    backgroundColor: C.bg,
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 12,
  },
  draftBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.chipBg,
    borderRadius: 16,
    paddingVertical: 16,
  },
  draftBtnText: { color: C.brown, fontWeight: '700', fontSize: 16 },
  primaryPostBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.brown,
    paddingVertical: 14,
    borderRadius: 16,
  },
  primaryPostBtnText: { color: C.white, fontWeight: '700', fontSize: 16 },

  // Location Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: C.bg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingTop: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  modalTitle: { fontSize: 20, fontWeight: '800', color: C.text },
  modalCloseBtn: { padding: 4 },
  gpsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#8C7765',
    paddingVertical: 14,
    borderRadius: 14,
    marginBottom: 20,
  },
  gpsBtnText: { color: C.white, fontSize: 15, fontWeight: '700' },
  inputLabel: { fontSize: 13, fontWeight: '700', color: C.textSub, marginBottom: 8, marginTop: 12 },
  suggestionsBox: {
    backgroundColor: C.white,
    borderRadius: 8,
    marginTop: 4,
    borderWidth: 1,
    borderColor: C.border,
    maxHeight: 180,
    overflow: 'hidden',
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  suggestionName: { fontSize: 14, fontWeight: '600', color: C.text },
  suggestionAddress: { fontSize: 12, color: C.textSub },
  locationInput: {
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: C.text,
  },
  coordRow: { flexDirection: 'row', marginBottom: 24 },
  saveLocationBtn: {
    backgroundColor: C.brown,
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  saveLocationBtnText: { color: C.white, fontSize: 16, fontWeight: '800' },

  unauthorizedContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  unauthorizedTitle: { fontSize: 20, fontWeight: '700', color: C.text, marginTop: 16 },
  unauthorizedText: { fontSize: 15, color: C.textSub, textAlign: 'center', marginTop: 8 },
  
  progressContainer: { marginBottom: 24 },
  progressBar: { height: 6, backgroundColor: C.border, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: C.green },
  progressText: { fontSize: 12, fontWeight: '600', color: C.textSub, textAlign: 'right', marginTop: 8 },
});
