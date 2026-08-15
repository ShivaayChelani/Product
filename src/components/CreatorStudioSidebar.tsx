import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Animated,
  Easing,
  Image,
  ScrollView,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { UserProfile } from '../types';
import { useSidebarWidth } from '../design/responsive';
import { useUserContext } from '../context/UserContext';

const C = {
  bg: '#FFFFFF',
  surface: '#FFFFFF',
  deep: '#4D3227',
  bronze: '#A67C52',
  muted: '#8B7355',
  border: '#E9D4BE',
  soft: '#FFFFFF',
  danger: '#EF4444',
};

type MenuItem = {
  icon: string;
  lib?: 'ion' | 'mci';
  label: string;
  subtitle?: string;
  onPress?: () => void;
  danger?: boolean;
  badge?: string;
};

type MenuSection = {
  title: string;
  items: MenuItem[];
};

export type CreatorStudioSidebarProps = {
  visible: boolean;
  onClose: () => void;
  user: UserProfile;
  creatorName?: string;
  creatorHandle?: string;
  creatorAvatar?: string | null;
  verified?: boolean;
  palPoints?: number;
  reelCount?: number;
  onNavigateReels?: () => void;
  onNavigateCreateReel?: () => void;
  onNavigateAnalytics?: () => void;
  onNavigateCollaborations?: () => void;
  onNavigateProfile?: () => void;
  onNavigateNotifications?: () => void;
  onNavigateSettings?: () => void;
  onNavigateLegal?: () => void;
  onNavigateSubscription?: () => void;
  onSwitchToUser?: () => void;
  onLogout?: () => void;
};

function MenuRow({ item, onClose }: { item: MenuItem; onClose: () => void }) {
  const IconComp = item.lib === 'mci' ? MaterialCommunityIcons : Icon;
  return (
    <TouchableOpacity
      style={styles.row}
      activeOpacity={0.72}
      onPress={() => {
        onClose();
        item.onPress?.();
      }}
    >
      <View style={[styles.rowIcon, item.danger && styles.rowIconDanger]}>
        <IconComp name={item.icon as any} size={20} color={item.danger ? C.danger : C.bronze} />
      </View>
      <View style={styles.rowCopy}>
        <Text style={[styles.rowLabel, item.danger && styles.rowLabelDanger]}>{item.label}</Text>
        {item.subtitle ? <Text style={styles.rowSub}>{item.subtitle}</Text> : null}
      </View>
      {item.badge ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{item.badge}</Text>
        </View>
      ) : null}
      <Icon name="chevron-forward" size={16} color={C.muted} />
    </TouchableOpacity>
  );
}

export default function CreatorStudioSidebar({
  visible,
  onClose,
  user,
  creatorName,
  creatorHandle,
  creatorAvatar,
  verified,
  palPoints = 0,
  reelCount = 0,
  onNavigateReels,
  onNavigateCreateReel,
  onNavigateAnalytics,
  onNavigateCollaborations,
  onNavigateProfile,
  onNavigateNotifications,
  onNavigateSettings,
  onNavigateLegal,
  onNavigateSubscription,
  onSwitchToUser,
  onLogout,
}: CreatorStudioSidebarProps) {
  const insets = useSafeAreaInsets();
  const sidebarW = useSidebarWidth();
  const slideAnim = useRef(new Animated.Value(-sidebarW)).current;
  const { confirmLogout } = useUserContext();

  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: visible ? 0 : -sidebarW,
      duration: 280,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [visible, sidebarW, slideAnim]);

  const displayName = creatorName || user.displayName || 'Creator';
  const handle = creatorHandle || user.creatorProfile?.username || user.displayName?.toLowerCase().replace(/\s+/g, '') || 'creator';
  const initial = (displayName[0] || 'C').toUpperCase();

  const sections: MenuSection[] = [
    {
      title: 'STUDIO',
      items: [
        {
          icon: 'people-outline',
          label: 'Collaborations',
          subtitle: 'Brand campaigns & requests',
          onPress: onNavigateCollaborations,
        },
      ],
    },
    {
      title: 'WORKSPACE',
      items: [
        {
          icon: 'compass-outline',
          label: 'Switch to Tourist Mode',
          subtitle: 'Explore as a traveler',
          onPress: onSwitchToUser,
        },
        {
          icon: 'card-outline',
          label: 'Subscription',
          subtitle: 'Plans, billing & upgrades',
          onPress: onNavigateSubscription,
        },
        {
          icon: 'notifications-outline',
          label: 'Notifications',
          onPress: onNavigateNotifications,
        },
        {
          icon: 'settings-outline',
          label: 'Settings',
          onPress: onNavigateSettings,
        },
        {
          icon: 'document-text-outline',
          label: 'Legal & Help',
          onPress: onNavigateLegal,
        },
      ],
    },
  ];

  const handleLogout = () => {
    onClose();
    confirmLogout();
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.root}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose} />
        <Animated.View
          style={[
            styles.panel,
            {
              width: sidebarW,
              paddingTop: insets.top + 8,
              transform: [{ translateX: slideAnim }],
            },
          ]}
        >
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
          >
            <View style={styles.header}>
              <View style={styles.headerTop}>
                <View style={styles.studioPill}>
                  <Icon name="videocam" size={12} color={C.bronze} />
                  <Text style={styles.studioPillText}>CREATOR STUDIO</Text>
                </View>
                <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={12}>
                  <Icon name="close" size={22} color={C.deep} />
                </TouchableOpacity>
              </View>

              <View style={styles.profileRow}>
                <View style={styles.avatarWrap}>
                  {creatorAvatar ? (
                    <Image source={{ uri: creatorAvatar }} style={styles.avatar} />
                  ) : user.avatar ? (
                    <Image source={{ uri: user.avatar }} style={styles.avatar} />
                  ) : (
                    <View style={[styles.avatar, styles.avatarFallback]}>
                      <Text style={styles.avatarLetter}>{initial}</Text>
                    </View>
                  )}
                  <View style={styles.avatarRing} />
                </View>
                <View style={styles.profileMeta}>
                  <View style={styles.nameRow}>
                    <Text style={styles.profileName} numberOfLines={1}>{displayName}</Text>
                    {verified ? <Icon name="checkmark-circle" size={16} color={C.bronze} /> : null}
                  </View>
                  <Text style={styles.handle}>@{handle}</Text>
                  <View style={styles.statsRow}>
                    <View style={styles.statChip}>
                      <MaterialCommunityIcons name="circle-multiple" size={13} color={C.bronze} />
                      <Text style={styles.statText}>{palPoints.toLocaleString()} pts</Text>
                    </View>
                    <View style={styles.statChip}>
                      <Icon name="play-outline" size={13} color={C.bronze} />
                      <Text style={styles.statText}>{reelCount} reels</Text>
                    </View>
                  </View>
                </View>
              </View>
            </View>



            {sections.map((section) => (
              <View key={section.title} style={styles.section}>
                <Text style={styles.sectionTitle}>{section.title}</Text>
                <View style={styles.sectionCard}>
                  {section.items.map((item, index) => (
                    <View key={item.label}>
                      {index > 0 ? <View style={styles.divider} /> : null}
                      <MenuRow item={item} onClose={onClose} />
                    </View>
                  ))}
                </View>
              </View>
            ))}


          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(77, 50, 39, 0.42)',
  },
  panel: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    backgroundColor: C.bg,
    borderTopRightRadius: 28,
    borderBottomRightRadius: 28,
    shadowColor: '#4D3227',
    shadowOffset: { width: 6, height: 0 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 18,
  },
  header: {
    paddingHorizontal: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  studioPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: C.soft,
    borderWidth: 1,
    borderColor: C.border,
  },
  studioPillText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: C.bronze,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
  },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatarWrap: { position: 'relative' },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: C.soft,
  },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  avatarLetter: { fontSize: 22, fontWeight: '800', color: C.bronze },
  avatarRing: {
    position: 'absolute',
    top: -3,
    left: -3,
    right: -3,
    bottom: -3,
    borderRadius: 31,
    borderWidth: 2,
    borderColor: 'rgba(166, 124, 82, 0.35)',
  },
  profileMeta: { flex: 1, minWidth: 0 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  profileName: { fontSize: 17, fontWeight: '800', color: C.deep, flexShrink: 1 },
  handle: { fontSize: 12, color: C.muted, marginTop: 2, fontWeight: '600' },
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  statChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
  },
  statText: { fontSize: 11, fontWeight: '700', color: C.deep },
  createCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 18,
    marginTop: 16,
    marginBottom: 4,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: C.bronze,
  },
  createCtaText: { fontSize: 15, fontWeight: '800', color: '#fff' },
  section: { paddingHorizontal: 16, paddingTop: 16 },
  sectionTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: C.muted,
    letterSpacing: 1,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  sectionCard: {
    backgroundColor: C.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  rowIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: C.soft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowIconDanger: { backgroundColor: 'rgba(239,68,68,0.1)' },
  rowCopy: { flex: 1, minWidth: 0 },
  rowLabel: { fontSize: 14, fontWeight: '700', color: C.deep },
  rowLabelDanger: { color: C.danger },
  rowSub: { fontSize: 11, color: C.muted, marginTop: 2, fontWeight: '500' },
  badge: {
    backgroundColor: 'rgba(166, 124, 82, 0.14)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  badgeText: { fontSize: 9, fontWeight: '800', color: C.bronze },
  divider: { height: 1, backgroundColor: C.border, marginLeft: 62 },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 18,
    marginTop: 18,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: C.danger,
  },
  logoutText: { fontSize: 15, fontWeight: '800', color: '#fff' },
});
