import { View, Text, ScrollView, TextInput, TouchableOpacity, Alert } from 'react-native';
import { useState } from 'react';
import Pal from '../design/DesignSystem';
import { GradientButton } from '../components/ui/GradientButton';
import { tripsApi } from '../services/api/trips';
import { useHeaderSafePadding } from '../design/responsive';
import { getMainTabBarClearance } from '../design/tabBarLayout';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const travelers = ['SOLO', 'COUPLE', 'FAMILY', 'FRIENDS'] as const;
const transportModes = ['WALKING', 'BIKE', 'CAR', 'TRAIN', 'FLIGHT'] as const;
const budgets = ['LOW', 'MEDIUM', 'LUXURY'] as const;
const accommodations = ['HOTEL', 'HOSTEL', 'RESORT', 'HOMESTAY'] as const;
const interests = ['Nature', 'Heritage', 'Adventure', 'Food', 'Religious'] as const;

const travelerEmojis: Record<string, string> = { SOLO: '🧑', COUPLE: '💑', FAMILY: '👨‍👩‍👧‍👦', FRIENDS: '👥' };
const transportEmojis: Record<string, string> = { WALKING: '🚶', BIKE: '🚲', CAR: '🚗', TRAIN: '🚆', FLIGHT: '✈️' };
const budgetEmojis: Record<string, string> = { LOW: '💵', MEDIUM: '💰', LUXURY: '💎' };
const accomEmojis: Record<string, string> = { HOTEL: '🏨', HOSTEL: '🏠', RESORT: '🌴', HOMESTAY: '🏡' };
const interestEmojis: Record<string, string> = {
  Nature: '🌿', Heritage: '🏛️', Adventure: '🧗', Food: '🍜',
  Religious: '🛕',
};

interface OptionChipProps {
  label: string;
  emoji: string;
  selected: boolean;
  onPress: () => void;
}

function OptionChip({ label, emoji, selected, onPress }: OptionChipProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 6,
        paddingHorizontal: 16, paddingVertical: 10,
        borderRadius: Pal.borderRadius.full,
        backgroundColor: selected ? Pal.colors.light.primary : Pal.colors.light.surface,
        borderWidth: 1,
        borderColor: selected ? Pal.colors.light.primary : Pal.colors.light.border,
      }}
    >
      <Text style={{ fontSize: 14 }}>{emoji}</Text>
      <Text style={{
        fontSize: 12, fontFamily: Pal.typography.fontFamily.semibold,
        color: selected ? '#fff' : Pal.colors.light.text,
      }}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export default function CreateTripScreen({ onNavigate }: { onNavigate?: (screen: string, params?: any) => void }) {
  const headerPadTop = useHeaderSafePadding(12);
  const insets = useSafeAreaInsets();
  const [title, setTitle] = useState('');
  const [destination, setDestination] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedTravelers, setSelectedTravelers] = useState<string>('SOLO');
  const [selectedTransport, setSelectedTransport] = useState<string[]>([]);
  const [selectedBudget, setSelectedBudget] = useState<string>('MEDIUM');
  const [selectedAccommodation, setSelectedAccommodation] = useState<string>('');
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  const toggleTransport = (mode: string) => {
    setSelectedTransport(prev =>
      prev.includes(mode) ? prev.filter(m => m !== mode) : [...prev, mode]
    );
  };

  const toggleInterest = (interest: string) => {
    setSelectedInterests(prev =>
      prev.includes(interest) ? prev.filter(i => i !== interest) : [...prev, interest]
    );
  };

  const handleCreate = async () => {
    if (!title.trim()) { Alert.alert('Required', 'Please enter a trip name'); return; }
    if (!destination.trim()) { Alert.alert('Required', 'Please enter a destination'); return; }

    setCreating(true);
    try {
      const tripData = await tripsApi.create({
        title: title.trim(),
        destination: destination.trim(),
        startDate: startDate || new Date().toISOString().split('T')[0],
        endDate: endDate || new Date(Date.now() + 2 * 86400000).toISOString().split('T')[0],
        travelers: selectedTravelers as any,
        transportation: selectedTransport,
        budget: selectedBudget as any,
        accommodation: selectedAccommodation as any || undefined,
        interests: selectedInterests,
      });
      onNavigate?.('TripDetail', { tripId: tripData.id });
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to create trip');
    }
    setCreating(false);
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: Pal.colors.light.background }} showsVerticalScrollIndicator={false}>
      <View style={{ padding: Pal.spacing[5], paddingTop: headerPadTop, gap: Pal.spacing[6] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <TouchableOpacity onPress={() => onNavigate?.('goBack')} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: Pal.colors.light.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Pal.colors.light.border }}>
            <Text style={{ fontSize: 18 }}>←</Text>
          </TouchableOpacity>
          <Text style={{
            fontFamily: Pal.typography.fontFamily.bold, fontSize: Pal.typography.fontSize['2xl'],
            color: Pal.colors.light.text, letterSpacing: -0.5, flex: 1,
          }}>
            Create Trip
          </Text>
        </View>

        <Section title="Trip Details">
          <InputField
            placeholder="Trip name"
            value={title}
            onChangeText={setTitle}
            emoji="✈️"
          />
          <InputField
            placeholder="Destination"
            value={destination}
            onChangeText={setDestination}
            emoji="📍"
          />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <InputField
                placeholder="Start date"
                value={startDate}
                onChangeText={setStartDate}
                emoji="📅"
                hint="YYYY-MM-DD"
              />
            </View>
            <View style={{ flex: 1 }}>
              <InputField
                placeholder="End date"
                value={endDate}
                onChangeText={setEndDate}
                emoji="📅"
                hint="YYYY-MM-DD"
              />
            </View>
          </View>
        </Section>

        <Section title="Travelers">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {travelers.map(t => (
              <OptionChip
                key={t}
                label={t.charAt(0) + t.slice(1).toLowerCase()}
                emoji={travelerEmojis[t]}
                selected={selectedTravelers === t}
                onPress={() => setSelectedTravelers(t)}
              />
            ))}
          </View>
        </Section>

        <Section title="Transportation">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {transportModes.map(m => (
              <OptionChip
                key={m}
                label={m.charAt(0) + m.slice(1).toLowerCase()}
                emoji={transportEmojis[m]}
                selected={selectedTransport.includes(m)}
                onPress={() => toggleTransport(m)}
              />
            ))}
          </View>
        </Section>

        <Section title="Budget">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {budgets.map(b => (
              <OptionChip
                key={b}
                label={b.charAt(0) + b.slice(1).toLowerCase()}
                emoji={budgetEmojis[b]}
                selected={selectedBudget === b}
                onPress={() => setSelectedBudget(b)}
              />
            ))}
          </View>
        </Section>

        <Section title="Accommodation">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {accommodations.map(a => (
              <OptionChip
                key={a}
                label={a.charAt(0) + a.slice(1).toLowerCase()}
                emoji={accomEmojis[a]}
                selected={selectedAccommodation === a}
                onPress={() => setSelectedAccommodation(selectedAccommodation === a ? '' : a)}
              />
            ))}
          </View>
        </Section>

        <Section title="Travel Interests">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {interests.map(i => (
              <OptionChip
                key={i}
                label={i}
                emoji={interestEmojis[i]}
                selected={selectedInterests.includes(i)}
                onPress={() => toggleInterest(i)}
              />
            ))}
          </View>
        </Section>

        <GradientButton
          title={creating ? 'Creating...' : '✨ Create Itinerary'}
          onPress={handleCreate}
          disabled={creating}
          size="lg"
          fullWidth
        />

        <View style={{ paddingBottom: getMainTabBarClearance(insets.bottom) }} />
      </View>
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 10 }}>
      <Text style={{
        fontFamily: Pal.typography.fontFamily.semibold,
        fontSize: 15, color: Pal.colors.light.text, letterSpacing: -0.3,
      }}>
        {title}
      </Text>
      {children}
    </View>
  );
}

function InputField({ placeholder, value, onChangeText, emoji, hint }: {
  placeholder: string;
  value: string;
  onChangeText: (t: string) => void;
  emoji: string;
  hint?: string;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: Pal.colors.light.border, borderRadius: Pal.borderRadius.lg, paddingHorizontal: 14, backgroundColor: Pal.colors.light.surface }}>
      <Text style={{ fontSize: 16 }}>{emoji}</Text>
      <TextInput
        style={{ flex: 1, height: 48, color: Pal.colors.light.text, fontSize: 14, fontFamily: Pal.typography.fontFamily.regular }}
        placeholder={placeholder}
        placeholderTextColor={Pal.colors.light.textMuted}
        value={value}
        onChangeText={onChangeText}
      />
      {hint && <Text style={{ fontSize: 10, color: Pal.colors.light.textMuted }}>{hint}</Text>}
    </View>
  );
}
