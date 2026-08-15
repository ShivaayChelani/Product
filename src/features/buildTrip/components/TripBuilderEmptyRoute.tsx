import React, { useCallback } from 'react';
import { useNavigation } from '@react-navigation/native';
import { TripPlan } from '../../../services/api/trips';
import { PlaceResponse } from '../../../services/api/places';
import { tripsApi } from '../../../services/api/trips';
import { useToast } from '../../../context/ToastContext';
import {
  ensureManualDraftTrip,
  quickAddPlaceToTrip,
  seedDraftTripCache,
} from '../../../utils/quickAddPlace';
import { normalizeTripPlan } from '../../../utils/normalizeTripPlan';
import { BuildItineraryEmptyState } from './BuildItineraryEmptyState';

type Props = {
  trip: TripPlan | null;
  onTripChange: (trip: TripPlan | null) => void;
};

function applyTrip(trip: TripPlan): TripPlan {
  return normalizeTripPlan(trip);
}

export function TripBuilderEmptyRoute({ trip, onTripChange }: Props) {
  const navigation = useNavigation<any>();
  const { showSuccess, showError } = useToast();

  const handleBrowseMap = useCallback(() => {
    navigation.navigate('MainTabs', { screen: 'Map' });
  }, [navigation]);

  const handleSelectPlaces = useCallback(() => {
    const activeTrip = trip;
    const existingPlaceIds = activeTrip
      ? (activeTrip.tripDays || []).flatMap(d => (d.stops || []).map(s => s.placeId))
      : [];
    navigation.navigate('Search', {
      mode: 'itinerary',
      tripId: activeTrip?.id,
      destination: activeTrip?.destination || undefined,
      excludePlaceIds: existingPlaceIds,
    });
  }, [navigation, trip]);

  const handleCreateEmptyTrip = useCallback(async () => {
    try {
      if (!trip?.id) {
        const draft = await ensureManualDraftTrip();
        onTripChange(applyTrip(draft));
      }
      navigation.navigate('MainTabs', { screen: 'Map' });
    } catch (err: unknown) {
      showError((err as { message?: string })?.message || 'Could not create trip');
    }
  }, [navigation, onTripChange, showError, trip?.id]);

  const refreshTrip = useCallback(
    async (tripId: string) => {
      const full = await tripsApi.getById(tripId);
      const applied = applyTrip(full);
      onTripChange(applied);
      seedDraftTripCache(applied);
    },
    [onTripChange],
  );

  const handleAddPlaceToTrip = useCallback(
    async (place: PlaceResponse) => {
      try {
        const result = await quickAddPlaceToTrip(place.id, {
          tripId: trip?.id,
          name: place.name,
          city: place.city || undefined,
        });
        try {
          await refreshTrip(result.tripId);
        } catch {
          /* persist already seeded the draft cache; focus refetch will recover */
        }
        showSuccess(`${place.name} added to your itinerary`);
      } catch (err: unknown) {
        showError((err as { message?: string })?.message || 'Could not add place');
      }
    },
    [refreshTrip, showError, showSuccess, trip?.id],
  );

  const handleAddAllRecommended = useCallback(
    async (places: PlaceResponse[]) => {
      if (!places.length) return;
      let added = 0;
      const addedByTrip = new Map<string, number>();
      for (const place of places.slice(0, 4)) {
        try {
          // Omit tripId so the server creates/reuses a city-specific draft
          // instead of chaining mixed-city places onto one itinerary.
          const result = await quickAddPlaceToTrip(place.id, {
            name: place.name,
            city: place.city || undefined,
          });
          addedByTrip.set(result.tripId, (addedByTrip.get(result.tripId) || 0) + 1);
          added += 1;
        } catch {
          /* try next */
        }
      }
      const preferredTripId =
        (trip?.id && addedByTrip.has(trip.id) ? trip.id : null)
        || [...addedByTrip.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
      if (added > 0 && preferredTripId) {
        await refreshTrip(preferredTripId);
        showSuccess(`${added} place${added === 1 ? '' : 's'} added to your itinerary`);
      } else {
        showError('Could not add recommended places. Try Search instead.');
      }
    },
    [refreshTrip, showError, showSuccess, trip?.id],
  );

  return (
    <BuildItineraryEmptyState
      onBack={() => navigation.goBack()}
      onNotifications={() => navigation.navigate('Notifications')}
      onAddFromMap={handleBrowseMap}
      onSearchPlaces={handleSelectPlaces}
      onBrowsePopular={handleSelectPlaces}
      onCreateEmptyTrip={handleCreateEmptyTrip}
      onAddFirstDestination={handleSelectPlaces}
      onPressPlace={place => void handleAddPlaceToTrip(place)}
      onAddAllRecommended={places => handleAddAllRecommended(places)}
      onViewAllRecommended={handleSelectPlaces}
    />
  );
}
