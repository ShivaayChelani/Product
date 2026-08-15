import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Share,
  TextInput,
  Modal,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NestableScrollContainer } from 'react-native-draggable-flatlist';
import { useToast } from '../../../context/ToastContext';
import { tripsApi, TripPlan, TripPlanDay, TripPlanStop } from '../../../services/api/trips';
import { countTripStops, seedDraftTripCache } from '../../../utils/quickAddPlace';
import { normalizeTripDays, normalizeTripPlan } from '../../../utils/normalizeTripPlan';
import { PressableScale } from '../../../components/home/PressableScale';
import { BT, SERIF, SANS, SANS_BOLD, SANS_SEMI } from '../theme';
import { ItineraryTimelineList } from './ItineraryTimelineList';
import { useOsrmLegs } from '../hooks/useOsrmLegs';
import { countAllStops } from '../utils/itineraryHelpers';

function applyTrip(trip: TripPlan): TripPlan {
  return normalizeTripPlan(trip);
}

function DayItinerarySection({
  day,
  dayIndex,
  showDayHeader,
  listBottomPadding,
  scrollEnabled,
  onReorder,
  onPressStop,
  onMenuStop,
  onAddPlaces,
}: {
  day: TripPlanDay;
  dayIndex: number;
  showDayHeader: boolean;
  listBottomPadding: number;
  scrollEnabled: boolean;
  onReorder: (dayId: string, ordered: TripPlanStop[]) => void;
  onPressStop: (stop: TripPlanStop) => void;
  onMenuStop: (stop: TripPlanStop) => void;
  onAddPlaces: () => void;
}) {
  const stops = day.stops || [];
  const { legs } = useOsrmLegs(stops);
  if (stops.length === 0) return null;
  return (
    <View style={scrollEnabled ? styles.daySectionFlex : undefined}>
      {showDayHeader ? (
        <Text style={styles.daySectionTitle}>Day {day.dayNumber || dayIndex + 1}</Text>
      ) : null}
      <ItineraryTimelineList
        stops={stops}
        legs={legs}
        listBottomPadding={listBottomPadding}
        scrollEnabled={scrollEnabled}
        listKey={day.id}
        onReorder={ordered => onReorder(day.id, ordered)}
        onPressStop={onPressStop}
        onMenuStop={onMenuStop}
        onAddPlaces={onAddPlaces}
      />
    </View>
  );
}

type Props = {
  trip: TripPlan;
  onTripChange: (trip: TripPlan) => void;
};

export function TripBuilderLoadedView({ trip, onTripChange }: Props) {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const footerPad = Math.max(insets.bottom, 12) + 12;
  const listBottomPadding = 76 + footerPad;
  const { showSuccess, showError } = useToast();

  const [saving, setSaving] = useState(false);
  const [savedOnce, setSavedOnce] = useState(countTripStops(trip) > 0);
  const [durationModal, setDurationModal] = useState<{ stop: TripPlanStop; mins: string } | null>(null);

  const stopCount = countAllStops(trip);

  const fetchTrip = useCallback(async () => {
    try {
      const full = await tripsApi.getById(trip.id);
      const applied = applyTrip(full);
      onTripChange(applied);
      seedDraftTripCache(applied);
    } catch (err: unknown) {
      showError((err as { message?: string })?.message || 'Failed to refresh');
    }
  }, [onTripChange, showError, trip.id]);

  const days = useMemo(() => normalizeTripDays(trip.tripDays), [trip.tripDays]);
  const daysWithStops = useMemo(
    () => days.filter(d => (d.stops?.length || 0) > 0 || (d._count?.stops || 0) > 0),
    [days],
  );

  const showResaveLabel = savedOnce || stopCount > 0;
  const draftBtnLabel = showResaveLabel ? 'Resave Trip' : 'Save Trip as Draft';

  const handleReorder = useCallback(
    async (dayId: string, ordered: TripPlanStop[]) => {
      const day = days.find(d => d.id === dayId);
      if (!day?.id) return;
      const prev = day.stops || [];
      const unchanged =
        prev.length === ordered.length && prev.every((stop, index) => stop.id === ordered[index]?.id);
      if (unchanged) return;

      const nextTrip = applyTrip({
        ...trip,
        tripDays: trip.tripDays.map(d =>
          d.id === dayId ? { ...d, stops: ordered.map((s, idx) => ({ ...s, order: idx })) } : d,
        ),
      });
      onTripChange(nextTrip);
      seedDraftTripCache(nextTrip);
      try {
        await tripsApi.reorderStops(
          dayId,
          ordered.map(s => s.id),
        );
      } catch (err: unknown) {
        showError((err as { message?: string })?.message || 'Reorder failed');
        const rolledBack = applyTrip({
          ...trip,
          tripDays: trip.tripDays.map(d => (d.id === dayId ? { ...d, stops: prev } : d)),
        });
        onTripChange(rolledBack);
        seedDraftTripCache(rolledBack);
      }
    },
    [days, onTripChange, showError, trip],
  );

  const handleSaveDraft = async () => {
    setSaving(true);
    const isResave = showResaveLabel || savedOnce;
    try {
      await tripsApi.update(trip.id, {
        status: 'DRAFT',
        title: trip.title,
        destination: trip.destination ?? undefined,
        description: trip.description ?? undefined,
      });
      await fetchTrip();
      setSavedOnce(true);
      showSuccess(isResave ? 'Trip resaved' : 'Draft saved');
    } catch {
      seedDraftTripCache(trip);
      showSuccess(isResave ? 'Trip resaved offline' : 'Draft saved offline');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveTrip = async () => {
    setSaving(true);
    try {
      await tripsApi.update(trip.id, {
        status: 'UPCOMING',
        title: trip.title,
        destination: trip.destination ?? undefined,
        description: trip.description ?? undefined,
      });
      await fetchTrip();
      showSuccess('Trip saved');
      navigation.navigate('MyTrips', { initialTab: 'UPCOMING' });
    } catch (err: unknown) {
      showError((err as { message?: string })?.message || 'Could not save trip');
    } finally {
      setSaving(false);
    }
  };

  const handleDraftAction = () => {
    if (showResaveLabel) {
      Alert.alert('Save trip', 'Choose how to save your itinerary.', [
        { text: 'Resave as Draft', onPress: () => void handleSaveDraft() },
        { text: 'Save Trip', onPress: () => void handleSaveTrip() },
        { text: 'Cancel', style: 'cancel' },
      ]);
      return;
    }
    void handleSaveDraft();
  };

  const handlePreview = () => {
    navigation.navigate('TripPreview', { tripId: trip.id });
  };

  const handleSelectPlaces = useCallback(() => {
    navigation.navigate('MainTabs', { screen: 'Map' });
  }, [navigation]);

  const handleStopMenu = (stop: TripPlanStop) => {
    const dayOptions =
      days.length > 1
        ? days
            .map((d, i) => ({
              text: `Move to Day ${d.dayNumber || i + 1}`,
              onPress: () => void moveStopToDay(stop, i),
              skip: d.id === stop.tripPlanDayId,
            }))
            .filter(opt => !opt.skip)
            .map(({ text, onPress }) => ({ text, onPress }))
        : [];

    Alert.alert(stop.place?.name || 'Stop', undefined, [
      {
        text: 'Edit duration',
        onPress: () =>
          setDurationModal({
            stop,
            mins: String(stop.duration ?? stop.place?.estimatedDurationMinutes ?? 60),
          }),
      },
      ...dayOptions,
      { text: 'Duplicate', onPress: () => void duplicateStop(stop) },
      {
        text: 'Place details',
        onPress: () => navigation.navigate('SpotDetail', { spotId: stop.placeId }),
      },
      {
        text: 'Share',
        onPress: () => void Share.share({ message: `${stop.place?.name} Â via PalSafar` }),
      },
      { text: 'Delete', style: 'destructive', onPress: () => void deleteStop(stop.id) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const deleteStop = async (stopId: string) => {
    try {
      await tripsApi.deleteStop(stopId);
      await fetchTrip();
    } catch (err: unknown) {
      showError((err as { message?: string })?.message || 'Delete failed');
    }
  };

  const duplicateStop = async (stop: TripPlanStop) => {
    const day = days.find(d => d.id === stop.tripPlanDayId);
    if (!day?.id) return;
    try {
      await tripsApi.addStop(day.id, { placeId: stop.placeId, order: day.stops?.length || 0 });
      await fetchTrip();
      showSuccess('Stop duplicated');
    } catch (err: unknown) {
      showError((err as { message?: string })?.message || 'Duplicate failed');
    }
  };

  const moveStopToDay = async (stop: TripPlanStop, targetDayIndex: number) => {
    const targetDay = days[targetDayIndex];
    if (!targetDay?.id || targetDay.id === stop.tripPlanDayId) return;
    try {
      await tripsApi.deleteStop(stop.id);
      await tripsApi.addStop(targetDay.id, {
        placeId: stop.placeId,
        order: targetDay.stops?.length || 0,
      });
      await fetchTrip();
    } catch (err: unknown) {
      showError((err as { message?: string })?.message || 'Move failed');
    }
  };

  const saveDuration = async () => {
    if (!durationModal) return;
    const mins = parseInt(durationModal.mins, 10);
    if (!Number.isFinite(mins) || mins < 15) {
      showError('Enter at least 15 minutes');
      return;
    }
    try {
      await tripsApi.updateStop(durationModal.stop.id, { duration: mins });
      setDurationModal(null);
      await fetchTrip();
    } catch (err: unknown) {
      showError((err as { message?: string })?.message || 'Update failed');
    }
  };

  const nestedDays = daysWithStops.length > 1;
  const daySections = days.map((day, dayIndex) =>
    (day.stops?.length || 0) > 0 ? (
      <DayItinerarySection
        key={day.id}
        day={day}
        dayIndex={dayIndex}
        showDayHeader={daysWithStops.length > 1}
        listBottomPadding={nestedDays ? 0 : listBottomPadding}
        scrollEnabled={!nestedDays}
        onReorder={handleReorder}
        onPressStop={stop => navigation.navigate('SpotDetail', { spotId: stop.placeId })}
        onMenuStop={handleStopMenu}
        onAddPlaces={handleSelectPlaces}
      />
    ) : null,
  );

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <PressableScale style={styles.iconBtn} onPress={() => navigation.goBack()}>
          <Icon name="arrow-back" size={22} color={BT.text} />
        </PressableScale>
        <View style={styles.headerCenter}>
          <Text style={styles.screenTitle}>Build Your Itinerary</Text>
          <Text style={styles.screenSub}>Organize your places and create your perfect itinerary.</Text>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.toolbar}>
        <PressableScale style={styles.toolBtnWide} onPress={handleSelectPlaces}>
          <Text style={styles.toolBtnTextPrimary}>+ Add More Places</Text>
        </PressableScale>
      </View>

      <View style={styles.dragHintBar}>
        <MaterialCommunityIcons name="drag" size={14} color={BT.textSecondary} />
        <Text style={styles.dragHintText}>Long press and drag to reorder places</Text>
      </View>

      <View style={styles.listFlex}>
        {nestedDays ? (
          <NestableScrollContainer
            style={styles.listScroll}
            contentContainerStyle={{ paddingBottom: listBottomPadding }}
            keyboardShouldPersistTaps="handled"
          >
            {daySections}
          </NestableScrollContainer>
        ) : (
          daySections
        )}
      </View>

      <View style={[styles.footer, { paddingBottom: footerPad }]}>
        <PressableScale style={styles.draftBtn} onPress={handleDraftAction} disabled={saving}>
          {saving ? (
            <ActivityIndicator size="small" color={BT.primary} />
          ) : (
            <>
              <Icon name="bookmark-outline" size={18} color={BT.primary} />
              <Text style={styles.draftBtnText}>{draftBtnLabel}</Text>
            </>
          )}
        </PressableScale>
        <PressableScale style={styles.previewBtn} onPress={handlePreview}>
          <Icon name="eye-outline" size={18} color="#FFF" />
          <Text style={styles.previewBtnText}>Preview Trip</Text>
          <View style={styles.previewChevronCircle}>
            <Icon name="chevron-forward" size={16} color="#FFF" />
          </View>
        </PressableScale>
      </View>

      <Modal visible={!!durationModal} transparent animationType="fade">
        <View style={styles.modalBg}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Visit duration (minutes)</Text>
            <TextInput
              style={styles.modalInput}
              keyboardType="number-pad"
              value={durationModal?.mins || ''}
              onChangeText={mins => setDurationModal(prev => (prev ? { ...prev, mins } : null))}
            />
            <View style={styles.modalActions}>
              <PressableScale onPress={() => setDurationModal(null)}>
                <Text style={styles.modalCancel}>Cancel</Text>
              </PressableScale>
              <PressableScale onPress={saveDuration}>
                <Text style={styles.modalSave}>Save</Text>
              </PressableScale>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BT.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 4,
  },
  headerCenter: { flex: 1, minWidth: 0, alignItems: 'center', paddingTop: 2 },
  headerSpacer: { width: 44, height: 44 },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: BT.card,
    borderWidth: 1,
    borderColor: BT.border,
    alignItems: 'center',
    justifyContent: 'center',
    ...BT.shadow,
  },
  screenTitle: {
    fontFamily: SERIF,
    fontSize: 22,
    color: BT.text,
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  screenSub: {
    fontFamily: SANS,
    fontSize: 11,
    color: BT.textSecondary,
    marginTop: 4,
    lineHeight: 15,
    textAlign: 'center',
    paddingHorizontal: 4,
  },
  toolbar: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 8,
    marginTop: 10,
    marginBottom: 8,
    alignItems: 'center',
  },
  toolBtnWide: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    borderRadius: 20,
    backgroundColor: BT.card,
    borderWidth: 1,
    borderColor: BT.border,
  },
  toolBtnTextPrimary: { fontFamily: SANS_SEMI, fontSize: 12, color: BT.primary },
  dragHintBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 20,
    marginBottom: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: BT.selectedBg,
    borderWidth: 1,
    borderColor: BT.border,
  },
  dragHintText: { fontFamily: SANS, fontSize: 11, color: BT.textSecondary },
  listFlex: { flex: 1, minHeight: 0 },
  daySectionFlex: { flex: 1, minHeight: 0 },
  listScroll: { flex: 1 },
  daySectionTitle: {
    fontFamily: SANS_BOLD,
    fontSize: 13,
    color: BT.text,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 4,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 10,
    backgroundColor: BT.bg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: BT.border,
  },
  draftBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: BT.primary,
    backgroundColor: BT.card,
  },
  draftBtnText: { fontFamily: SANS_BOLD, fontSize: 12, color: BT.primary },
  previewBtn: {
    flex: 1.08,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingLeft: 14,
    paddingRight: 8,
    borderRadius: 20,
    backgroundColor: BT.primary,
    gap: 8,
  },
  previewBtnText: { fontFamily: SANS_BOLD, fontSize: 12, color: '#FFF', flex: 1 },
  previewChevronCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBg: {
    flex: 1,
    backgroundColor: 'rgba(45,36,29,0.45)',
    justifyContent: 'center',
    padding: 24,
  },
  modalBox: { backgroundColor: BT.card, borderRadius: 20, padding: 20 },
  modalTitle: { fontFamily: SERIF, fontSize: 18, color: BT.text, marginBottom: 12 },
  modalInput: {
    borderWidth: 1,
    borderColor: BT.border,
    borderRadius: 14,
    padding: 12,
    fontFamily: SANS,
    fontSize: 16,
    backgroundColor: BT.bg,
  },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 20, marginTop: 16 },
  modalCancel: { fontFamily: SANS, color: BT.textSecondary },
  modalSave: { fontFamily: SANS_BOLD, color: BT.primary },
});
