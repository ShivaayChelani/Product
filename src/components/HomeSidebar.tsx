import React, { useEffect, useMemo, useRef } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Animated,
  Easing,
  ScrollView,
  Alert,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { UserActiveMode, UserProfile } from '../types';
import {
  isCreatorApproved,
  isVendorApproved,
  isCreatorPending,
  isVendorPending,
  canShowCreatorApply,
  canShowVendorApply,
} from '../utils/workspaceRoles';
import { useUserContext } from '../context/UserContext';
import { DrawerHeader } from './sidebar/DrawerHeader';
import { DrawerSection } from './sidebar/DrawerSection';
import { DrawerItem } from './sidebar/DrawerItem';
import { DrawerDivider } from './sidebar/DrawerDivider';
import { DrawerFooter } from './sidebar/DrawerFooter';
import { SB, EXPLORE_ITEMS } from './sidebar/sidebarTheme';
import { useSidebarWidth } from '../design/responsive';

type Props = {
  visible: boolean;
  onClose: () => void;
  user: UserProfile;
  palPoints: number;
  activeMode?: string;
  switchableModes?: UserActiveMode[];
  onSwitchMode?: (mode: UserActiveMode) => Promise<void>;
  onNavigateToWallet?: () => void;
  onNavigateToRewards?: () => void;
  onNavigateToLeaderboard?: () => void;
  onNavigateToVendorOffers?: () => void;
  onNavigateToHiddenGems?: () => void;
  onBecomeCreator?: () => void;
  onBecomeVendor?: () => void;
  onOpenCreatorStudio?: () => void;
  onOpenVendorWorkspace?: () => void;
  onNavigateToLegal?: () => void;
  onLogout?: () => void;
  isGuest?: boolean;
  vendorVerificationStatus?: string | null;
  onNavigateToSaved?: () => void;
  onNavigateToSettings?: () => void;
  onNavigateToHelp?: () => void;
};

export default function HomeSidebar({
  visible,
  onClose,
  user,
  palPoints,
  activeMode = 'USER',
  switchableModes = ['USER'],
  onSwitchMode,
  onNavigateToWallet,
  onNavigateToRewards,
  onNavigateToLeaderboard,
  onNavigateToVendorOffers,
  onNavigateToHiddenGems,
  onBecomeCreator,
  onBecomeVendor,
  onOpenCreatorStudio,
  onOpenVendorWorkspace,
  onLogout,
  isGuest,
  vendorVerificationStatus,
  onNavigateToSaved,
  onNavigateToSettings,
  onNavigateToHelp,
}: Props) {
  const insets = useSafeAreaInsets();
  const sidebarW = useSidebarWidth();
  const { confirmLogout } = useUserContext();

  const workspace = useMemo(() => {
    const creatorApproved = isCreatorApproved(user);
    const vendorApproved = isVendorApproved(user, vendorVerificationStatus);
    const creatorPending = isCreatorPending(user);
    const vendorPending = isVendorPending(user, vendorVerificationStatus);
    const showCreatorApply = !isGuest && canShowCreatorApply(user, vendorVerificationStatus);
    const showVendorApply = !isGuest && canShowVendorApply(user, vendorVerificationStatus);
    const normalizedMode = String(activeMode || 'USER').toUpperCase();
    const canSwitchToUser = !isGuest && switchableModes.includes('USER') && normalizedMode !== 'USER';

    const hasWorkspaceSection =
      canSwitchToUser
      || creatorApproved
      || vendorApproved
      || creatorPending
      || vendorPending
      || showCreatorApply
      || showVendorApply;

    return {
      creatorApproved,
      vendorApproved,
      creatorPending,
      vendorPending,
      showCreatorApply,
      showVendorApply,
      normalizedMode,
      canSwitchToUser,
      hasWorkspaceSection,
      sectionTitle: creatorApproved || vendorApproved ? 'Your Workspace' : 'Partner With Pal Safar',
    };
  }, [user, vendorVerificationStatus, activeMode, switchableModes, isGuest]);

  const slideAnim = useRef(new Animated.Value(-sidebarW)).current;
  const overlayAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    slideAnim.setValue(visible ? 0 : -sidebarW);
    overlayAnim.setValue(visible ? 1 : 0);
  }, [sidebarW]);

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 280,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(overlayAnim, {
          toValue: 1,
          duration: 280,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: -sidebarW,
          duration: 240,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(overlayAnim, {
          toValue: 0,
          duration: 240,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, sidebarW, slideAnim, overlayAnim]);

  const handleLogout = () => {
    onClose();
    confirmLogout();
  };

  const withClose = (action?: () => void) => () => {
    onClose();
    action?.();
  };

  const switchWorkspace = (mode: UserActiveMode) => async () => {
    onClose();
    try {
      if (onSwitchMode) {
        await onSwitchMode(mode);
        return;
      }
      if (mode === 'CONTENT_CREATOR') {
        onOpenCreatorStudio?.();
      } else if (mode === 'VENDOR') {
        onOpenVendorWorkspace?.();
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Please try again.';
      Alert.alert('Unable to switch workspace', message);
    }
  };

  const showPendingAlert = (role: 'Creator' | 'Vendor') => () => {
    Alert.alert(
      `${role} application pending`,
      'Your application is under review. We will notify you once it is approved.',
    );
  };

  const exploreActions: Record<string, (() => void) | undefined> = {
    offers: onNavigateToVendorOffers,
    hiddengems: onNavigateToHiddenGems,
    palpoints: onNavigateToWallet,
    rewards: onNavigateToRewards,
    saved: onNavigateToSaved,
    leaderboard: onNavigateToLeaderboard,
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View
        style={[StyleSheet.absoluteFill, styles.overlay, { opacity: overlayAnim }]}
      >
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
      </Animated.View>

      <Animated.View
        style={[
          styles.panel,
          { width: sidebarW, transform: [{ translateX: slideAnim }] },
        ]}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          bounces={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
        >
          <DrawerHeader
            user={user}
            palPoints={palPoints}
            isGuest={isGuest}
            onClose={onClose}
          />

          <DrawerSection title="Explore">
            {EXPLORE_ITEMS.map(item => (
              <DrawerItem
                key={item.key}
                icon={item.icon || undefined}
                iconColor={item.iconColor}
                iconBg={item.iconBg}
                palPointsIcon={!!item.palPoints}
                customImage={item.customImage}
                label={item.label}
                subtitle={item.subtitle}
                badge={item.badge}
                onPress={withClose(exploreActions[item.key])}
              />
            ))}
          </DrawerSection>

          {workspace.hasWorkspaceSection ? (
            <>
              <DrawerDivider />
              <DrawerSection title={workspace.sectionTitle}>
                {workspace.canSwitchToUser && !workspace.creatorApproved ? (
                  <DrawerItem
                    icon="person-outline"
                    iconColor={SB.accent}
                    iconBg={SB.iconBg}
                    label="Traveler Mode"
                    subtitle="Switch back to normal app"
                    onPress={switchWorkspace('USER')}
                  />
                ) : null}

                {workspace.creatorApproved ? (
                  <DrawerItem
                    icon="videocam-outline"
                    iconColor="#63300E"
                    iconBg="#F9F9F9"
                    label="Creator Studio"
                    subtitle="Manage reels & profile"
                    badge={workspace.normalizedMode === 'CONTENT_CREATOR' ? 'Active' : undefined}
                    active={workspace.normalizedMode === 'CONTENT_CREATOR'}
                    onPress={switchWorkspace('CONTENT_CREATOR')}
                  />
                ) : workspace.creatorPending ? (
                  <DrawerItem
                    icon="time-outline"
                    iconColor={SB.textMuted}
                    iconBg={SB.pendingBg}
                    label="Creator Application"
                    subtitle="Under review"
                    badge="Pending"
                    disabled
                    onPress={showPendingAlert('Creator')}
                  />
                ) : workspace.showCreatorApply ? (
                  <DrawerItem
                    icon="videocam-outline"
                    iconColor="#63300E"
                    iconBg="#F9F9F9"
                    label="Become a Creator"
                    subtitle="Share travel stories"
                    onPress={withClose(onBecomeCreator)}
                  />
                ) : null}

                {!workspace.creatorApproved ? (
                  <>
                    {workspace.vendorApproved ? (
                      <DrawerItem
                        icon="storefront-outline"
                        iconColor="#5C4A3A"
                        iconBg="#EDE4D8"
                        label="Vendor Workspace"
                        subtitle="Manage your business"
                        badge={workspace.normalizedMode === 'VENDOR' ? 'Active' : undefined}
                        active={workspace.normalizedMode === 'VENDOR'}
                        onPress={switchWorkspace('VENDOR')}
                      />
                    ) : workspace.vendorPending ? (
                      <DrawerItem
                        icon="time-outline"
                        iconColor={SB.textMuted}
                        iconBg={SB.pendingBg}
                        label="Vendor Application"
                        subtitle="Under review"
                        badge="Pending"
                        disabled
                        onPress={showPendingAlert('Vendor')}
                      />
                    ) : workspace.showVendorApply ? (
                      <DrawerItem
                        icon="storefront-outline"
                        iconColor="#63300E"
                        iconBg="#F9F9F9"
                        label="Become a Vendor"
                        subtitle="List your business"
                        onPress={withClose(onBecomeVendor)}
                      />
                    ) : null}
                  </>
                ) : null}
              </DrawerSection>
            </>
          ) : null}

          <DrawerDivider />

          <DrawerSection title="More">
            <DrawerItem
              icon="settings-outline"
              iconColor="#5C432F"
              iconBg="#F5EFE6"
              label="Settings"
              onPress={withClose(onNavigateToSettings)}
            />
            <DrawerItem
              icon="headset-outline"
              iconColor="#1D4E89"
              iconBg="#E6F0FA"
              label="Help & Support"
              onPress={withClose(onNavigateToHelp)}
            />
            <DrawerItem
              icon="log-out-outline"
              label="Logout"
              danger
              onPress={handleLogout}
            />
          </DrawerSection>
          
          <DrawerFooter />
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    backgroundColor: 'rgba(28, 18, 12, 0.48)',
  },
  panel: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    backgroundColor: SB.bg,
    borderTopRightRadius: 28,
    borderBottomRightRadius: 28,
    shadowColor: '#000',
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.14,
    shadowRadius: 16,
    elevation: 24,
    overflow: 'hidden',
  },
});
