import React from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, Image,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import type { TripPlan, TripPlanDay, TripPlanStop } from '../../../services/api/trips';
import { SERIF, SANS, SANS_SEMI, SANS_BOLD } from '../theme';

const C = {
  bg: '#FAF8F4',
  card: '#FFFFFF',
  accent: '#3E2005',
  accentLight: '#F5E9D6',
  accentBorder: '#E8D5B7',
  gold: '#A87B3C',
  text: '#1C1108',
  textSub: '#7A6A55',
  textMuted: '#B0A090',
  pill: '#3E2005',
  pillText: '#FFFFFF',
  tabActive: '#3E2005',
  tabActiveTxt: '#FFFFFF',
  tabInactive: '#F0EAE0',
  tabInactiveTxt: '#7A6A55',
  starFill: '#F5A623',
  lunchBg: '#FDF4E3',
  summaryBg: '#F5EFE3',
  timeline: '#E2D4BC',
};

function dayKm(stops: TripPlanStop[]): number {
  let km = 0;
  stops.forEach(s => { if (s.distanceFromPrev) km += s.distanceFromPrev / 1000; });
  return Math.round(km);
}


function Stars({ rating }: { rating: number }) {
  return (
    <View style={s.starRow}>
      <Icon name="star" size={11} color={C.starFill} />
      <Text style={s.starText}>{rating.toFixed(1)}</Text>
    </View>
  );
}

function StopCard({ stop, index, total, dayStops }: {
  stop: TripPlanStop; index: number; total: number; dayStops: TripPlanStop[];
}) {
  const [expanded, setExpanded] = React.useState(false);
  const place = stop.place as any;
  const name = place?.name ?? 'Place';
  const rating = place?.rating ?? 4.0;
  const thumb = place?.thumbnail ?? place?.images?.[0];
  const distKm = stop.distanceFromPrev ? Math.round(stop.distanceFromPrev / 1000) : null;
  const prevName = index > 0 ? (dayStops[index - 1].place?.name ?? null) : null;
  const dur = stop.duration ?? place?.estimatedDurationMinutes ?? 60;
  const durH = Math.round((dur / 60) * 10) / 10;
  const durLabel = dur >= 90 ? `${durH}–${Math.ceil(durH + 0.5)} hrs` : `${durH}–${Math.ceil(durH)} hrs`;

  return (
    <View style={s.stopRow}>
      <View style={s.stopTimeline}>
        <View style={s.stopNumber}><Text style={s.stopNumberText}>{index + 1}</Text></View>
        {index < total - 1 && <View style={s.stopLine} />}
      </View>
      <TouchableOpacity style={s.stopCard} activeOpacity={0.85} onPress={() => setExpanded(e => !e)}>
        {thumb ? (
          <Image source={{ uri: thumb }} style={s.stopImage} />
        ) : (
          <View style={[s.stopImage, s.stopImagePlaceholder]}>
            <Icon name="image-outline" size={22} color={C.textMuted} />
          </View>
        )}
        <View style={s.stopInfo}>
          <View style={s.stopTopRow}>
            <Text style={s.stopName} numberOfLines={1}>{name}</Text>
            <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={C.textMuted} />
          </View>
          <Stars rating={rating} />
          {distKm && prevName ? (
            <View style={s.stopMetaRow}>
              <Icon name="location-outline" size={11} color={C.textMuted} />
              <Text style={s.stopMetaText}>~{distKm} km from {prevName}</Text>
            </View>
          ) : index === 0 ? (
            <View style={s.stopMetaRow}>
              <Icon name="location-outline" size={11} color={C.textMuted} />
              <Text style={s.stopMetaText}>Starting point</Text>
            </View>
          ) : null}
          <View style={s.stopMetaRow}>
            <Icon name="time-outline" size={11} color={C.textMuted} />
            <Text style={s.stopMetaText}>{durLabel}</Text>
          </View>
        </View>
      </TouchableOpacity>
    </View>
  );
}

function LunchBreak() {
  return (
    <View style={s.lunchRow}>
      <View style={s.stopTimeline}>
        <View style={s.lunchIcon}><Icon name="restaurant" size={12} color={C.gold} /></View>
        <View style={s.stopLine} />
      </View>
      <View style={s.lunchCard}>
        <Text style={s.lunchLabel}>Lunch Break</Text>
        <Text style={s.lunchDuration}>45–60 mins</Text>
      </View>
    </View>
  );
}

function DaySummary({ day, stops }: { day: TripPlanDay; stops: TripPlanStop[] }) {
  const km = dayKm(stops);
  return (
    <View style={s.daySummary}>
      <View style={s.daySummaryLeft}><Icon name="map-outline" size={22} color={C.gold} /></View>
      <View style={s.daySummaryMid}>
        <Text style={s.daySummaryTitle}>Day {day.dayNumber} Summary</Text>
        <Text style={s.daySummaryMeta}>{stops.length} Places · ~{km} km</Text>
        <Text style={s.daySummaryDesc}>{day.theme ? (day.theme.startsWith(`Day ${day.dayNumber}`) ? day.theme.replace(new RegExp(`^Day ${day.dayNumber}\\s*[·\\-]\\s*`), '') : day.theme) : 'A perfect mix of nature, history & local culture.'}</Text>
      </View>
      <TouchableOpacity style={s.daySummaryMap}>
        <Icon name="map" size={12} color={C.gold} />
        <Text style={s.daySummaryMapText}>View on Map</Text>
      </TouchableOpacity>
    </View>
  );
}

function DaySection({ day, isActive, onEdit }: { day: TripPlanDay; isActive: boolean; onEdit?: () => void }) {
  const stops = (day.stops ?? []) as TripPlanStop[];
  if (!isActive) return null;
  const lunchAfter = stops.length >= 4 ? 2 : -1;
  const elements: Array<{ type: 'stop'; stop: TripPlanStop; idx: number } | { type: 'lunch' }> = [];
  stops.forEach((stop, i) => {
    elements.push({ type: 'stop', stop, idx: i });
    if (i === lunchAfter) elements.push({ type: 'lunch' });
  });
  return (
    <View style={s.daySection}>
      <View style={s.dayHeader}>
        <View style={s.dayHeaderLeft}>
          <Icon name="sunny-outline" size={16} color={C.gold} />
          <Text style={s.dayHeaderTitle}>
            {day.theme ? (day.theme.startsWith(`Day ${day.dayNumber}`) ? day.theme.replace(new RegExp(`^Day ${day.dayNumber}\\s*[·\\-]\\s*`), '') : day.theme) : `Explore Day ${day.dayNumber}`}
          </Text>
        </View>
        <View style={s.dayHeaderRight}>
          <Text style={s.dayHeaderMeta}>{stops.length} Places · ~{dayKm(stops)} km</Text>
          {onEdit && (
            <TouchableOpacity style={s.editBtn} onPress={onEdit}>
              <Icon name="pencil-outline" size={12} color={C.accent} />
              <Text style={s.editBtnText}>Edit</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
      {elements.map((el, i) =>
        el.type === 'lunch' ? (
          <LunchBreak key={`lunch-${i}`} />
        ) : (
          <StopCard key={el.stop.id ?? i} stop={el.stop} index={el.idx} total={stops.length} dayStops={stops} />
        )
      )}
      <DaySummary day={day} stops={stops} />
    </View>
  );
}

function MetaChip({ icon, label, sub }: { icon: string; label: string; sub?: string }) {
  return (
    <View style={s.metaChip}>
      <Icon name={icon} size={14} color={C.gold} />
      <View>
        <Text style={s.metaChipLabel}>{label}</Text>
        {sub ? <Text style={s.metaChipSub}>{sub}</Text> : null}
      </View>
    </View>
  );
}

type Props = { trip: TripPlan; onEditDay?: (day: TripPlanDay) => void };

export function PreviewItinerarySummary({ trip, onEditDay }: Props) {
  const days = (trip.tripDays ?? []) as TripPlanDay[];
  const [activeDay, setActiveDay] = React.useState(0);
  const totalPlaces = days.reduce((n, d) => n + (d.stops?.length ?? 0), 0);
  const totalKm = days.reduce((n, d) => n + dayKm((d.stops ?? []) as TripPlanStop[]), 0);

  return (
    <ScrollView style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
      <View style={s.heroSection}>
        <View style={s.aiBadge}>
          <Icon name="sparkles" size={11} color={C.gold} />
          <Text style={s.aiBadgeText}>AI Generated</Text>
        </View>
        <Text style={s.heroTitle}>{trip.destination ? `${trip.destination} Trip ✨` : 'Your Trip ✨'}</Text>
        <Text style={s.heroSub}>{days.length} {days.length === 1 ? 'Day' : 'Days'} · {totalPlaces} Places</Text>
      </View>

      <View style={s.metaRow}>
        {trip.pace && <MetaChip icon="timer-outline" label={trip.pace.charAt(0).toUpperCase() + trip.pace.slice(1) + ' Pace'} sub="Not too rushed" />}
        {totalKm > 0 && <MetaChip icon="car-outline" label={`~${totalKm} km`} sub="Total travel" />}
        <MetaChip icon="star-outline" label="Curated for you" sub="Best picks" />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tabScroll} contentContainerStyle={s.tabRow}>
        {days.map((day, i) => {
          const isActive = i === activeDay;
          return (
            <TouchableOpacity key={day.id ?? i} style={[s.tab, isActive && s.tabActive]} onPress={() => setActiveDay(i)} activeOpacity={0.85}>
              <Text style={[s.tabTitle, isActive && s.tabTitleActive]}>Day {day.dayNumber}</Text>
              <Text style={[s.tabSub, isActive && s.tabSubActive]}>{day.stops?.length ?? 0} Places</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {days.map((day, i) => (
        <DaySection key={day.id ?? i} day={day} isActive={i === activeDay} onEdit={onEditDay ? () => onEditDay(day) : undefined} />
      ))}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: C.bg },
  content: { paddingBottom: 32 },
  heroSection: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8 },
  aiBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: C.pill, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5, alignSelf: 'flex-start', marginBottom: 10 },
  aiBadgeText: { fontFamily: SANS_BOLD, fontSize: 11, color: C.pillText },
  heroTitle: { fontFamily: SERIF, fontSize: 28, color: C.text, letterSpacing: -0.5, marginBottom: 4 },
  heroSub: { fontFamily: SANS, fontSize: 13, color: C.textSub },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingHorizontal: 20, paddingVertical: 12, backgroundColor: C.card, borderTopWidth: 1, borderBottomWidth: 1, borderColor: C.accentBorder, marginBottom: 16 },
  metaChip: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaChipLabel: { fontFamily: SANS_SEMI, fontSize: 11, color: C.text },
  metaChipSub: { fontFamily: SANS, fontSize: 10, color: C.textSub },
  tabScroll: { marginHorizontal: 20, marginBottom: 16 },
  tabRow: { gap: 10, paddingBottom: 2 },
  tab: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 14, backgroundColor: C.tabInactive, alignItems: 'center', minWidth: 80 },
  tabActive: { backgroundColor: C.tabActive },
  tabTitle: { fontFamily: SANS_BOLD, fontSize: 14, color: C.tabInactiveTxt },
  tabTitleActive: { color: C.tabActiveTxt },
  tabSub: { fontFamily: SANS, fontSize: 11, color: C.textMuted },
  tabSubActive: { color: 'rgba(255,255,255,0.7)' },
  daySection: { paddingHorizontal: 20 },
  dayHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 },
  dayHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  dayHeaderTitle: { fontFamily: SANS_BOLD, fontSize: 14, color: C.text, flex: 1 },
  dayHeaderRight: { alignItems: 'flex-end', gap: 4 },
  dayHeaderMeta: { fontFamily: SANS, fontSize: 11, color: C.textSub },
  editBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: C.accentBorder, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: C.card },
  editBtnText: { fontFamily: SANS_SEMI, fontSize: 11, color: C.accent },
  stopRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6 },
  stopTimeline: { alignItems: 'center', width: 28, marginTop: 4, marginRight: 4 },
  stopNumber: { width: 22, height: 22, borderRadius: 11, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  stopNumberText: { fontFamily: SANS_BOLD, fontSize: 10, color: '#FFF' },
  stopLine: { width: 2, flex: 1, minHeight: 20, backgroundColor: C.timeline, marginTop: 3 },
  stopCard: { flex: 1, flexDirection: 'row', backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.accentBorder, overflow: 'hidden', marginBottom: 4 },
  stopImage: { width: 90, height: 90 },
  stopImagePlaceholder: { backgroundColor: C.accentLight, alignItems: 'center', justifyContent: 'center' },
  stopInfo: { flex: 1, padding: 10 },
  stopTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 },
  stopName: { fontFamily: SANS_BOLD, fontSize: 13, color: C.text, flex: 1, marginRight: 6 },
  starRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 5 },
  starText: { fontFamily: SANS_SEMI, fontSize: 11, color: C.gold },
  stopMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 2 },
  stopMetaText: { fontFamily: SANS, fontSize: 10, color: C.textSub },
  lunchRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6 },
  lunchIcon: { width: 22, height: 22, borderRadius: 11, backgroundColor: C.lunchBg, borderWidth: 1, borderColor: C.accentBorder, alignItems: 'center', justifyContent: 'center' },
  lunchCard: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.lunchBg, borderRadius: 10, borderWidth: 1, borderColor: C.accentBorder, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 4 },
  lunchLabel: { fontFamily: SANS_SEMI, fontSize: 12, color: C.text },
  lunchDuration: { fontFamily: SANS, fontSize: 11, color: C.textMuted },
  daySummary: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.summaryBg, borderRadius: 16, borderWidth: 1, borderColor: C.accentBorder, padding: 14, gap: 10, marginTop: 12, marginBottom: 24 },
  daySummaryLeft: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.accentLight, alignItems: 'center', justifyContent: 'center' },
  daySummaryMid: { flex: 1 },
  daySummaryTitle: { fontFamily: SANS_BOLD, fontSize: 13, color: C.text, marginBottom: 2 },
  daySummaryMeta: { fontFamily: SANS, fontSize: 11, color: C.textSub, marginBottom: 2 },
  daySummaryDesc: { fontFamily: SANS, fontSize: 10, color: C.textSub },
  daySummaryMap: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: C.accentBorder, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 6, backgroundColor: C.card },
  daySummaryMapText: { fontFamily: SANS_SEMI, fontSize: 10, color: C.gold },
});
