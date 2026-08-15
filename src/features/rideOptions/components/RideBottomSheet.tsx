import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Share,
  Vibration,
  Platform,
  Pressable,
  Alert,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { useLocationContext } from '../../../context/LocationContext';
import { useTheme } from '../../../context/ThemeContext';
import { RideOptionsTheme as T } from '../theme';
import { useRideProviders, rideProvidersQueryKey } from '../hooks/useRideProviders';
import { useRideOpen } from '../hooks/useRideOpen';
import { RideProviderCard } from './RideProviderCard';
import { RideLoading } from './RideLoading';
import { RideErrorState } from './RideErrorState';
import { RideEmptyState } from './RideEmptyState';
import { RIDE_ASSISTANT_DISCLAIMER, sortRideProviders } from '../providers';
import { openProviderApp, type LaunchTarget } from '../utils/openRideApp';
import type { RideProviderId, RideVehicleType } from '../../../services/api/rides';

export type RideBottomSheetProps = {
  visible: boolean;
  onClose: () => void;
  destLat: number;
  destLng: number;
  destName: string;
  destAddress?: string;
};

export type RideOptionsSheetProps = RideBottomSheetProps;

export default function RideBottomSheet({
  visible,
  onClose,
  destLat,
  destLng,
  destName,
  destAddress,
}: RideBottomSheetProps) {
  const insets = useSafeAreaInsets();
  const { effectivePosition } = useLocationContext();
  const { theme } = useTheme();
  const queryClient = useQueryClient();
  const openMutation = useRideOpen();
  const [openingProvider, setOpeningProvider] = useState<RideProviderId | null>(null);
  const [openingTarget, setOpeningTarget] = useState<LaunchTarget | null>(null);

  const pickupLatitude = effectivePosition?.latitude ?? null;
  const pickupLongitude = effectivePosition?.longitude ?? null;
  const invalidDest =
    !Number.isFinite(destLat) || !Number.isFinite(destLng) || (destLat === 0 && destLng === 0);
  const hasPickup = pickupLatitude != null && pickupLongitude != null;

  const providersQuery = useRideProviders({
    enabled: visible && !invalidDest,
    pickupLatitude,
    pickupLongitude,
  });

  const providers = useMemo(
    () => sortRideProviders(providersQuery.data ?? []),
    [providersQuery.data],
  );

  const sheetBg = theme.background ?? T.background;
  const cardBg = theme.card ?? T.card;
  const textColor = theme.text ?? T.text;
  const muted = theme.textSecondary ?? T.textSecondary;

  const haptic = useCallback(() => {
    if (Platform.OS === 'android') Vibration.vibrate(10);
  }, []);

  const onRefresh = useCallback(() => {
    haptic();
    if (!hasPickup) return;
    queryClient.invalidateQueries({
      queryKey: rideProvidersQueryKey(pickupLatitude, pickupLongitude),
    });
    providersQuery.refetch();
  }, [queryClient, pickupLatitude, pickupLongitude, providersQuery, haptic, hasPickup]);

  const onShare = useCallback(async () => {
    haptic();
    await Share.share({ message: `Ride to ${destName} — PalSafar` });
  }, [destName, haptic]);

  const onCopyAddress = useCallback(async () => {
    haptic();
    await Share.share({ message: destAddress || destName });
  }, [destAddress, destName, haptic]);

  const handleOpenProvider = useCallback(
    async (provider: RideProviderId, target: LaunchTarget, vehicleType?: RideVehicleType) => {
      if (!hasPickup || pickupLatitude == null || pickupLongitude == null) return;
      haptic();
      setOpeningProvider(provider);
      setOpeningTarget(target);
      try {
        const response = await openMutation.mutateAsync({
          provider,
          pickupLatitude,
          pickupLongitude,
          destinationLatitude: destLat,
          destinationLongitude: destLng,
          pickupAddress: undefined,
          destinationAddress: destAddress ?? destName,
          vehicleType,
        });
        await openProviderApp(response, target);
      } catch {
        Alert.alert(
          target === 'website' ? 'Could not open website' : 'Could not open app',
          target === 'website'
            ? 'Try again or pick another provider.'
            : 'Install the provider app from the store, or open their website instead.',
        );
      } finally {
        setOpeningProvider(null);
        setOpeningTarget(null);
      }
    },
    [
      hasPickup,
      pickupLatitude,
      pickupLongitude,
      destLat,
      destLng,
      destAddress,
      destName,
      haptic,
      openMutation,
    ],
  );

  const isLoading = hasPickup && providersQuery.isLoading && !providersQuery.data;
  const hasError = providersQuery.isError;

  const providerList = (
    <>
      <View style={[styles.infoBanner, { backgroundColor: cardBg, borderColor: T.border }]}>
        <Icon name="shield-checkmark-outline" size={20} color={T.primary} />
        <Text style={[styles.infoBannerText, { color: textColor }]}>{RIDE_ASSISTANT_DISCLAIMER}</Text>
      </View>

      <View style={styles.listHeader}>
        <Text style={[styles.listTitle, { color: textColor }]}>Available providers</Text>
      </View>

      <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
        {providers.map(p => (
          <RideProviderCard
            key={p.id}
            provider={p}
            canOpen={hasPickup && !invalidDest}
            openingApp={openingProvider === p.id && openingTarget === 'app'}
            openingWeb={openingProvider === p.id && openingTarget === 'website'}
            onOpenApp={(id, vehicle) => handleOpenProvider(id, 'app', vehicle)}
            onOpenWebsite={(id, vehicle) => handleOpenProvider(id, 'website', vehicle)}
          />
        ))}
        {providers.length === 0 && !providersQuery.isLoading ? <RideEmptyState /> : null}
        <View style={{ height: 12 }} />
      </ScrollView>

      <View style={[styles.footer, { backgroundColor: cardBg, borderColor: T.border }]}>
        <FooterAction icon="refresh-outline" label="Refresh" onPress={onRefresh} color={textColor} />
        <FooterAction icon="share-outline" label="Share" onPress={onShare} color={textColor} />
        <FooterAction icon="copy-outline" label="Copy" onPress={onCopyAddress} color={textColor} />
      </View>
    </>
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[
            styles.sheet,
            T.shadow,
            { backgroundColor: sheetBg, paddingBottom: Math.max(insets.bottom, 16) + 8 },
          ]}
          onPress={e => e.stopPropagation()}
        >
          <View style={styles.handleRow}>
            <View style={[styles.handle, { backgroundColor: muted }]} />
          </View>

          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={[styles.title, { color: textColor }]}>Ride Assistant</Text>
              <Text style={[styles.subtitle, { color: muted }]} numberOfLines={1}>
                Travel to {destName}
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.closeBtn, { backgroundColor: cardBg, borderColor: T.border }]}
              onPress={onClose}
              accessibilityLabel="Close ride options"
            >
              <Icon name="close" size={20} color={textColor} />
            </TouchableOpacity>
          </View>

          {!hasPickup ? (
            <>
              <View style={[styles.infoBanner, { backgroundColor: cardBg, borderColor: T.border, marginTop: 0 }]}>
                <Icon name="location-outline" size={20} color={T.primary} />
                <Text style={[styles.infoBannerText, { color: textColor }]}>
                  Enable location so your pickup coordinates can be passed to the provider app.
                </Text>
              </View>
              {invalidDest ? (
                <RideEmptyState message="Invalid destination." />
              ) : (
                providerList
              )}
            </>
          ) : invalidDest ? (
            <RideEmptyState message="Invalid destination." />
          ) : isLoading ? (
            <RideLoading />
          ) : hasError ? (
            <RideErrorState
              message="Unable to load providers. Check your connection and try again."
              onRetry={onRefresh}
            />
          ) : (
            providerList
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function FooterAction({
  icon,
  label,
  onPress,
  color,
}: {
  icon: string;
  label: string;
  onPress: () => void;
  color: string;
}) {
  return (
    <TouchableOpacity style={styles.footerBtn} onPress={onPress} accessibilityLabel={label}>
      <Icon name={icon} size={20} color={color} />
      <Text style={[styles.footerLabel, { color }]} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(45, 36, 29, 0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: T.radiusSheet,
    borderTopRightRadius: T.radiusSheet,
    maxHeight: '92%',
    paddingTop: 4,
  },
  handleRow: { alignItems: 'center', paddingVertical: 8 },
  handle: { width: 44, height: 4, borderRadius: 2 },
  header: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingBottom: 12,
    alignItems: 'flex-start',
  },
  headerText: { flex: 1, paddingRight: 12 },
  title: { fontSize: 22, fontWeight: '800', letterSpacing: -0.3 },
  subtitle: { fontSize: 14, marginTop: 4, fontWeight: '500' },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 14,
    borderRadius: T.radiusCard,
    borderWidth: 1,
  },
  infoBannerText: { flex: 1, fontSize: 14, lineHeight: 20, fontWeight: '500' },
  listHeader: { paddingHorizontal: 20, marginTop: 4, marginBottom: 4 },
  listTitle: { fontSize: 16, fontWeight: '800' },
  list: { paddingHorizontal: 16, maxHeight: 380 },
  footer: {
    flexDirection: 'row',
    borderTopWidth: 1,
    paddingTop: 10,
    paddingHorizontal: 8,
    marginTop: 4,
  },
  footerBtn: { flex: 1, alignItems: 'center', paddingVertical: 6, minHeight: 48 },
  footerLabel: { fontSize: 10, fontWeight: '600', marginTop: 4 },
});
