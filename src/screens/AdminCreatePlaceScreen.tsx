import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Alert, Switch } from 'react-native';
import { colors, spacing, borderRadius } from '../config/theme';
import { MaterialIcons } from '../utils/Icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBottomSafePadding } from '../design/responsive';
import { placesApi } from '../services/api/places';
import { Picker } from '@react-native-picker/picker';

const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const PRESET_CATEGORIES = ['monument', 'temple', 'park', 'museum', 'restaurant', 'other'];

export default function AdminCreatePlaceScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const bottomPadding = useBottomSafePadding(24);
  const [loading, setLoading] = useState(false);

  // Form State
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('monument');
  const [otherCategory, setOtherCategory] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');

  // Ticket Price
  const [priceAdult, setPriceAdult] = useState('');
  const [priceChild, setPriceChild] = useState('');
  const [priceForeigner, setPriceForeigner] = useState('');

  // Timings & Closed Days
  const [closedDays, setClosedDays] = useState<string[]>([]);
  const [shifts, setShifts] = useState<{ open: string; close: string }[]>([{ open: '09:00', close: '18:00' }]);

  const toggleClosedDay = (day: string) => {
    setClosedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const addShift = () => {
    setShifts([...shifts, { open: '09:00', close: '12:00' }]);
  };

  const updateShift = (index: number, field: 'open' | 'close', val: string) => {
    const newShifts = [...shifts];
    newShifts[index][field] = val;
    setShifts(newShifts);
  };

  const removeShift = (index: number) => {
    setShifts(shifts.filter((_, i) => i !== index));
  };

  const handleCreate = async () => {
    if (!name || !description || !city || !state || !latitude || !longitude) {
      Alert.alert('Error', 'Please fill all basic details');
      return;
    }

    const finalCategory = category === 'other' ? otherCategory.trim() : category;
    if (!finalCategory) {
      Alert.alert('Error', 'Please provide a category');
      return;
    }

    const openingHours: Record<string, { open: string; close: string }[]> = {};
    DAYS_OF_WEEK.forEach((day) => {
      if (!closedDays.includes(day)) {
        openingHours[day] = shifts;
      } else {
        openingHours[day] = [];
      }
    });

    const ticketPrice = {
      currency: 'INR',
      adult: priceAdult ? parseInt(priceAdult, 10) : 0,
      child: priceChild ? parseInt(priceChild, 10) : 0,
      foreigner: priceForeigner ? parseInt(priceForeigner, 10) : 0,
    };

    setLoading(true);
    try {
      await placesApi.create({
        name,
        description,
        city,
        state,
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        category: finalCategory,
        openingHours,
        ticketPrice,
      });
      Alert.alert('Success', 'Place added manually!', [
        { text: 'OK', onPress: () => navigation.goBack() }
      ]);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to create place');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Add New Place</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: bottomPadding + 40 }}>
        
        {/* Basic Info */}
        <Text style={styles.sectionTitle}>Basic Info</Text>
        <TextInput style={styles.input} placeholder="Place Name" value={name} onChangeText={setName} />
        <TextInput style={[styles.input, { height: 80, textAlignVertical: 'top' }]} placeholder="Description" multiline value={description} onChangeText={setDescription} />
        
        <View style={styles.row}>
          <TextInput style={[styles.input, { flex: 1, marginRight: 8 }]} placeholder="City" value={city} onChangeText={setCity} />
          <TextInput style={[styles.input, { flex: 1 }]} placeholder="State" value={state} onChangeText={setState} />
        </View>

        <View style={styles.row}>
          <TextInput style={[styles.input, { flex: 1, marginRight: 8 }]} placeholder="Latitude (e.g. 28.6139)" keyboardType="numeric" value={latitude} onChangeText={setLatitude} />
          <TextInput style={[styles.input, { flex: 1 }]} placeholder="Longitude (e.g. 77.2090)" keyboardType="numeric" value={longitude} onChangeText={setLongitude} />
        </View>

        {/* Category */}
        <Text style={styles.sectionTitle}>Category</Text>
        <View style={styles.pickerContainer}>
          <Picker selectedValue={category} onValueChange={(val: string) => setCategory(val)} style={{ color: colors.text }}>
            {PRESET_CATEGORIES.map(cat => (
              <Picker.Item key={cat} label={cat.charAt(0).toUpperCase() + cat.slice(1)} value={cat} />
            ))}
          </Picker>
        </View>
        {category === 'other' && (
          <TextInput style={[styles.input, { marginTop: 8 }]} placeholder="Custom Category Name" value={otherCategory} onChangeText={setOtherCategory} />
        )}

        {/* Entry Fees */}
        <Text style={styles.sectionTitle}>Entry Fees (₹)</Text>
        <View style={styles.row}>
          <TextInput style={[styles.input, { flex: 1, marginRight: 8 }]} placeholder="Adult" keyboardType="numeric" value={priceAdult} onChangeText={setPriceAdult} />
          <TextInput style={[styles.input, { flex: 1, marginRight: 8 }]} placeholder="Child" keyboardType="numeric" value={priceChild} onChangeText={setPriceChild} />
          <TextInput style={[styles.input, { flex: 1 }]} placeholder="Foreigner" keyboardType="numeric" value={priceForeigner} onChangeText={setPriceForeigner} />
        </View>

        {/* Split Timings */}
        <Text style={styles.sectionTitle}>Opening Hours</Text>
        <Text style={styles.hint}>Add a second shift for morning + evening hours.</Text>
        {shifts.map((shift, i) => (
          <View key={i} style={styles.shiftRow}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              placeholder={i === 0 ? 'Morning open (e.g. 09:00)' : 'Evening open (e.g. 16:00)'}
              value={shift.open}
              onChangeText={(val) => updateShift(i, 'open', val)}
            />
            <Text style={{ marginHorizontal: 8, color: colors.text }}>to</Text>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              placeholder={i === 0 ? 'Close (e.g. 12:00)' : 'Close (e.g. 20:00)'}
              value={shift.close}
              onChangeText={(val) => updateShift(i, 'close', val)}
            />
            {shifts.length > 1 && (
              <TouchableOpacity onPress={() => removeShift(i)} style={styles.removeShift}>
                <MaterialIcons name="close" size={20} color={colors.error} />
              </TouchableOpacity>
            )}
          </View>
        ))}
        {shifts.length < 3 && (
          <TouchableOpacity style={styles.addShiftBtn} onPress={addShift}>
            <MaterialIcons name="add" size={18} color={colors.primary} />
            <Text style={styles.addShiftText}>
              {shifts.length === 1 ? 'Add Evening Shift' : 'Add Another Shift'}
            </Text>
          </TouchableOpacity>
        )}

        {/* Closed Days */}
        <Text style={styles.sectionTitle}>Closed Days</Text>
        <Text style={styles.hint}>Select days the place is closed (e.g. Sunday).</Text>
        <View style={styles.daysGrid}>
          {DAYS_OF_WEEK.map((day) => {
            const isClosed = closedDays.includes(day);
            return (
              <TouchableOpacity key={day} style={[styles.dayChip, isClosed && styles.dayChipClosed]} onPress={() => toggleClosedDay(day)}>
                <MaterialIcons
                  name={isClosed ? 'check-box' : 'check-box-outline-blank'}
                  size={16}
                  color={isClosed ? colors.white : colors.text}
                  style={{ marginRight: 4 }}
                />
                <Text style={[styles.dayChipText, isClosed && styles.dayChipTextClosed]}>{day.substring(0, 3)}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity style={styles.submitBtn} onPress={handleCreate} disabled={loading}>
          <Text style={styles.submitBtnText}>{loading ? 'Saving...' : 'Create Place'}</Text>
        </TouchableOpacity>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  backBtn: { padding: 8, marginLeft: -8, width: 40 },
  title: { flex: 1, fontSize: 18, fontWeight: '700', color: colors.text, textAlign: 'center' },
  content: { padding: spacing.md },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: colors.text, marginTop: spacing.lg, marginBottom: spacing.sm },
  hint: { fontSize: 12, color: colors.textSecondary ?? '#6B7280', marginBottom: spacing.sm, marginTop: -4 },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: '#E5E0D8',
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.text,
    marginBottom: spacing.md,
  },
  row: { flexDirection: 'row' },
  pickerContainer: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: '#E5E0D8',
    borderRadius: borderRadius.md,
    marginBottom: spacing.md,
  },
  shiftRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  removeShift: { padding: 8, marginLeft: 4 },
  addShiftBtn: { flexDirection: 'row', alignItems: 'center', padding: spacing.sm, alignSelf: 'flex-start' },
  addShiftText: { color: colors.primary, fontWeight: '600', marginLeft: 4 },
  daysGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: spacing.xl },
  dayChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  dayChipClosed: { backgroundColor: colors.error, borderColor: colors.error },
  dayChipText: { fontSize: 14, color: colors.text },
  dayChipTextClosed: { color: colors.white, fontWeight: '600' },
  submitBtn: {
    backgroundColor: colors.primary,
    padding: 16,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  submitBtnText: { color: colors.white, fontSize: 16, fontWeight: 'bold' },
});
