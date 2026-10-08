/**
 * "Related place" picker for the Add Event form.
 *
 * Searches APPROVED places only — a PENDING/REJECTED place can be linked in the
 * database but would render as a dead "Organised with" row on the detail screen,
 * so the candidate list is filtered here as well as by the server's linkability
 * check. Selection is a place id + display name; the form never keeps the whole
 * place object.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { EVENT_COLORS } from '../EventCard';
import { placesApi, type PlaceResponse } from '../../../services/api/places';

type Props = {
  visible: boolean;
  selectedId: string | null;
  selectedName: string | null;
  onSelect: (place: { id: string; name: string } | null) => void;
  onClose: () => void;
};

type Row = Pick<PlaceResponse, 'id' | 'name'> & { city?: string | null; category?: string | null };

const DEBOUNCE_MS = 350;

export default function RelatedPlaceSheet({ visible, selectedId, selectedName, onSelect, onClose }: Props) {
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runSearch = useCallback(async (term: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await placesApi.list({
        search: term.trim() || undefined,
        status: 'APPROVED',
        limit: 12,
      });
      setRows((res.data || []) as Row[]);
    } catch {
      setError('Could not search places. Check your connection.');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounced so typing does not fire one request per keystroke.
  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => void runSearch(search), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [visible, search, runSearch]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button">
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.header}>
            <Text style={styles.title} accessibilityRole="header">
              Link a place
            </Text>
            <Pressable
              onPress={onClose}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Close place picker"
            >
              <Icon name="close" size={20} color={EVENT_COLORS.textSecondary} />
            </Pressable>
          </View>

          <View style={styles.searchBox}>
            <Icon name="search" size={16} color={EVENT_COLORS.textSecondary} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search temples, ghats, venues…"
              placeholderTextColor="#68756D"
              style={styles.searchInput}
              autoFocus={visible}
              autoCorrect={false}
              returnKeyType="search"
              accessibilityLabel="Search places"
            />
          </View>

          {selectedId ? (
            <Pressable
              onPress={() => {
                onSelect(null);
                onClose();
              }}
              style={styles.clearRow}
              accessibilityRole="button"
              accessibilityLabel="Remove linked place"
            >
              <Icon name="unlink-outline" size={16} color={EVENT_COLORS.textSecondary} />
              <Text style={styles.clearText}>Remove “{selectedName || selectedId}”</Text>
            </Pressable>
          ) : null}

          {loading ? (
            <View style={styles.stateBox}>
              <ActivityIndicator color={EVENT_COLORS.accent} />
            </View>
          ) : error ? (
            <View style={styles.stateBox}>
              <Text style={styles.stateText}>{error}</Text>
            </View>
          ) : (
            <FlatList
              data={rows}
              keyExtractor={item => item.id}
              keyboardShouldPersistTaps="handled"
              style={styles.list}
              ListEmptyComponent={
                <View style={styles.stateBox}>
                  <Text style={styles.stateText}>No approved places match that search.</Text>
                </View>
              }
              renderItem={({ item }) => {
                const isActive = item.id === selectedId;
                return (
                  <Pressable
                    onPress={() => {
                      onSelect({ id: item.id, name: item.name });
                      onClose();
                    }}
                    style={[styles.row, isActive && styles.rowActive]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isActive }}
                  >
                    <Icon name="location" size={16} color={isActive ? EVENT_COLORS.accent : EVENT_COLORS.textSecondary} />
                    <View style={styles.rowText}>
                      <Text style={styles.rowName} numberOfLines={1}>
                        {item.name}
                      </Text>
                      {item.city ? (
                        <Text style={styles.rowMeta} numberOfLines={1}>
                          {item.city}
                        </Text>
                      ) : null}
                    </View>
                    {isActive ? <Icon name="checkmark" size={18} color={EVENT_COLORS.accent} /> : null}
                  </Pressable>
                );
              }}
            />
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(29,36,32,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 20,
    maxHeight: '80%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 10,
  },
  title: { fontSize: 16, fontWeight: '800', color: EVENT_COLORS.text },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#F7F6F1',
    borderWidth: 1,
    borderColor: EVENT_COLORS.border,
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  searchInput: { flex: 1, fontSize: 14, color: EVENT_COLORS.text, paddingVertical: 0 },
  clearRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#F7F6F1',
    marginBottom: 8,
  },
  clearText: { fontSize: 13, color: EVENT_COLORS.textBody, fontWeight: '600' },
  list: { flexGrow: 0 },
  stateBox: { paddingVertical: 26, alignItems: 'center' },
  stateText: { fontSize: 13, color: EVENT_COLORS.textSecondary, textAlign: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: EVENT_COLORS.border,
    marginBottom: 8,
    backgroundColor: '#FFFFFF',
  },
  rowActive: { borderColor: EVENT_COLORS.accent, backgroundColor: EVENT_COLORS.accentSoft },
  rowText: { flex: 1 },
  rowName: { fontSize: 14.5, fontWeight: '600', color: EVENT_COLORS.text },
  rowMeta: { fontSize: 12, color: EVENT_COLORS.textSecondary, marginTop: 2 },
});
