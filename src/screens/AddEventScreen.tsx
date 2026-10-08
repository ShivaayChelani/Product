/**
 * Add Community Event — the submitter's form.
 *
 * One scroll of sections (what/when/where/describe/media/organiser), local
 * validation that mirrors `createEventSchema`, and a single POST at the end.
 * Nothing on this screen can make an event public: the server stores every
 * submission as PENDING and derives moderation itself, so the payload built
 * here never carries a status, an approval, or a slug.
 *
 * Location is mandatory (the server rejects an event without a coordinate
 * pair), and it is chosen on a real map — `PickEventLocation` — which returns
 * through `AddEvent` route params so no callback ever lives in navigation
 * state.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as ImagePicker from 'react-native-image-picker';
import { EVENT_COLORS } from '../features/events/EventCard';
import { EVENT_TYPES, eventsApi, type EventType } from '../services/api/events';
import { eventTypeIcon, eventTypeLabel } from '../features/events/eventFormat';
import {
  EMPTY_EVENT_DRAFT,
  EVENT_FORM_LIMITS,
  EVENT_SUBMIT_NOTICE,
  buildCreateEventInput,
  firstEventFormError,
  formatDisplayDate,
  formatTime12,
  isDateOnOrAfter,
  isDraftDirty,
  todayIso,
  validateEventDraft,
  type EventDraft,
  type EventFormField,
} from '../features/events/eventFormDate';
import EventDateModal from '../features/events/components/EventDateModal';
import EventTimeModal from '../features/events/components/EventTimeModal';
import EventOptionSheet from '../features/events/components/EventOptionSheet';
import RelatedPlaceSheet from '../features/events/components/RelatedPlaceSheet';
import { uploadApi } from '../services/api/upload';
import { useUserContext } from '../context/UserContext';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/** Fields grouped by the section that renders them (for scroll-to-error). */
const SECTION_FIELDS: Record<string, EventFormField[]> = {
  basic: ['title', 'eventType'],
  schedule: ['startDate', 'endDate', 'startTime', 'endTime'],
  location: ['location', 'address', 'city', 'state'],
  details: ['shortDescription', 'description'],
  media: ['coverImage', 'images'],
  organizer: ['organizerName', 'organizerContact', 'websiteUrl', 'entryFee', 'linkedPlaceId'],
};

const TYPE_OPTIONS = EVENT_TYPES.map(value => ({
  value,
  label: eventTypeLabel(value),
  icon: eventTypeIcon(value),
}));

type ErrorMap = Partial<Record<EventFormField, string>>;

export default function AddEventScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteProp<RootStackParamList, 'AddEvent'>>();
  const { isGuest, onLogout } = useUserContext();

  const scrollRef = useRef<ScrollView>(null);
  const sectionY = useRef<Record<string, number>>({});
  const submittedRef = useRef(false);

  const [draft, setDraft] = useState<EventDraft>(EMPTY_EVENT_DRAFT);
  const [errors, setErrors] = useState<ErrorMap>({});
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState<'cover' | 'images' | null>(null);
  // Mirrors `draft` so async code (uploads) validates the form as it is *now*,
  // not as it was when Submit was pressed.
  const draftRef = useRef(draft);
  draftRef.current = draft;

  const [dateTarget, setDateTarget] = useState<'startDate' | 'endDate' | null>(null);
  const [timeTarget, setTimeTarget] = useState<'startTime' | 'endTime' | null>(null);
  const [typeSheetOpen, setTypeSheetOpen] = useState(false);
  const [placeSheetOpen, setPlaceSheetOpen] = useState(false);

  const dirty = isDraftDirty(draft);

  const patch = useCallback((next: Partial<EventDraft>) => {
    setDraft(prev => ({ ...prev, ...next }));
    setErrors(prev => {
      if (!Object.keys(prev).length) return prev;
      const cleared: ErrorMap = { ...prev };
      for (const key of Object.keys(next) as EventFormField[]) delete cleared[key];
      return cleared;
    });
  }, []);

  // The map picker merges its result back into these params.
  const picked = route.params?.pickedLocation;
  const pickedNonce = route.params?.pickedNonce;
  useEffect(() => {
    if (!picked) return;
    setDraft(prev => ({
      ...prev,
      hasLocation: true,
      latitude: picked.latitude,
      longitude: picked.longitude,
      address: picked.address || prev.address,
      city: picked.city || prev.city,
      state: picked.state || prev.state,
    }));
    setErrors(prev => {
      const next = { ...prev };
      delete next.location;
      return next;
    });
  }, [picked, pickedNonce]);

  // Leaving with a half-typed form must never be a silent discard.
  useEffect(() => {
    const listener = navigation.addListener('beforeRemove', e => {
      if (!dirty || submittedRef.current) return;
      e.preventDefault();
      Alert.alert('Discard event draft?', 'Your event details have not been submitted yet.', [
        { text: 'Keep editing', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () => navigation.dispatch(e.data.action),
        },
      ]);
    });
    return listener;
  }, [navigation, dirty]);

  const onSectionLayout = useCallback((section: string) => (event: { nativeEvent: { layout: { y: number } } }) => {
    sectionY.current[section] = event.nativeEvent.layout.y;
  }, []);

  const scrollToField = useCallback((field: EventFormField) => {
    const section =
      Object.keys(SECTION_FIELDS).find(key => SECTION_FIELDS[key].includes(field)) || 'basic';
    const y = sectionY.current[section];
    if (typeof y === 'number') {
      scrollRef.current?.scrollTo({ y: Math.max(0, y - 72), animated: true });
    }
  }, []);

  const runClientValidation = useCallback((target: EventDraft = draft): boolean => {
    const found = validateEventDraft(target);
    if (!found.length) {
      setErrors({});
      return true;
    }
    const next: ErrorMap = {};
    for (const error of found) next[error.field] = error.message;
    setErrors(next);
    const first = firstEventFormError(target);
    if (first) scrollToField(first.field);
    return false;
  }, [draft, scrollToField]);

  // ── Media ────────────────────────────────────────────────────────────────

  const pickCover = useCallback(async () => {
    const result = await ImagePicker.launchImageLibrary({ mediaType: 'photo', quality: 0.8 });
    const uri = result.assets?.[0]?.uri;
    if (uri) patch({ coverImageUri: uri });
  }, [patch]);

  const pickGalleryImage = useCallback(async () => {
    if (draft.imageUris.length >= EVENT_FORM_LIMITS.imagesMax) {
      Alert.alert('Photo limit reached', `You can add up to ${EVENT_FORM_LIMITS.imagesMax} photos.`);
      return;
    }
    const result = await ImagePicker.launchImageLibrary({ mediaType: 'photo', quality: 0.8 });
    const uri = result.assets?.[0]?.uri;
    if (uri) patch({ imageUris: [...draft.imageUris, uri] });
  }, [draft.imageUris, patch]);

  // ── Submit ───────────────────────────────────────────────────────────────

  const handleSubmit = useCallback(async () => {
    if (isGuest) {
      Alert.alert('Sign in required', 'Please sign in to submit an event.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign in', onPress: () => onLogout() },
      ]);
      return;
    }
    if (submitting) return;
    if (!runClientValidation()) return;

    setSubmitting(true);
    try {
      setUploading(draft.coverImageUri ? 'cover' : draft.imageUris.length ? 'images' : null);
      const cover = draft.coverImageUri
        ? (await uploadApi.uploadImage(draft.coverImageUri)).url
        : null;
      if (draft.imageUris.length) setUploading('images');
      const gallery = draft.imageUris.length
        ? (await uploadApi.uploadMultiple(draft.imageUris)).map(item => item.url).filter(Boolean)
        : [];

      // Uploads take time: the form can change underneath us while they run.
      // Re-validate the live draft so an incomplete payload is never POSTed.
      const live = draftRef.current;
      if (!runClientValidation(live)) return;

      const input = buildCreateEventInput(live, { coverImage: cover, images: gallery });
      const created = await eventsApi.create(input);

      submittedRef.current = true;
      setErrors({});
      Alert.alert(
        EVENT_SUBMIT_NOTICE.title,
        `${EVENT_SUBMIT_NOTICE.body}\n\nStatus: ${EVENT_SUBMIT_NOTICE.status}`,
        [
          { text: 'Done', style: 'cancel', onPress: () => navigation.goBack() },
          {
            text: 'View my events',
            onPress: () => navigation.replace('MyEvents'),
          },
        ],
      );
      return created;
    } catch (error) {
      const message =
        (error as { message?: string })?.message || 'Could not submit this event. Please try again.';
      Alert.alert('Submission failed', message);
    } finally {
      setSubmitting(false);
      setUploading(null);
    }
  }, [draft, isGuest, navigation, onLogout, runClientValidation, submitting]);

  const openLocationPicker = useCallback(() => {
    navigation.navigate('PickEventLocation', {
      latitude: draft.latitude ?? undefined,
      longitude: draft.longitude ?? undefined,
      address: draft.address || undefined,
      city: draft.city || undefined,
      state: draft.state || undefined,
    });
  }, [draft.address, draft.city, draft.latitude, draft.longitude, draft.state, navigation]);

  const endMinDate = draft.startDate || todayIso();
  const locationLabel = useMemo(() => {
    if (!draft.hasLocation || draft.latitude == null || draft.longitude == null) return null;
    const area = [draft.city, draft.state].filter(Boolean).join(', ');
    return area || `${draft.latitude.toFixed(4)}, ${draft.longitude.toFixed(4)}`;
  }, [draft]);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={styles.circleBtn}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          testID="add-event-back"
        >
          <Icon name="chevron-back" size={20} color="#000000" />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle} accessibilityRole="header">
            Add event
          </Text>
          <Text style={styles.headerSubtitle}>Reviewed before it goes live</Text>
        </View>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={12}
      >
        <ScrollView
          ref={scrollRef}
          style={styles.flex}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── Basic info ── */}
          <View style={styles.section} onLayout={onSectionLayout('basic')}>
            <Text style={styles.sectionTitle}>Basic information</Text>

            <Field label="Event name" required error={errors.title} counter={`${draft.title.length}/${EVENT_FORM_LIMITS.titleMax}`}>
              <TextInput
                value={draft.title}
                onChangeText={value => patch({ title: value })}
                placeholder="e.g. Diwali Mela at the Fort"
                placeholderTextColor="#6B6B6B"
                style={styles.input}
                maxLength={EVENT_FORM_LIMITS.titleMax}
                multiline={false}
                accessibilityLabel="Event name"
                testID="add-event-title"
              />
            </Field>

            <Field label="Event type" required error={errors.eventType}>
              <Pressable
                onPress={() => setTypeSheetOpen(true)}
                style={[styles.input, styles.selectRow]}
                accessibilityRole="button"
                accessibilityLabel="Choose event type"
                accessibilityHint="Opens a list of event types"
                testID="add-event-type"
              >
                <Icon
                  name={draft.eventType ? eventTypeIcon(draft.eventType) : 'pricetag-outline'}
                  size={17}
                  color={draft.eventType ? EVENT_COLORS.accent : EVENT_COLORS.textSecondary}
                />
                <Text style={[styles.selectText, !draft.eventType && styles.placeholder]}>
                  {draft.eventType ? eventTypeLabel(draft.eventType) : 'Select a type'}
                </Text>
                <Icon name="chevron-down" size={16} color={EVENT_COLORS.textSecondary} />
              </Pressable>
            </Field>
          </View>

          {/* ── Schedule ── */}
          <View style={styles.section} onLayout={onSectionLayout('schedule')}>
            <Text style={styles.sectionTitle}>Schedule</Text>

            <View style={styles.pairRow}>
              <View style={styles.pairItem}>
                <Field label="Start date" required error={errors.startDate}>
                  <Pressable
                    onPress={() => setDateTarget('startDate')}
                    style={[styles.input, styles.selectRow]}
                    accessibilityRole="button"
                    accessibilityLabel="Choose start date"
                    testID="add-event-start-date"
                  >
                    <Icon name="calendar-outline" size={17} color={EVENT_COLORS.textSecondary} />
                    <Text style={[styles.selectText, !draft.startDate && styles.placeholder]}>
                      {draft.startDate ? formatDisplayDate(draft.startDate) : 'DD MMM YYYY'}
                    </Text>
                  </Pressable>
                </Field>
              </View>
              <View style={styles.pairItem}>
                <Field label="End date" required error={errors.endDate}>
                  <Pressable
                    onPress={() => setDateTarget('endDate')}
                    style={[styles.input, styles.selectRow]}
                    accessibilityRole="button"
                    accessibilityLabel="Choose end date"
                    testID="add-event-end-date"
                  >
                    <Icon name="calendar-outline" size={17} color={EVENT_COLORS.textSecondary} />
                    <Text style={[styles.selectText, !draft.endDate && styles.placeholder]}>
                      {draft.endDate ? formatDisplayDate(draft.endDate) : 'DD MMM YYYY'}
                    </Text>
                  </Pressable>
                </Field>
              </View>
            </View>

            <View style={styles.pairRow}>
              <View style={styles.pairItem}>
                <Field label="Start time" required error={errors.startTime}>
                  <Pressable
                    onPress={() => setTimeTarget('startTime')}
                    style={[styles.input, styles.selectRow]}
                    accessibilityRole="button"
                    accessibilityLabel="Choose start time"
                    testID="add-event-start-time"
                  >
                    <Icon name="time-outline" size={17} color={EVENT_COLORS.textSecondary} />
                    <Text style={[styles.selectText, !draft.startTime && styles.placeholder]}>
                      {draft.startTime ? formatTime12(draft.startTime) : 'h:mm AM/PM'}
                    </Text>
                  </Pressable>
                </Field>
              </View>
              <View style={styles.pairItem}>
                <Field label="End time" required error={errors.endTime}>
                  <Pressable
                    onPress={() => setTimeTarget('endTime')}
                    style={[styles.input, styles.selectRow]}
                    accessibilityRole="button"
                    accessibilityLabel="Choose end time"
                    testID="add-event-end-time"
                  >
                    <Icon name="time-outline" size={17} color={EVENT_COLORS.textSecondary} />
                    <Text style={[styles.selectText, !draft.endTime && styles.placeholder]}>
                      {draft.endTime ? formatTime12(draft.endTime) : 'h:mm AM/PM'}
                    </Text>
                  </Pressable>
                </Field>
              </View>
            </View>
          </View>

          {/* ── Location ── */}
          <View style={styles.section} onLayout={onSectionLayout('location')}>
            <Text style={styles.sectionTitle}>Location</Text>

            <Pressable
              onPress={openLocationPicker}
              style={[styles.mapPicker, errors.location && styles.mapPickerError]}
              accessibilityRole="button"
              accessibilityLabel={locationLabel ? `Event location: ${locationLabel}` : 'Pick event location on the map'}
              accessibilityHint="Opens the map so you can place the event pin"
              testID="add-event-location"
            >
              <Icon
                name={locationLabel ? 'checkmark-circle' : 'map-outline'}
                size={20}
                color={locationLabel ? EVENT_COLORS.live : EVENT_COLORS.accent}
              />
              <View style={styles.flex}>
                <Text style={styles.mapPickerTitle}>
                  {locationLabel ? 'Location set' : 'Select location on map'}
                </Text>
                <Text style={styles.mapPickerSub} numberOfLines={2}>
                  {locationLabel ||
                    (draft.address ? draft.address : 'Required — tap to drop the pin')}
                </Text>
              </View>
              <Icon name="chevron-forward" size={16} color={EVENT_COLORS.textSecondary} />
            </Pressable>
            {errors.location ? <Text style={styles.errorText}>{errors.location}</Text> : null}

            <Field label="Address" error={errors.address}>
              <TextInput
                value={draft.address}
                onChangeText={value => patch({ address: value })}
                placeholder="Street, landmark, area"
                placeholderTextColor="#6B6B6B"
                style={[styles.input, styles.inputMulti]}
                multiline
                maxLength={EVENT_FORM_LIMITS.addressMax}
                accessibilityLabel="Address"
              />
            </Field>

            <View style={styles.pairRow}>
              <View style={styles.pairItem}>
                <Field label="City" error={errors.city}>
                  <TextInput
                    value={draft.city}
                    onChangeText={value => patch({ city: value })}
                    placeholder="City"
                    placeholderTextColor="#6B6B6B"
                    style={styles.input}
                    maxLength={EVENT_FORM_LIMITS.cityMax}
                    accessibilityLabel="City"
                  />
                </Field>
              </View>
              <View style={styles.pairItem}>
                <Field label="State" error={errors.state}>
                  <TextInput
                    value={draft.state}
                    onChangeText={value => patch({ state: value })}
                    placeholder="State"
                    placeholderTextColor="#6B6B6B"
                    style={styles.input}
                    maxLength={EVENT_FORM_LIMITS.stateMax}
                    accessibilityLabel="State"
                  />
                </Field>
              </View>
            </View>
          </View>

          {/* ── Details ── */}
          <View style={styles.section} onLayout={onSectionLayout('details')}>
            <Text style={styles.sectionTitle}>Details</Text>

            <Field
              label="Short description"
              error={errors.shortDescription}
              counter={`${draft.shortDescription.length}/${EVENT_FORM_LIMITS.shortDescriptionMax}`}
              hint="One line shown on cards and in search."
            >
              <TextInput
                value={draft.shortDescription}
                onChangeText={value => patch({ shortDescription: value })}
                placeholder="What makes this event worth showing up for?"
                placeholderTextColor="#6B6B6B"
                style={styles.input}
                maxLength={EVENT_FORM_LIMITS.shortDescriptionMax}
                accessibilityLabel="Short description"
                testID="add-event-short-description"
              />
            </Field>

            <Field
              label="Full details"
              error={errors.description}
              counter={`${draft.description.length}/${EVENT_FORM_LIMITS.descriptionMax}`}
            >
              <TextInput
                value={draft.description}
                onChangeText={value => patch({ description: value })}
                placeholder="Schedule, entry rules, how to reach, what to bring…"
                placeholderTextColor="#6B6B6B"
                style={[styles.input, styles.inputTall]}
                multiline
                maxLength={EVENT_FORM_LIMITS.descriptionMax}
                textAlignVertical="top"
                accessibilityLabel="Full event details"
                testID="add-event-description"
              />
            </Field>
          </View>

          {/* ── Media ── */}
          <View style={styles.section} onLayout={onSectionLayout('media')}>
            <Text style={styles.sectionTitle}>Photos</Text>

            <Field label="Cover photo" error={errors.coverImage} hint="Shown at the top of the event page.">
              <Pressable
                onPress={pickCover}
                style={styles.coverBox}
                accessibilityRole="button"
                accessibilityLabel={draft.coverImageUri ? 'Change cover photo' : 'Add cover photo'}
                testID="add-event-cover"
              >
                {draft.coverImageUri ? (
                  <>
                    <Image source={{ uri: draft.coverImageUri }} style={styles.coverImage} resizeMode="cover" />
                    <View style={styles.coverBadge}>
                      <Icon name="camera" size={14} color="#FFFFFF" />
                      <Text style={styles.coverBadgeText}>Change</Text>
                    </View>
                  </>
                ) : (
                  <View style={styles.coverEmpty}>
                    <Icon name="image-outline" size={26} color={EVENT_COLORS.accent} />
                    <Text style={styles.coverEmptyText}>Add cover photo</Text>
                  </View>
                )}
              </Pressable>
            </Field>

            <Field
              label="More photos"
              error={errors.images}
              counter={`${draft.imageUris.length}/${EVENT_FORM_LIMITS.imagesMax}`}
            >
              <View style={styles.galleryRow}>
                {draft.imageUris.map((uri, index) => (
                  <View key={`${uri}-${index}`} style={styles.thumbWrap}>
                    <Image source={{ uri }} style={styles.thumb} resizeMode="cover" />
                    <Pressable
                      onPress={() =>
                        patch({ imageUris: draft.imageUris.filter((_, i) => i !== index) })
                      }
                      style={styles.thumbRemove}
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove photo ${index + 1}`}
                    >
                      <Icon name="close" size={13} color="#FFFFFF" />
                    </Pressable>
                  </View>
                ))}
                {draft.imageUris.length < EVENT_FORM_LIMITS.imagesMax ? (
                  <Pressable
                    onPress={pickGalleryImage}
                    style={styles.addThumb}
                    accessibilityRole="button"
                    accessibilityLabel="Add photo"
                    testID="add-event-add-photo"
                  >
                    <Icon name="add" size={22} color={EVENT_COLORS.accent} />
                  </Pressable>
                ) : null}
              </View>
            </Field>
          </View>

          {/* ── Organiser ── */}
          <View style={styles.section} onLayout={onSectionLayout('organizer')}>
            <Text style={styles.sectionTitle}>Organiser</Text>

            <Field label="Organiser name" error={errors.organizerName} counter={`${draft.organizerName.length}/${EVENT_FORM_LIMITS.organizerNameMax}`}>
              <TextInput
                value={draft.organizerName}
                onChangeText={value => patch({ organizerName: value })}
                placeholder="Committee, temple trust, venue…"
                placeholderTextColor="#6B6B6B"
                style={styles.input}
                maxLength={EVENT_FORM_LIMITS.organizerNameMax}
                accessibilityLabel="Organiser name"
              />
            </Field>

            <Field label="Contact" error={errors.organizerContact} hint="Phone number or email attendees can reach.">
              <TextInput
                value={draft.organizerContact}
                onChangeText={value => patch({ organizerContact: value })}
                placeholder="+91 98765 43210"
                placeholderTextColor="#6B6B6B"
                style={styles.input}
                maxLength={EVENT_FORM_LIMITS.organizerContactMax}
                keyboardType="default"
                accessibilityLabel="Organiser contact"
              />
            </Field>

            <Field label="Website" error={errors.websiteUrl}>
              <TextInput
                value={draft.websiteUrl}
                onChangeText={value => patch({ websiteUrl: value })}
                placeholder="https://example.com"
                placeholderTextColor="#6B6B6B"
                style={styles.input}
                autoCapitalize="none"
                keyboardType="url"
                maxLength={EVENT_FORM_LIMITS.websiteUrlMax}
                accessibilityLabel="Event website"
              />
            </Field>

            <Field label="Entry fee" error={errors.entryFee} hint="Leave blank if entry is free.">
              <View style={styles.feeRow}>
                <Text style={styles.rupee}>₹</Text>
                <TextInput
                  value={draft.entryFee}
                  onChangeText={value => patch({ entryFee: value.replace(/[^0-9]/g, '') })}
                  placeholder="0"
                  placeholderTextColor="#6B6B6B"
                  style={[styles.input, styles.feeInput]}
                  keyboardType="number-pad"
                  accessibilityLabel="Entry fee in rupees"
                  testID="add-event-entry-fee"
                />
              </View>
            </Field>

            <Field label="Related place" error={errors.linkedPlaceId} hint="Optional — link a place this event happens at.">
              <Pressable
                onPress={() => setPlaceSheetOpen(true)}
                style={[styles.input, styles.selectRow]}
                accessibilityRole="button"
                accessibilityLabel="Link a related place"
                testID="add-event-linked-place"
              >
                <Icon name="location" size={17} color={EVENT_COLORS.accent} />
                <Text style={[styles.selectText, !draft.linkedPlaceName && styles.placeholder]} numberOfLines={1}>
                  {draft.linkedPlaceName || 'Search places'}
                </Text>
                <Icon name="chevron-forward" size={16} color={EVENT_COLORS.textSecondary} />
              </Pressable>
            </Field>
          </View>

          <View style={styles.reviewNote}>
            <Icon name="shield-checkmark-outline" size={16} color={EVENT_COLORS.textSecondary} />
            <Text style={styles.reviewNoteText}>
              Your event stays hidden until an admin approves it. You will see the status under
              My events.
            </Text>
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <Pressable
            onPress={() => void handleSubmit()}
            disabled={submitting}
            style={[styles.submitBtn, (submitting || uploading) && styles.submitBtnDisabled]}
            accessibilityRole="button"
            accessibilityLabel="Submit event for review"
            accessibilityState={{ disabled: submitting }}
            testID="add-event-submit"
          >
            <Text style={styles.submitText}>
              {submitting ? (uploading ? 'Uploading photos…' : 'Submitting…') : 'Submit for review'}
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      <EventDateModal
        visible={dateTarget !== null}
        title={dateTarget === 'endDate' ? 'End date' : 'Start date'}
        value={
          dateTarget === 'endDate'
            ? draft.endDate || endMinDate
            : draft.startDate || todayIso()
        }
        minDate={dateTarget === 'endDate' ? endMinDate : todayIso()}
        onSelect={iso => {
          if (dateTarget === 'endDate') {
            if (draft.startDate && !isDateOnOrAfter(iso, draft.startDate)) {
              setErrors(prev => ({
                ...prev,
                endDate: 'End date cannot be before the start date.',
              }));
              return;
            }
            patch({ endDate: iso });
          } else {
            // Moving the start past a stored end would break the invariant.
            const endDate =
              draft.endDate && !isDateOnOrAfter(draft.endDate, iso) ? '' : draft.endDate;
            patch({ startDate: iso, endDate });
          }
          setDateTarget(null);
        }}
        onClose={() => setDateTarget(null)}
      />

      <EventTimeModal
        visible={timeTarget !== null}
        title={timeTarget === 'endTime' ? 'End time' : 'Start time'}
        value={timeTarget === 'endTime' ? draft.endTime || '18:00' : draft.startTime || '09:00'}
        onSelect={hhmm => {
          if (timeTarget === 'endTime') {
            if (draft.startTime && hhmm <= draft.startTime) {
              setErrors(prev => ({
                ...prev,
                endTime: 'End time must be after the start time.',
              }));
              return;
            }
            patch({ endTime: hhmm });
          } else {
            patch({ startTime: hhmm });
          }
        }}
        onClose={() => setTimeTarget(null)}
      />

      <EventOptionSheet
        visible={typeSheetOpen}
        title="Event type"
        options={TYPE_OPTIONS}
        selected={draft.eventType}
        onSelect={value => patch({ eventType: value as EventType })}
        onClose={() => setTypeSheetOpen(false)}
      />

      <RelatedPlaceSheet
        visible={placeSheetOpen}
        selectedId={draft.linkedPlaceId}
        selectedName={draft.linkedPlaceName}
        onSelect={place =>
          patch({ linkedPlaceId: place?.id ?? null, linkedPlaceName: place?.name ?? null })
        }
        onClose={() => setPlaceSheetOpen(false)}
      />
    </SafeAreaView>
  );
}

// ── Field wrapper ───────────────────────────────────────────────────────────

function Field({
  label,
  required,
  error,
  hint,
  counter,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  counter?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.field}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>
          {label}
          {required ? <Text style={styles.requiredMark}> *</Text> : null}
        </Text>
        {counter ? <Text style={styles.counter}>{counter}</Text> : null}
      </View>
      {children}
      {error ? (
        <Text style={styles.errorText} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : hint ? (
        <Text style={styles.hintText}>{hint}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  root: { flex: 1, backgroundColor: '#F7F6F1' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: EVENT_COLORS.border,
  },
  circleBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: EVENT_COLORS.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: { flex: 1 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: EVENT_COLORS.text },
  headerSubtitle: { fontSize: 12, color: EVENT_COLORS.textSecondary, marginTop: 1 },
  content: { padding: 18, paddingBottom: 32 },
  section: {
    backgroundColor: EVENT_COLORS.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: EVENT_COLORS.border,
    padding: 16,
    marginBottom: 14,
    gap: 12,
  },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: EVENT_COLORS.text },
  field: { gap: 6 },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { fontSize: 13, fontWeight: '700', color: EVENT_COLORS.textBody },
  requiredMark: { color: EVENT_COLORS.accent },
  counter: { fontSize: 11.5, color: EVENT_COLORS.textSecondary, fontVariant: ['tabular-nums'] },
  input: {
    minHeight: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: EVENT_COLORS.border,
    backgroundColor: '#F7F6F1',
    paddingHorizontal: 13,
    paddingVertical: 12,
    fontSize: 14.5,
    color: EVENT_COLORS.text,
  },
  inputMulti: { minHeight: 76 },
  inputTall: { minHeight: 132, paddingTop: 12 },
  selectRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  selectText: { flex: 1, fontSize: 14.5, color: EVENT_COLORS.text, fontWeight: '600' },
  placeholder: { color: '#6B6B6B', fontWeight: '500' },
  pairRow: { flexDirection: 'row', gap: 10 },
  pairItem: { flex: 1 },
  mapPicker: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: EVENT_COLORS.accentBorder,
    backgroundColor: EVENT_COLORS.accentSoft,
  },
  mapPickerError: { borderColor: '#C94A4A', backgroundColor: '#FBEAEA' },
  mapPickerTitle: { fontSize: 14, fontWeight: '700', color: EVENT_COLORS.accent },
  mapPickerSub: { fontSize: 12.5, color: EVENT_COLORS.textSecondary, marginTop: 2 },
  feeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: EVENT_COLORS.border,
    backgroundColor: '#F7F6F1',
    paddingHorizontal: 13,
  },
  rupee: { fontSize: 15, fontWeight: '700', color: EVENT_COLORS.textSecondary },
  feeInput: { flex: 1, borderWidth: 0, backgroundColor: 'transparent', paddingHorizontal: 0 },
  coverBox: {
    height: 156,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#F7F6F1',
    borderWidth: 1,
    borderColor: EVENT_COLORS.border,
  },
  coverImage: { width: '100%', height: '100%' },
  coverBadge: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(0, 0, 0,0.72)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  coverBadgeText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  coverEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6 },
  coverEmptyText: { fontSize: 13, fontWeight: '700', color: EVENT_COLORS.accent },
  galleryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  thumbWrap: { position: 'relative' },
  thumb: { width: 74, height: 74, borderRadius: 14, backgroundColor: '#F7F6F1' },
  thumbRemove: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addThumb: {
    width: 74,
    height: 74,
    borderRadius: 14,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: EVENT_COLORS.accentBorder,
    backgroundColor: EVENT_COLORS.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: { fontSize: 12, color: '#C94A4A', fontWeight: '600' },
  hintText: { fontSize: 12, color: EVENT_COLORS.textSecondary },
  reviewNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  reviewNoteText: { flex: 1, fontSize: 12.5, color: EVENT_COLORS.textSecondary, lineHeight: 18 },
  footer: {
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 14,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: EVENT_COLORS.border,
  },
  submitBtn: {
    height: 50,
    borderRadius: 16,
    backgroundColor: EVENT_COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitText: { color: '#FFFFFF', fontSize: 15.5, fontWeight: '800' },
});
