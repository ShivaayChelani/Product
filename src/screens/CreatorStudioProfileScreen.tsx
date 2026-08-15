import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  KeyboardAvoidingView,
  SafeAreaView,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { launchImageLibrary } from 'react-native-image-picker';
import { useUserContext } from '../context/UserContext';
import { socialApi } from '../services/api/social';
import { uploadApi } from '../services/api/upload';
import type { CreatorDashboard } from '../types';
import { useStudioTabScreenInsets } from '../design/tabBarLayout';
import { useBottomSafePadding } from '../design/responsive';
import { PLAY_STORE_URL } from '../config/monitoringConfig';

const HERO = require('../assets/settings_cover.png');

const C = {
  bg: '#FDF7F2',
  ink: '#4A3427',
  textSub: '#8B7355',
  textMuted: '#B8A88A',
  border: 'rgba(200, 155, 60, 0.12)',
  card: '#FFFFFF',
  danger: '#DC4C4C',
  dangerSoft: '#FEF2F2',
  bronze: '#A67C52',
};

const compact = (value: number) =>
  value >= 1000 ? `${(value / 1000).toFixed(1)}K` : String(value);

type SettingsRowConfig = {
  key: string;
  icon: string;
  iconColor: string;
  iconBg: string;
  title: string;
  subtitle?: string;
  danger?: boolean;
  rightText?: string;
  onPress?: () => void;
};

function SettingsRow({ item, isLast }: { item: SettingsRowConfig; isLast: boolean }) {
  const pressable = !!item.onPress;
  return (
    <TouchableOpacity
      disabled={!pressable}
      onPress={item.onPress}
      activeOpacity={pressable ? 0.75 : 1}
      style={[styles.row, !isLast && styles.rowBorder]}
    >
      <View style={[styles.iconCircle, { backgroundColor: item.iconBg }]}>
        <Icon name={item.icon as any} size={20} color={item.iconColor} />
      </View>
      <View style={styles.rowTextCol}>
        <Text style={[styles.rowTitle, item.danger && styles.rowTitleDanger]} numberOfLines={1}>
          {item.title}
        </Text>
        {!!item.subtitle && (
          <Text style={styles.rowSub} numberOfLines={2}>{item.subtitle}</Text>
        )}
      </View>
      {item.rightText ? (
        <Text style={styles.rowMeta}>{item.rightText}</Text>
      ) : pressable ? (
        <Icon name="chevron-forward" size={18} color={C.textMuted} />
      ) : null}
    </TouchableOpacity>
  );
}

function SettingsSection({ title, items }: { title: string; items: SettingsRowConfig[] }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>{title}</Text>
      <View style={styles.card}>
        {items.map((item, i) => (
          <SettingsRow key={item.key} item={item} isLast={i === items.length - 1} />
        ))}
      </View>
    </View>
  );
}

export default function CreatorStudioProfileScreen({ onBack }: { onBack?: () => void } = {}) {
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();
  const studioInsets = useStudioTabScreenInsets();
  const modalPadBottom = useBottomSafePadding(20);
  const { user, onLogout } = useUserContext();
  const [data, setData] = useState<CreatorDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [username, setUsername] = useState('');
  const [usernameChecking, setUsernameChecking] = useState(false);
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [fullName, setFullName] = useState('');
  const [bio, setBio] = useState('');
  const [instagram, setInstagram] = useState('');
  const [youtube, setYoutube] = useState('');
  const [facebook, setFacebook] = useState('');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const route = useRoute<any>();
  useEffect(() => {
    if (route.params?.autoEdit) {
      setEditing(true);
      navigation.setParams({ autoEdit: undefined });
    }
  }, [route.params?.autoEdit, navigation]);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const d = (await socialApi.getCreatorDashboard()).data;
      setData(d);
      setUsername(d.profile.username || '');
      setFullName(d.profile.fullName || '');
      setBio(d.profile.bio || '');
      setInstagram(d.profile.instagramUrl || '');
      setYoutube(d.profile.youtubeUrl || '');
      setFacebook(d.profile.facebookUrl || '');
    } catch (e: any) {
      setLoadError(e?.message || 'Could not load creator profile.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const requestIdRef = useRef(0);

  useEffect(() => {
    if (!editing) return;
    const initialUsername = (data?.profile?.username || '').toLowerCase();
    const cleaned = username.replace(/^@+/, '').toLowerCase().trim();

    const currentReqId = ++requestIdRef.current;

    if (!cleaned) {
      setUsernameChecking(false);
      setUsernameAvailable(false);
      setUsernameError('3–30 characters (letters, numbers, _ or . allowed)');
      return;
    }

    if (cleaned === initialUsername) {
      setUsernameChecking(false);
      setUsernameAvailable(true);
      setUsernameError(null);
      return;
    }

    if (cleaned.length < 3 || cleaned.length > 30 || !/^[a-z0-9_.]+$/.test(cleaned)) {
      setUsernameChecking(false);
      setUsernameAvailable(false);
      setUsernameError('3–30 characters (letters, numbers, _ or . allowed)');
      return;
    }

    setUsernameChecking(true);
    setUsernameAvailable(null);
    setUsernameError(null);

    const timer = setTimeout(async () => {
      try {
        const response: any = await socialApi.checkUsernameAvailability(cleaned);
        if (currentReqId !== requestIdRef.current) return;

        const payload = response?.data !== undefined ? response.data : response;
        if (payload?.available === true) {
          setUsernameAvailable(true);
          setUsernameError(null);
        } else {
          setUsernameAvailable(false);
          setUsernameError(payload?.message || 'Username already used');
        }
      } catch (err: any) {
        if (currentReqId !== requestIdRef.current) return;
        setUsernameAvailable(false);
        const msg = err?.message || '';
        setUsernameError(msg.includes('not found') || msg.includes('404') ? 'Username already used' : (msg || 'Unable to check username. Try again.'));
      } finally {
        if (currentReqId === requestIdRef.current) {
          setUsernameChecking(false);
        }
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [username, editing, data?.profile?.username]);

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

  const save = async () => {
    if (usernameChecking) {
      Alert.alert('Checking username', 'Please wait while we verify handle availability.');
      return;
    }
    if (usernameAvailable === false) {
      Alert.alert('Username Unavailable', usernameError || 'Please choose an available username.');
      return;
    }
    try {
      const cleanedUsername = username.replace(/^@+/, '').toLowerCase().trim();
      await socialApi.updateCreatorProfile({
        username: cleanedUsername || undefined,
        fullName,
        bio,
        instagramUrl: instagram,
        youtubeUrl: youtube,
        facebookUrl: facebook,
      });
      setEditing(false);
      try {
        queryClient.invalidateQueries({ queryKey: ['creator-profile'] });
        queryClient.invalidateQueries({ queryKey: ['creator-dashboard'] });
      } catch {}
      await load();
    } catch (e: any) {
      if (e?.code === 'USERNAME_ALREADY_TAKEN' || e?.message?.includes('not available') || e?.message?.includes('already used') || e?.message?.includes('already taken')) {
        setUsernameAvailable(false);
        setUsernameError('Username not available');
        Alert.alert('Username Conflict', 'This username was just taken by another creator. Please choose another.');
      } else {
        Alert.alert('Could not save profile', e?.message || 'Please try again.');
      }
    }
  };

  const pickAvatar = useCallback(async () => {
    try {
      const result = await launchImageLibrary({ mediaType: 'photo', quality: 0.8, selectionLimit: 1 });
      const asset = result.assets?.[0];
      if (!asset?.uri) return;
      setUploadingAvatar(true);
      const uploaded = await uploadApi.uploadImage(asset.uri, asset.type, asset.fileName);
      const url = uploaded?.url;
      if (!url) throw new Error('Upload failed');
      await socialApi.updateCreatorProfile({ avatar: url });
      await load();
    } catch (e: any) {
      Alert.alert('Could not update photo', e?.message || 'Please try again.');
    } finally {
      setUploadingAvatar(false);
    }
  }, [load]);

  const p = data?.profile;
  const displayName = p?.fullName || p?.username || user.displayName || 'Creator';
  const handle = p?.username ? `@${p.username}` : `@${(user.displayName || 'creator').toLowerCase().replace(/\s+/g, '')}`;

  const sections = useMemo(() => {
    const creatorItems: SettingsRowConfig[] = [
      {
        key: 'edit',
        icon: 'person-outline',
        iconColor: C.ink,
        iconBg: 'rgba(185,131,75,0.14)',
        title: 'Account Information',
        subtitle: 'Edit name, bio and social links',
        onPress: () => setEditing(true),
      },
      {
        key: 'password',
        icon: 'lock-closed-outline',
        iconColor: C.ink,
        iconBg: 'rgba(185,131,75,0.14)',
        title: 'Change Password',
        subtitle: 'Update your password',
        onPress: () => navigation.navigate('ChangePassword'),
      },
      {
        key: 'privacy',
        icon: 'shield-checkmark-outline',
        iconColor: '#3B82F6',
        iconBg: 'rgba(59,130,246,0.12)',
        title: 'Privacy Settings',
        subtitle: 'Manage your privacy preferences',
        onPress: () => navigation.navigate('PrivacySettings'),
      },
      {
        key: 'delete',
        icon: 'trash-outline',
        iconColor: C.danger,
        iconBg: 'rgba(220,76,76,0.12)',
        title: 'Delete Account',
        subtitle: 'Permanently delete your account',
        danger: true,
        onPress: () => navigation.navigate('DeleteAccount'),
      },
      {
        key: 'subscription',
        icon: 'card-outline',
        iconColor: '#7C3AED',
        iconBg: 'rgba(124,58,237,0.12)',
        title: 'Subscription & Billing',
        subtitle: 'Creator plans, upgrades & invoices',
        onPress: () => navigation.navigate('CreatorSubscription'),
      },
    ];

    const studioItems: SettingsRowConfig[] = [
      {
        key: 'insights',
        icon: 'bar-chart-outline',
        iconColor: '#3B82F6',
        iconBg: 'rgba(59,130,246,0.12)',
        title: 'Insights',
        subtitle: 'Detailed analytics and performance',
        onPress: () => navigation.navigate('CreatorAnalytics'),
      },
      {
        key: 'earnings',
        icon: 'star-outline',
        iconColor: C.ink,
        iconBg: 'rgba(185,131,75,0.14)',
        title: 'PalPoints',
        subtitle: 'Manage your creator rewards',
        onPress: () => navigation.navigate('PalPointsScreen'),
      },
      {
        key: 'subscription',
        icon: 'card-outline',
        iconColor: '#7C3AED',
        iconBg: 'rgba(124,58,237,0.12)',
        title: 'Subscription & Billing',
        subtitle: 'Creator plans, upgrades & invoices',
        onPress: () => navigation.navigate('CreatorSubscription'),
      },
      {
        key: 'notifications',
        icon: 'notifications-outline',
        iconColor: '#D97706',
        iconBg: 'rgba(234,179,8,0.14)',
        title: 'Notifications',
        subtitle: 'Alerts and updates',
        onPress: () => navigation.navigate('Notifications'),
      },
    ];

    if (p?.username) {
      studioItems.push({
        key: 'public',
        icon: 'globe-outline',
        iconColor: '#059669',
        iconBg: 'rgba(5,150,105,0.12)',
        title: 'Public Creator Page',
        subtitle: 'View how travelers see your profile',
        onPress: () => navigation.navigate('CreatorProfile', { username: p.username }),
      });
    }

    return [
      { title: 'Account', items: creatorItems },
      {

        title: 'Support',
        items: [
          {
            key: 'terms',
            icon: 'document-text-outline',
            iconColor: C.ink,
            iconBg: 'rgba(185,131,75,0.14)',
            title: 'Creator Terms & Conditions',
            subtitle: 'Read our creator terms and conditions',
            onPress: () => navigation.navigate('LegalDocument', { type: 'CREATOR_TERMS', title: 'Creator Terms & Conditions' }),
          },
        ] as SettingsRowConfig[],
      },
      {
        title: 'About',
        items: [
          {
            key: 'version',
            icon: 'phone-portrait-outline',
            iconColor: '#3B82F6',
            iconBg: 'rgba(59,130,246,0.12)',
            title: 'Version',
            rightText: '2.4.0',
          },
          {
            key: 'licenses',
            icon: 'clipboard-outline',
            iconColor: C.ink,
            iconBg: 'rgba(185,131,75,0.14)',
            title: 'Licenses',
            onPress: () => navigation.navigate('Licenses'),
          },
          {
            key: 'rate',
            icon: 'star-outline',
            iconColor: '#D97706',
            iconBg: 'rgba(234,179,8,0.14)',
            title: 'Rate the App',
            subtitle: 'Share your feedback with us',
            onPress: () =>
              Linking.openURL(PLAY_STORE_URL),
          },
        ] as SettingsRowConfig[],
      },
    ];
  }, [navigation, p?.username]);

  if (loading) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color={C.bronze} />
      </View>
    );
  }

  if (loadError && !data) {
    return (
      <View style={[styles.root, styles.center]}>
        <Text style={styles.errorText}>{loadError}</Text>
        <TouchableOpacity
          style={styles.retry}
          onPress={() => {
            setLoading(true);
            void load();
          }}
        >
          <Text style={styles.retryText}>Try again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: studioInsets.scrollPadBottom }}
      >
        <View style={styles.heroWrap}>
          <Image source={HERO} style={styles.heroImage} resizeMode="cover" />
          <View style={[styles.heroBar, { paddingTop: studioInsets.headerPadTop }]}>
            <TouchableOpacity
              style={styles.backBtn}
              onPress={() => (onBack ? onBack() : navigation.canGoBack() ? navigation.goBack() : undefined)}
            >
              <Icon name="arrow-back" size={22} color={C.ink} />
            </TouchableOpacity>
            <Text style={styles.heroTitle}>Settings</Text>
            <View style={styles.backBtn} />
          </View>
        </View>

        <View style={styles.body}>
          <View style={styles.profileCard}>
            <TouchableOpacity style={styles.avatarWrap} onPress={pickAvatar} activeOpacity={0.85} disabled={uploadingAvatar}>
              {p?.avatar ? (
                <Image source={{ uri: p.avatar }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarFallback]}>
                  <Text style={styles.avatarLetter}>{displayName.slice(0, 1).toUpperCase()}</Text>
                </View>
              )}
              <View style={styles.avatarBadge}>
                {uploadingAvatar ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Icon name="camera" size={14} color="#fff" />
                )}
              </View>
            </TouchableOpacity>
            <View style={styles.profileCopy}>
              <Text style={styles.profileName} numberOfLines={1}>{displayName}</Text>
              <Text style={styles.profileHandle} numberOfLines={1}>
                {handle}{p?.verified ? '  ✓' : ''}
              </Text>
              <Text style={styles.profileRole}>Travel Creator</Text>
            </View>
            <TouchableOpacity style={styles.editChip} onPress={() => setEditing(true)} activeOpacity={0.85}>
              <Icon name="create-outline" size={16} color={C.ink} />
            </TouchableOpacity>
          </View>

          {sections.map(section => (
            <SettingsSection key={section.title} title={section.title} items={section.items} />
          ))}

          <TouchableOpacity onPress={handleLogout} activeOpacity={0.88} style={styles.signOutBtn}>
            <Icon name="log-out-outline" size={20} color={C.danger} />
            <Text style={styles.signOutText}>Sign Out</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <Modal visible={editing} transparent={false} animationType="slide" onRequestClose={() => setEditing(false)}>
        <SafeAreaView style={styles.editRoot}>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={styles.editHeader}>
              <TouchableOpacity style={styles.editHeaderBtn} onPress={() => setEditing(false)}>
                <Icon name="chevron-back" size={20} color={C.ink} />
              </TouchableOpacity>
              <View style={styles.editHeaderTitleWrap}>
                <Text style={styles.editHeaderTitle}>Edit profile</Text>
                <Text style={styles.editHeaderSub}>Update your profile information and social links</Text>
              </View>
              <TouchableOpacity style={styles.editHeaderBtn} onPress={() => setEditing(false)}>
                <Icon name="close" size={20} color={C.ink} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.editScroll}>
              <View style={styles.photoCard}>
                <View style={styles.photoAvatarWrap}>
                  <Image source={{ uri: data?.profile.avatar || 'https://via.placeholder.com/150' }} style={styles.photoAvatar} />
                  <View style={styles.photoEditBadge}>
                    <Icon name="pencil" size={12} color="#FFF" />
                  </View>
                </View>
                <View style={styles.photoInfo}>
                  <Text style={styles.photoTitle}>Profile photo</Text>
                  <Text style={styles.photoSub}>JPG, PNG or WebP. Max size 5MB.{'\n'}Recommended: 1024x1024px</Text>
                  <View style={styles.photoActions}>
                    <TouchableOpacity style={styles.changePhotoBtn}>
                      <Icon name="push-outline" size={16} color={C.bronze} />
                      <Text style={styles.changePhotoText}>Change photo</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.deletePhotoBtn}>
                      <Icon name="trash-outline" size={16} color={C.bronze} />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>

              <EditField
                icon="person-outline"
                label="Username (@handle)"
                value={username}
                onChangeText={(val: string) => {
                  const formatted = val.replace(/^@+/, '').toLowerCase().replace(/[^a-z0-9_.]/g, '');
                  setUsername(formatted);
                }}
                checking={usernameChecking}
                valid={usernameAvailable === true && !usernameChecking}
                invalid={usernameAvailable === false && !usernameChecking}
                errorText={usernameError || undefined}
                showAvailableMessage
              />
              <EditField icon="person-outline" label="Display name" value={fullName} onChangeText={setFullName} valid={fullName.length > 0} />

              <View style={styles.bioCard}>
                <View style={styles.bioIconWrap}>
                  <Text style={styles.bioQuoteIcon}>“</Text>
                </View>
                <View style={styles.bioContent}>
                  <Text style={styles.editFieldLabel}>Bio</Text>
                  <TextInput
                    style={styles.bioInput}
                    value={bio}
                    onChangeText={setBio}
                    multiline
                    maxLength={160}
                    placeholderTextColor={C.textMuted}
                  />
                  <Text style={styles.bioCount}>{bio.length}/160</Text>
                </View>
              </View>

              <View style={styles.socialHeader}>
                <Text style={styles.socialTitle}>Social links <Text style={{fontWeight: '400'}}>(optional)</Text></Text>
                <Text style={styles.socialSub}>Add your social media links to connect with your audience</Text>
              </View>

              <SocialField icon="logo-instagram" color="#E1306C" label="Instagram URL" value={instagram} onChangeText={setInstagram} placeholder="https://instagram.com/yourusername" />
              <SocialField icon="logo-youtube" color="#FF0000" label="YouTube URL" value={youtube} onChangeText={setYoutube} placeholder="https://youtube.com/@yourchannel" />
              <SocialField icon="logo-facebook" color="#1877F2" label="Facebook URL" value={facebook} onChangeText={setFacebook} placeholder="https://facebook.com/yourprofile" />
            </ScrollView>

            <View style={styles.editFooter}>
              <TouchableOpacity
                style={[styles.editSaveBtn, (usernameChecking || usernameAvailable !== true || !username.trim()) && { opacity: 0.5 }]}
                onPress={save}
                disabled={usernameChecking || usernameAvailable !== true || !username.trim()}
              >
                <Icon name="save-outline" size={18} color="#FFF" />
                <Text style={styles.editSaveText}>Save profile</Text>
              </TouchableOpacity>
              <View style={styles.editFooterNote}>
                <Icon name="shield-checkmark-outline" size={14} color={C.textSub} />
                <Text style={styles.editFooterNoteText}>Changes will be visible to your audience</Text>
              </View>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

function EditField({ icon, label, value, onChangeText, valid, checking, invalid, errorText, showAvailableMessage }: any) {
  return (
    <View style={{ marginBottom: 12 }}>
      <View style={[styles.editFieldCard, invalid && { borderColor: '#EF4444' }]}>
        <View style={styles.editFieldIconWrap}>
          <Icon name={icon} size={20} color={invalid ? '#EF4444' : C.bronze} />
        </View>
        <View style={styles.editFieldContent}>
          <Text style={styles.editFieldLabel}>{label}</Text>
          <TextInput
            style={styles.editFieldInput}
            value={value}
            onChangeText={onChangeText}
            placeholderTextColor={C.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
        {checking ? (
          <ActivityIndicator size="small" color={C.bronze} style={{ marginRight: 8 }} />
        ) : valid ? (
          <View style={styles.validBadge}>
            <Icon name="checkmark" size={12} color="#10B981" />
          </View>
        ) : invalid ? (
          <View style={[styles.validBadge, { backgroundColor: '#FEE2E2' }]}>
            <Icon name="close" size={12} color="#EF4444" />
          </View>
        ) : null}
      </View>
      {checking ? (
        <Text style={{ fontSize: 12, color: C.textSub, marginTop: 4, marginLeft: 16, fontWeight: '500' }}>
          Checking availability...
        </Text>
      ) : showAvailableMessage && valid ? (
        <Text style={{ fontSize: 12, color: '#059669', marginTop: 4, marginLeft: 16, fontWeight: '600' }}>
          ✓ Username available
        </Text>
      ) : invalid && errorText ? (
        <Text style={{ fontSize: 12, color: '#EF4444', marginTop: 4, marginLeft: 16, fontWeight: '600' }}>
          ✕ {errorText}
        </Text>
      ) : null}
    </View>
  );
}

function SocialField({ icon, color, label, value, onChangeText, placeholder }: any) {
  return (
    <View style={styles.editFieldCard}>
      <View style={styles.socialIconWrap}>
        <Icon name={icon} size={20} color={color} />
      </View>
      <View style={styles.editFieldContent}>
        <Text style={styles.editFieldLabel}>{label}</Text>
        <TextInput
          style={styles.editFieldInput}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={C.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.bg,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  errorText: {
    color: C.textSub,
    textAlign: 'center',
    marginBottom: 14,
    fontWeight: '600',
  },
  retry: {
    backgroundColor: C.bronze,
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  retryText: { color: '#fff', fontWeight: '800' },
  heroWrap: {
    height: 228,
    overflow: 'hidden',
    backgroundColor: '#F3EBE0',
  },
  heroImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  heroBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    zIndex: 2,
  },
  backBtn: {
    width: 40,
    height: 40,
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: C.ink,
    letterSpacing: -0.3,
  },
  body: {
    paddingHorizontal: 20,
    paddingTop: 20,
    gap: 22,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: C.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.border,
    padding: 14,
    ...Platform.select({
      ios: {
        shadowColor: 'rgba(74,52,39,0.08)',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 1,
        shadowRadius: 12,
      },
      android: { elevation: 2 },
    }),
  },
  avatarWrap: {
    width: 58,
    height: 58,
    borderRadius: 29,
    overflow: 'hidden',
    position: 'relative',
  },
  avatarBadge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: C.bronze,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: C.card,
  },
  avatar: {
    width: 58,
    height: 58,
    borderRadius: 29,
  },
  avatarFallback: {
    backgroundColor: 'rgba(185,131,75,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    fontSize: 22,
    fontWeight: '800',
    color: C.ink,
  },
  profileCopy: {
    flex: 1,
    minWidth: 0,
  },
  profileName: {
    fontSize: 17,
    fontWeight: '800',
    color: C.ink,
  },
  profileHandle: {
    fontSize: 13,
    fontWeight: '500',
    color: C.textSub,
    marginTop: 2,
  },
  profileRole: {
    fontSize: 12,
    fontWeight: '700',
    color: C.bronze,
    marginTop: 4,
  },
  editChip: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(185,131,75,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.border,
    paddingVertical: 14,
    paddingHorizontal: 8,
  },
  statCell: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  statDivider: {
    width: StyleSheet.hairlineWidth,
    height: 28,
    backgroundColor: 'rgba(74,52,39,0.12)',
  },
  statValue: {
    fontSize: 15,
    fontWeight: '800',
    color: C.ink,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: C.textSub,
  },
  section: {
    gap: 10,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: C.ink,
    paddingLeft: 4,
  },
  card: {
    backgroundColor: C.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.border,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: 'rgba(74,52,39,0.08)',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 1,
        shadowRadius: 12,
      },
      android: { elevation: 2 },
    }),
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 14,
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(74,52,39,0.08)',
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rowTextCol: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: C.ink,
  },
  rowTitleDanger: {
    color: C.danger,
  },
  rowSub: {
    fontSize: 12,
    fontWeight: '500',
    color: C.textSub,
    lineHeight: 16,
  },
  rowMeta: {
    fontSize: 13,
    fontWeight: '600',
    color: C.textSub,
  },
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 8,
    paddingVertical: 16,
    borderRadius: 18,
    backgroundColor: C.dangerSoft,
    borderWidth: 1,
    borderColor: 'rgba(220,76,76,0.12)',
  },
  signOutText: {
    fontSize: 16,
    fontWeight: '700',
    color: C.danger,
  },
  editRoot: { flex: 1, backgroundColor: '#FAFAFA' },
  editHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  editHeaderBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#F0EBE1', alignItems: 'center', justifyContent: 'center' },
  editHeaderTitleWrap: { alignItems: 'center', flex: 1, paddingHorizontal: 16 },
  editHeaderTitle: { fontSize: 18, fontWeight: '800', color: C.ink },
  editHeaderSub: { fontSize: 12, color: C.textSub, marginTop: 2, textAlign: 'center' },
  editScroll: { paddingHorizontal: 16, paddingVertical: 24, paddingBottom: 100 },
  photoCard: { backgroundColor: '#FCFAEE', borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  photoAvatarWrap: { width: 80, height: 80, borderRadius: 40, position: 'relative' },
  photoAvatar: { width: 80, height: 80, borderRadius: 40, borderWidth: 4, borderColor: '#FFF' },
  photoEditBadge: { position: 'absolute', bottom: 0, right: 0, width: 24, height: 24, borderRadius: 12, backgroundColor: C.bronze, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FFF' },
  photoInfo: { flex: 1, marginLeft: 16 },
  photoTitle: { fontSize: 14, fontWeight: '700', color: C.ink },
  photoSub: { fontSize: 11, color: C.textSub, marginTop: 4, lineHeight: 16 },
  photoActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  changePhotoBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E5D6C5', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  changePhotoText: { fontSize: 12, fontWeight: '700', color: C.bronze },
  deletePhotoBtn: { width: 36, height: 36, borderRadius: 8, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E5D6C5', alignItems: 'center', justifyContent: 'center' },
  editFieldCard: { backgroundColor: '#FFF', borderRadius: 12, borderWidth: 1, borderColor: '#F0EBE1', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, marginBottom: 12 },
  editFieldIconWrap: { width: 40, height: 40, borderRadius: 8, backgroundColor: '#FCFAEE', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  socialIconWrap: { width: 40, height: 40, borderRadius: 8, backgroundColor: '#F9F9F9', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  editFieldContent: { flex: 1 },
  editFieldLabel: { fontSize: 11, fontWeight: '700', color: C.bronze, marginBottom: 2 },
  editFieldInput: { fontSize: 14, color: C.ink, paddingVertical: 8, paddingHorizontal: 0 },
  validBadge: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#D1FAE5', alignItems: 'center', justifyContent: 'center', marginLeft: 8 },
  bioCard: { backgroundColor: '#FFF', borderRadius: 12, borderWidth: 1, borderColor: '#F0EBE1', flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 12, marginBottom: 24 },
  bioIconWrap: { width: 40, height: 40, borderRadius: 8, backgroundColor: '#FCFAEE', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  bioQuoteIcon: { fontSize: 24, fontWeight: '700', color: C.bronze, fontFamily: 'serif' },
  bioContent: { flex: 1 },
  bioInput: { fontSize: 14, color: C.ink, marginTop: 2, minHeight: 80, textAlignVertical: 'top', paddingVertical: 8, paddingHorizontal: 0 },
  bioCount: { fontSize: 11, color: C.textSub, textAlign: 'right', marginTop: 4 },
  socialHeader: { marginBottom: 12, paddingHorizontal: 4 },
  socialTitle: { fontSize: 15, fontWeight: '700', color: C.ink },
  socialSub: { fontSize: 12, color: C.textSub, marginTop: 2 },
  editFooter: { backgroundColor: '#FFF', padding: 16, borderTopWidth: 1, borderTopColor: '#F0EBE1' },
  editSaveBtn: { backgroundColor: '#593215', borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, gap: 8 },
  editSaveText: { fontSize: 16, fontWeight: '700', color: '#FFF' },
  editFooterNote: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 12 },
  editFooterNoteText: { fontSize: 12, color: C.textSub },
});
