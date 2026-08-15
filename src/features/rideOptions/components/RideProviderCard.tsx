import React, { memo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { RideOptionsTheme as T } from '../theme';
import { RIDE_PROVIDER_REGISTRY, RIDE_PRICING_NOTE, integrationLabel } from '../providers';
import { RideButton } from './RideButton';
import { RideVehicleSelector } from './RideVehicleSelector';
import type { RideProviderConfig, RideProviderId, RideVehicleType } from '../../../services/api/rides';

const VEHICLE_MAP: Record<string, RideVehicleType> = {
  Go: 'cab',
  Moto: 'bike',
  XL: 'xl',
  Mini: 'cab',
  Bike: 'bike',
  Auto: 'auto',
  Electric: 'electric',
  Premium: 'cab',
};

type Props = {
  provider: RideProviderConfig;
  canOpen: boolean;
  openingApp?: boolean;
  openingWeb?: boolean;
  onOpenApp: (provider: RideProviderId, vehicleType?: RideVehicleType) => void;
  onOpenWebsite: (provider: RideProviderId, vehicleType?: RideVehicleType) => void;
};

function RideProviderCardInner({
  provider,
  canOpen,
  openingApp,
  openingWeb,
  onOpenApp,
  onOpenWebsite,
}: Props) {
  const brand = RIDE_PROVIDER_REGISTRY[provider.id];
  const brandColor = provider.color ?? brand?.color ?? '#000000';
  const brandIcon = provider.icon ?? brand?.icon ?? 'car';
  const [selectedVehicle, setSelectedVehicle] = useState(provider.vehicles[0] ?? null);
  const busy = openingApp || openingWeb;

  const handleOpenApp = () => {
    if (!canOpen || busy) return;
    const vehicleType = selectedVehicle ? VEHICLE_MAP[selectedVehicle] : undefined;
    onOpenApp(provider.id, vehicleType);
  };

  const handleOpenWebsite = () => {
    if (!canOpen || busy || !provider.supportsWebBooking) return;
    const vehicleType = selectedVehicle ? VEHICLE_MAP[selectedVehicle] : undefined;
    onOpenWebsite(provider.id, vehicleType);
  };

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <View style={[styles.logo, { backgroundColor: brandColor + '14' }]}>
          <Icon name={brandIcon} size={24} color={brandColor} />
        </View>
        <View style={styles.mid}>
          <Text style={styles.providerName}>{provider.name}</Text>
          <Text style={styles.vehicles} numberOfLines={2}>
            {provider.vehicles.join(' · ')}
          </Text>
          <View style={styles.metaRow}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{integrationLabel(provider)}</Text>
            </View>
            {!provider.supportsFareEstimate ? (
              <Text style={styles.pricingNote}>{RIDE_PRICING_NOTE}</Text>
            ) : null}
          </View>
        </View>
      </View>
      <RideVehicleSelector
        vehicles={provider.vehicles}
        selected={selectedVehicle}
        onSelect={setSelectedVehicle}
      />
      <View style={styles.actions}>
        {provider.supportsDeepLink ? (
          <RideButton
            label="Open App"
            onPress={handleOpenApp}
            disabled={!canOpen}
            loading={openingApp}
            variant="primary"
            style={styles.actionBtn}
          />
        ) : null}
        {provider.supportsWebBooking ? (
          <RideButton
            label="Open Website"
            onPress={handleOpenWebsite}
            disabled={!canOpen}
            loading={openingWeb}
            variant="secondary"
            style={styles.actionBtn}
          />
        ) : null}
      </View>
    </View>
  );
}

export const RideProviderCard = memo(RideProviderCardInner);

const styles = StyleSheet.create({
  card: {
    backgroundColor: T.card,
    borderRadius: T.radiusCard,
    borderWidth: 1,
    borderColor: T.border,
    padding: 14,
    marginBottom: 10,
  },
  row: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  logo: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mid: { flex: 1 },
  providerName: { fontSize: 17, fontWeight: '800', color: T.text },
  vehicles: { fontSize: 13, color: T.textSecondary, marginTop: 4, lineHeight: 18 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 8 },
  badge: {
    backgroundColor: T.primary + '18',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  badgeText: { fontSize: 11, fontWeight: '700', color: T.primary },
  pricingNote: { fontSize: 11, color: T.textSecondary, flex: 1 },
  actions: { flexDirection: 'row', gap: 8 },
  actionBtn: { flex: 1 },
});
