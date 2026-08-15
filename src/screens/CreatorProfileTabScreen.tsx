import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
  RefreshControl,
  Share,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { launchImageLibrary } from 'react-native-image-picker';
import { useUserContext } from '../context/UserContext';
import { useCreatorDashboard } from '../features/creator/hooks/useCreatorDashboard';
import { creatorApi } from '../features/creator/api/creatorApi';
import { uploadApi } from '../services/api/upload';
import { compactNumber } from '../features/creator/utils/format';
import { hasValidImageUrl } from '../utils/imageUrl';

import { CreatorUI } from '../features/creator/theme';
import { useBottomSafePadding } from '../design/responsive';

const C = CreatorUI.colors;

export default function CreatorProfileTabScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const contentPadBottom = useBottomSafePadding(100);
  const { user, onLogout } = useUserContext();
  const dashboardQuery = useCreatorDashboard();
  const [refreshing, setRefreshing] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await dashboardQuery.refetch();
    setRefreshing(false);
  }, [dashboardQuery]);

  const pickAvatar = useCallback(async () => {
    try {
      const result = await launchImageLibrary({ mediaType: 'photo', quality: 0.8 });
      const asset = result.assets?.[0];
      if (!asset?.uri) return;

      setUploadingAvatar(true);
      const uploaded = await uploadApi.uploadImage(asset.uri);
      const url = uploaded?.url;
      if (!url) throw new Error('Upload failed');

      try {
        await creatorApi.updateProfile({ avatar: url });
        await dashboardQuery.refetch();
        Alert.alert('Success', 'Profile photo updated.');
      } catch {
        Alert.alert('Photo uploaded', 'Finish updating your profile in settings.', [{ text: 'Open Settings', onPress: () => navigation.navigate('CreatorStudioSettings', { autoEdit: true }) }]);
      }
    } catch (err: any) {
      Alert.alert('Upload failed', err?.message || 'Could not update profile photo.');
    } finally {
      setUploadingAvatar(false);
    }
  }, [dashboardQuery, navigation]);

  const handleLogout = useCallback(() => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: () => {
          void onLogout?.();
        },
      },
    ]);
  }, [onLogout]);

  const handleShare = useCallback(async () => {
    try {
      await Share.share({
        message: 'Join me on PalSafar as a Travel Creator! Download the app now.',
      });
    } catch {
      // Ignored share error
    }
  }, []);

  const dashboard = dashboardQuery.data;
  const profile = dashboard?.profile;
  const overview = dashboard?.overview;
  const displayName = profile?.fullName || profile?.username || user?.displayName || 'Creator';
  const username = profile?.username ? `@${profile.username}` : '@creator';

  const followers = overview?.followers ?? profile?.followerCount ?? 0;
  const totalViews = overview?.views ?? profile?.totalViews ?? 0;
  const location = profile?.locationLabel || user?.city || 'Jabalpur, MP';
  const bio = profile?.bio || 'Travel creator | Storyteller | Exploring new places and sharing real experiences ✈️🌍';

  if (dashboardQuery.isLoading && !dashboard) {
    return (
      <View style={[styles.center, { paddingTop: Math.max(insets.top, 16) }]}>
        <ActivityIndicator color={C.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.safe, { paddingTop: Math.max(insets.top, 16) }]}>
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerBtn} onPress={() => navigation.goBack()}>
          <Icon name="chevron-back" size={24} color={C.deep} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Creator Profile</Text>
        <TouchableOpacity style={styles.headerBtn} onPress={() => navigation.navigate('CreatorStudioSettings')}>
          <Icon name="settings-outline" size={22} color={C.deep} />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: contentPadBottom, paddingHorizontal: 16 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.bronze} />}
      >
        {/* HERO SECTION */}
        <View style={styles.heroSection}>
          <View style={styles.avatarWrap}>
            {hasValidImageUrl(profile?.avatar) ? (
              <Image source={{ uri: profile!.avatar! }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarFallback}>
                <Text style={styles.avatarInitial}>{displayName.charAt(0).toUpperCase()}</Text>
              </View>
            )}
            <TouchableOpacity style={styles.editPhotoBadge} onPress={pickAvatar} disabled={uploadingAvatar}>
              {uploadingAvatar ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <Icon name="pencil" size={14} color="#FFF" />
              )}
            </TouchableOpacity>
          </View>
          
          <View style={styles.heroInfo}>
            <View style={styles.heroNameRow}>
              <Text style={styles.heroName}>{displayName}</Text>
              {profile?.verified && (
                <MaterialCommunityIcons name="check-decagram" size={18} color="#E5A041" style={{ marginLeft: 4 }} />
              )}
            </View>
            <Text style={styles.heroUsername}>{username}</Text>
            
            <View style={styles.heroMetaRow}>
              <Text style={styles.heroMetaText}>Travel Creator</Text>
              <Text style={styles.heroMetaDot}>•</Text>
              <Icon name="location-outline" size={14} color={C.textSecondary} />
              <Text style={styles.heroMetaText}>{location}</Text>
            </View>
            
            <Text style={styles.heroBio}>{bio}</Text>
          </View>
        </View>

        {/* STATS SECTION */}
        <View style={styles.statsRow}>
          <TouchableOpacity style={styles.statCard} activeOpacity={0.9}>
            <View style={styles.statIconRow}>
              <Icon name="people" size={16} color={C.bronze} />
              <Text style={styles.statValue}>{compactNumber(followers)}</Text>
            </View>
            <Text style={styles.statLabel}>Followers</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.statCard} onPress={() => navigation.navigate('CreatorAnalytics')} activeOpacity={0.8}>
            <View style={styles.statIconRow}>
              <Icon name="play" size={16} color={C.bronze} />
              <Text style={styles.statValue}>{compactNumber(totalViews)}</Text>
            </View>
            <Text style={styles.statLabel}>Total Views</Text>
          </TouchableOpacity>
        </View>

        {/* CREATOR TOOLS */}
        <Text style={styles.sectionHeading}>Creator Tools</Text>
        <View style={styles.listCard}>
          <RowItem icon="videocam-outline" title="My Reels" desc="Manage and grow your content" onPress={() => navigation.navigate('Reels')} />
          <RowItem icon="hand-left-outline" title="Collaborations" desc="Track campaigns and opportunities" onPress={() => navigation.navigate('Collaboration')} />
          <RowItem icon="stats-chart-outline" title="Analytics" desc="See your performance insights" onPress={() => navigation.navigate('CreatorAnalytics')} />

        </View>

        {/* SIGN OUT */}
        <TouchableOpacity style={styles.signOutBtn} onPress={handleLogout} activeOpacity={0.8}>
          <Icon name="log-out-outline" size={18} color="#EF4444" />
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
        
        <View style={styles.footerNoteRow}>
          <Icon name="shield-checkmark-outline" size={12} color={C.textMuted} />
          <Text style={styles.footerNote}>Your data is safe with us. We respect your privacy.</Text>
        </View>

      </ScrollView>
    </View>
  );
}

function RowItem({ icon, title, desc, onPress, noBorder }: any) {
  return (
    <TouchableOpacity style={[styles.rowItem, !noBorder && styles.rowItemBorder]} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.rowIconWrap}>
        <Icon name={icon} size={20} color={C.bronze} />
      </View>
      <View style={styles.rowContent}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowDesc}>{desc}</Text>
      </View>
      <Icon name="chevron-forward" size={16} color={C.textMuted} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFFFFF' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: C.deep,
  },
  heroSection: {
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 24,
  },
  avatarWrap: {
    position: 'relative',
    marginBottom: 16,
  },
  avatar: {
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 1,
    borderColor: '#E5D6C5',
  },
  avatarFallback: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: '#FCFAEE',
    borderWidth: 1,
    borderColor: '#E5D6C5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: 40,
    fontWeight: '700',
    color: C.bronze,
  },
  editPhotoBadge: {
    position: 'absolute',
    right: 0,
    bottom: 4,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: C.bronze,
    borderWidth: 3,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroInfo: {
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  heroNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  heroName: {
    fontSize: 22,
    fontWeight: '800',
    color: C.deep,
  },
  heroUsername: {
    fontSize: 14,
    color: C.textSecondary,
    marginBottom: 8,
  },
  heroMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  heroMetaText: {
    fontSize: 13,
    color: C.deep,
    fontWeight: '500',
    marginLeft: 4,
  },
  heroMetaDot: {
    fontSize: 12,
    color: C.textMuted,
    marginHorizontal: 6,
  },
  heroBio: {
    fontSize: 13,
    color: C.deep,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 20,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
    gap: 8,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#FFF',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#F0EBE1',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 1,
  },
  statIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '800',
    color: C.deep,
  },
  statLabel: {
    fontSize: 11,
    color: C.textSecondary,
    fontWeight: '500',
  },
  sectionHeading: {
    fontSize: 16,
    fontWeight: '800',
    color: C.deep,
    marginBottom: 12,
    marginTop: 8,
  },
  listCard: {
    backgroundColor: '#FFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#F0EBE1',
    marginBottom: 24,
    overflow: 'hidden',
  },
  rowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  rowItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#F5F2EB',
  },
  rowIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#FCFAEE',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  rowContent: {
    flex: 1,
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: C.deep,
    marginBottom: 2,
  },
  rowDesc: {
    fontSize: 12,
    color: C.textSecondary,
  },
  signOutBtn: {
    backgroundColor: '#FEF2F2',
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 8,
    marginTop: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#FEE2E2',
  },
  signOutText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#EF4444',
  },
  footerNoteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 40,
  },
  footerNote: {
    fontSize: 11,
    color: C.textMuted,
  },
});
