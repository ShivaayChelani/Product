import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  Image,
} from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import { LinearGradient } from '../utils/LinearGradient';
import { Ionicons } from '../utils/Icons';
import { colors, spacing, borderRadius, shadows } from '../config/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBottomSafePadding } from '../design/responsive';
import { BottomNavigation, BOTTOM_NAV_CLEARANCE } from '../components/navigation/BottomNavigation';

interface Memory {
  id: string;
  spotId: string;
  spotName: string;
  imageUri?: string;
  caption: string;
  date: string;
  coinsEarned: number;
  badgeEarned?: string;
  isPublic: boolean;
}

interface MemoriesScreenProps {
  onBack: () => void;
}

export default function MemoriesScreen({ onBack }: MemoriesScreenProps) {
  const insets = useSafeAreaInsets();
  const contentPadBottom = useBottomSafePadding(24);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newCaption, setNewCaption] = useState('');
  const [spotName, setSpotName] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [memoryList, setMemoryList] = useState<Memory[]>([]);

  const handleSelectPhoto = useCallback(() => {
    launchImageLibrary(
      { mediaType: 'photo', quality: 0.8, selectionLimit: 1 },
      (response) => {
        if (response.didCancel || response.errorCode) return;
        const uri = response.assets?.[0]?.uri;
        if (uri) {
          setPhotoUri(uri);
        }
      }
    );
  }, []);

  const handleAddMemory = () => {
    if (!newCaption.trim()) {
      Alert.alert('Add Caption', 'Please write something about your memory!');
      return;
    }
    if (!spotName.trim()) {
      Alert.alert('Add Location', 'Please specify a location!');
      return;
    }

    const newMemory: Memory = {
      id: Math.random().toString(),
      spotId: spotName.toLowerCase().replace(/\s+/g, '-'),
      spotName: spotName.trim(),
      caption: newCaption.trim(),
      date: new Date().toISOString().split('T')[0],
      coinsEarned: 25,
      isPublic: true,
      // Store local image URI on the memory object
      ...(photoUri ? { imageUrl: photoUri } as any : {}),
    };

    setMemoryList(prev => [newMemory, ...prev]);

    setNewCaption('');
    setSpotName('');
    setPhotoUri(null);
    setShowAddModal(false);
    Alert.alert('Memory Added!', 'Your memory has been saved.');
  };

  const renderMemoryCard = (memory: Memory, index: number) => {
    const memoryImg = (memory as any).imageUrl;

    return (
      <View key={memory.id || index} style={styles.memoryCard}>
        <View style={styles.memoryHeader}>
          <View style={styles.memoryIcon}>
            <Text style={styles.memoryEmoji}>📸</Text>
          </View>
          <View style={styles.memoryInfo}>
            <Text style={styles.memorySpot}>{memory.spotName}</Text>
            <Text style={styles.memoryDate}>{memory.date}</Text>
          </View>
          <View style={[
            styles.privacyBadge,
            { backgroundColor: memory.isPublic ? colors.green + '20' : colors.orange + '20' }
          ]}>
            <Ionicons
              name={memory.isPublic ? 'globe' : 'lock-closed'}
              size={12}
              color={memory.isPublic ? colors.green : colors.orange}
            />
          </View>
        </View>

        {memoryImg ? (
          <Image source={{ uri: memoryImg }} style={styles.memoryImage} />
        ) : (
          <TouchableOpacity 
            activeOpacity={0.8}
            onPress={() => {
              Alert.alert('Add Photo', 'Do you want to upload a photo for this saved memory?', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Choose Photo', onPress: () => {
                  launchImageLibrary(
                    { mediaType: 'photo', quality: 0.8 },
                    (res) => {
                      if (res.assets && res.assets[0]?.uri) {
                        const firstUri = res.assets[0].uri;
                        setMemoryList(prev => prev.map(m => m.id === memory.id ? { ...m, imageUrl: firstUri } as any : m));
                      }
                    }
                  );
                }}
              ]);
            }}
            style={styles.memoryImagePlaceholder}
          >
            <Ionicons name="image-outline" size={48} color={colors.textMuted} />
            <Text style={styles.placeholderText}>Tap to add photo</Text>
          </TouchableOpacity>
        )}

        <View style={styles.memoryContent}>
          <Text style={styles.memoryCaption}>{memory.caption}</Text>
        </View>

        <View style={styles.memoryFooter}>
          <View style={styles.rewardRow}>
            <Ionicons name="logo-usd" size={14} color={colors.gold} />
            <Text style={styles.rewardText}>+{memory.coinsEarned} coins</Text>
          </View>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) }]}>
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Memories</Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => setShowAddModal(true)}
        >
          <Ionicons name="add" size={24} color={colors.gold} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: contentPadBottom + BOTTOM_NAV_CLEARANCE }} showsVerticalScrollIndicator={false}>
        <View style={styles.betaBanner}>
          <Ionicons name="information-circle-outline" size={18} color={colors.primary} />
          <Text style={styles.betaBannerText}>
            Closed beta: memories are stored on this device only and are not synced to your account yet.
          </Text>
        </View>
        <View style={styles.statsCard}>
          <LinearGradient
            colors={[colors.primary + '40', colors.primaryDark + '40'] as any}
            style={styles.statsGradient}
          >
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{memoryList.length}</Text>
                <Text style={styles.statLabel}>Memories</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={styles.statValue}>
                  {memoryList.reduce((sum, m) => sum + m.coinsEarned, 0)}
                </Text>
                <Text style={styles.statLabel}>Coins Earned</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={styles.statValue}>
                  {memoryList.filter(m => m.isPublic).length}
                </Text>
                <Text style={styles.statLabel}>Shared</Text>
              </View>
            </View>
          </LinearGradient>
        </View>

        <View style={styles.journeyHeader}>
          <Text style={styles.journeyTitle}>My PalSafar Journey</Text>
          <Text style={styles.journeySubtitle}>Every moment counts!</Text>
        </View>

        {memoryList.length > 0 ? (
          <View style={styles.memoriesList}>
            {memoryList.map((memory, i) => renderMemoryCard(memory, i))}
          </View>
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>📷</Text>
            <Text style={styles.emptyTitle}>No memories yet</Text>
            <Text style={styles.emptyText}>
              Capture your travel moments to earn coins!
            </Text>
            <TouchableOpacity
              style={styles.captureButton}
              onPress={() => setShowAddModal(true)}
            >
              <Text style={styles.captureButtonText}>Capture First Memory</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* Add Memory Modal */}
      <Modal 
        visible={showAddModal} 
        transparent 
        animationType="slide"
        onRequestClose={() => setShowAddModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Capture Moment</Text>
              <TouchableOpacity onPress={() => setShowAddModal(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity 
              activeOpacity={0.9}
              onPress={handleSelectPhoto}
              style={styles.photoPlaceholder}
            >
              {photoUri ? (
                <Image source={{ uri: photoUri }} style={styles.previewImage} />
              ) : (
                <>
                  <Ionicons name="camera" size={48} color={colors.textMuted} />
                  <Text style={styles.photoPlaceholderText}>
                    Tap to add or capture a photo from library
                  </Text>
                </>
              )}
            </TouchableOpacity>

            <View style={styles.spotSelector}>
              <Text style={styles.spotSelectorLabel}>Location</Text>
              <TextInput
                style={styles.locationInput}
                value={spotName}
                onChangeText={setSpotName}
                placeholder="Enter spot name"
                placeholderTextColor={colors.textMuted}
              />
            </View>

            <View style={styles.captionInput}>
              <Text style={styles.inputLabel}>Your Story</Text>
              <TextInput
                style={styles.textInput}
                placeholder="What made this moment special?"
                placeholderTextColor={colors.textMuted}
                value={newCaption}
                onChangeText={setNewCaption}
                multiline
                numberOfLines={4}
              />
            </View>

            <TouchableOpacity style={styles.saveButton} onPress={handleAddMemory}>
              <LinearGradient
                colors={[colors.gold, colors.goldDark] as any}
                style={styles.saveButtonGradient}
              >
                <Text style={styles.saveButtonText}>Save Memory (+25 coins)</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      <BottomNavigation activeTab="profile" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: 0,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  addButton: {
    padding: 4,
  },
  content: {
    flex: 1,
  },
  betaBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.primary + '12',
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.primary + '30',
    padding: spacing.sm,
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
  },
  betaBannerText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    color: colors.textSecondary,
  },
  statsCard: {
    margin: spacing.lg,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  statsGradient: {
    padding: spacing.lg,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text,
  },
  statLabel: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 4,
  },
  statDivider: {
    width: 1,
    height: 40,
    backgroundColor: colors.border,
  },
  journeyHeader: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  journeyTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.text,
  },
  journeySubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  memoriesList: {
    paddingHorizontal: spacing.lg,
    gap: spacing.lg,
  },
  memoryCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    ...shadows.sm,
  },
  memoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  memoryIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memoryEmoji: {
    fontSize: 18,
  },
  memoryInfo: {
    flex: 1,
    marginLeft: spacing.sm,
  },
  memorySpot: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  memoryDate: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  privacyBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: borderRadius.sm,
  },
  memoryImagePlaceholder: {
    height: 180,
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.textMuted,
    marginBottom: spacing.md,
  },
  placeholderText: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 8,
  },
  memoryImage: {
    height: 180,
    width: '100%',
    borderRadius: borderRadius.md,
    marginBottom: spacing.md,
  },
  previewImage: {
    width: '100%',
    height: '100%',
    borderRadius: borderRadius.md,
  },
  memoryContent: {
    marginBottom: spacing.md,
  },
  memoryCaption: {
    fontSize: 13,
    color: colors.text,
    lineHeight: 18,
  },
  memoryFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
  },
  rewardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  rewardText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.gold,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: spacing.xl,
  },
  emptyEmoji: {
    fontSize: 48,
    marginBottom: spacing.sm,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  emptyText: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 4,
  },
  captureButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    marginTop: spacing.lg,
  },
  captureButtonText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.card,
    borderTopLeftRadius: borderRadius.lg,
    borderTopRightRadius: borderRadius.lg,
    padding: spacing.lg,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  photoPlaceholder: {
    height: 180,
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  photoPlaceholderText: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 8,
  },
  spotSelector: {
    marginBottom: spacing.md,
  },
  spotSelectorLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  locationInput: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    color: colors.text,
    fontSize: 13,
  },
  spotChip: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primary + '20',
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: borderRadius.round,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  spotChipText: {
    fontSize: 13,
    color: colors.primary,
    fontWeight: '600',
  },
  captionInput: {
    marginBottom: spacing.lg,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  textInput: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    color: colors.text,
    fontSize: 13,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  saveButton: {
    borderRadius: borderRadius.md,
    overflow: 'hidden',
  },
  saveButtonGradient: {
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  saveButtonText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
  },
});