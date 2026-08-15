import React, { useCallback } from 'react';
import { View, StyleSheet, ActivityIndicator, Text } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { RootStackParamList } from '../navigation/types';
import { useToast } from '../context/ToastContext';
import { tripsApi, TripPlan } from '../services/api/trips';
import { normalizeTripPlan } from '../utils/normalizeTripPlan';
import { seedDraftTripCache } from '../utils/quickAddPlace';
import { useTripPreview } from '../features/tripPreview/hooks/useTripPreview';
import { PreviewHeader } from '../features/tripPreview/components/PreviewHeader';
import { PreviewItinerarySummary } from '../features/tripPreview/components/PreviewItinerarySummary';
import { PreviewFooter } from '../features/tripPreview/components/PreviewFooter';

export default function TripPreviewScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<RootStackParamList, 'TripPreview'>>();
  const tripId = route.params?.tripId;
  const insets = useSafeAreaInsets();
  const { showSuccess, showError } = useToast();

  const { data: trip, isLoading, refetch } = useTripPreview(tripId);
  const [saving, setSaving] = React.useState(false);

  const applyTrip = useCallback(
    (next: TripPlan) => {
      seedDraftTripCache(normalizeTripPlan(next));
      void refetch();
    },
    [refetch],
  );

  const handleSaveDraft = async () => {
    if (!trip) return;
    setSaving(true);
    try {
      const updated = await tripsApi.update(trip.id, { status: 'DRAFT' });
      applyTrip(updated);
      showSuccess('Saved as draft');
    } catch (err: unknown) {
      showError((err as { message?: string })?.message || 'Could not save draft');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveTrip = async () => {
    if (!trip) return;
    setSaving(true);
    try {
      const updated = await tripsApi.update(trip.id, { status: 'UPCOMING' });
      applyTrip(updated);
      showSuccess('Trip saved');
      navigation.navigate('MyTrips', { initialTab: 'UPCOMING' });
    } catch (err: unknown) {
      showError((err as { message?: string })?.message || 'Could not save trip');
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#3E2723" />
        <Text style={styles.loadingText}>Loading preview...</Text>
      </View>
    );
  }

  if (!trip) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorTitle}>Trip not found</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <PreviewHeader
        topInset={insets.top}
        onBack={() => navigation.goBack()}
      />
      
      <PreviewItinerarySummary 
        trip={trip} 
        onEditDay={(day) => navigation.navigate('TripBuilder', { tripId: trip.id, editDay: day.id })} 
      />

      <PreviewFooter
        bottomInset={insets.bottom}
        saving={saving}
        onSaveDraft={handleSaveDraft}
        onSaveTrip={handleSaveTrip}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FDF9F1' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FDF9F1' },
  loadingText: { marginTop: 12, fontSize: 14, color: '#70685D' },
  errorTitle: { fontSize: 16, color: '#D32F2F', fontWeight: 'bold' },
});
