import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert, Switch, TextInput,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import { monetizationApi } from '../services/api/monetization';
import { useBottomSafePadding } from '../design/responsive';

export default function VendorPalPointsPartnerScreen({ onBack }: { onBack?: () => void }) {
  const insets = useSafeAreaInsets();
  const contentPadBottom = useBottomSafePadding(24);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<any>(null);
  const [partner, setPartner] = useState<any>(null);
  const [offerTitle, setOfferTitle] = useState('');
  const [discountPct, setDiscountPct] = useState('10');
  const [pointsRequired, setPointsRequired] = useState('1000');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await monetizationApi.getVendorPalPointsPartner();
      setConfig(data.config);
      setPartner(data.partner);
      if (data.config?.defaultPointsRequired) {
        setPointsRequired(String(data.config.defaultPointsRequired));
      }
    } catch (e: any) {
      Alert.alert('Unavailable', e?.message || 'Could not load Pal Points Partner settings.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleProgram = async (value: boolean) => {
    setSaving(true);
    try {
      const updated = await monetizationApi.updateVendorPalPointsPartner({ vendorEnabled: value });
      setPartner(updated);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not update partner status.');
    } finally {
      setSaving(false);
    }
  };

  const addOffer = async () => {
    if (!offerTitle.trim()) {
      Alert.alert('Title required', 'Enter an offer title.');
      return;
    }
    setSaving(true);
    try {
      await monetizationApi.upsertVendorPalPointsPartnerOffer({
        title: offerTitle.trim(),
        discountPct: Number(discountPct) || 10,
        pointsRequired: Number(pointsRequired) || config?.defaultPointsRequired || 1000,
      });
      setOfferTitle('');
      await load();
      Alert.alert('Saved', 'Partner offer created.');
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not save offer.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { paddingTop: Math.max(insets.top, 16) }]} edges={['left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.iconBtn}>
          <Icon name="arrow-back" size={22} color="#63300E" />
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>DIAMOND BENEFIT</Text>
          <Text style={styles.title}>Pal Points Partner</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color="#B9834B" /></View>
      ) : (
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: contentPadBottom }]}>
          {!partner?.adminEnabled ? (
            <View style={styles.card}>
              <Text style={styles.muted}>
                Pal Points Partner is not enabled for your business yet. Contact admin after upgrading to Diamond.
              </Text>
            </View>
          ) : (
            <>
              <View style={styles.card}>
                <View style={styles.row}>
                  <Text style={styles.label}>Participate in program</Text>
                  <Switch
                    value={Boolean(partner.vendorEnabled)}
                    onValueChange={toggleProgram}
                    disabled={saving}
                  />
                </View>
                <Text style={styles.muted}>
                  Min {config?.defaultPointsRequired ?? 1000} points · Max {config?.defaultMaxDiscountPct ?? 10}% discount
                </Text>
              </View>

              <Text style={styles.section}>Create partner offer</Text>
              <View style={styles.card}>
                <TextInput
                  style={styles.input}
                  placeholder="Offer title"
                  value={offerTitle}
                  onChangeText={setOfferTitle}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Discount %"
                  keyboardType="decimal-pad"
                  value={discountPct}
                  onChangeText={setDiscountPct}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Pal Points required"
                  keyboardType="number-pad"
                  value={pointsRequired}
                  onChangeText={setPointsRequired}
                />
                <TouchableOpacity disabled={saving} style={styles.btn} onPress={addOffer}>
                  <Text style={styles.btnText}>Add offer</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.section}>Active offers</Text>
              {(partner?.offers ?? []).length === 0 ? (
                <Text style={styles.muted}>No partner offers yet.</Text>
              ) : (
                partner.offers.map((o: any) => (
                  <View key={o.id} style={styles.card}>
                    <Text style={styles.offerTitle}>{o.title}</Text>
                    <Text style={styles.muted}>
                      {o.discountPct}% off · {o.pointsRequired} points
                    </Text>
                  </View>
                ))
              )}
            </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFFFFF' },
  header: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 16, paddingVertical: 10, gap: 10 },
  headerCopy: { flex: 1 },
  eyebrow: { fontSize: 11, fontWeight: '800', letterSpacing: 1.4, color: '#B9834B' },
  iconBtn: {
    width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#E9D4BE', marginTop: 2,
  },
  title: { fontWeight: '800', fontSize: 20, color: '#63300E', marginTop: 4 },
  content: { padding: 16, gap: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: { backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#E9D4BE', padding: 16, gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { fontSize: 14, fontWeight: '700', color: '#63300E' },
  muted: { fontSize: 13, color: '#8B7355', lineHeight: 18 },
  section: { fontSize: 16, fontWeight: '800', color: '#63300E', marginTop: 8 },
  input: {
    borderWidth: 1, borderColor: '#E9D4BE', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14, color: '#4D3227', backgroundColor: '#FFFCF8',
  },
  btn: { backgroundColor: '#63300E', borderRadius: 20, paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  btnText: { color: '#fff', fontWeight: '800' },
  offerTitle: { fontSize: 15, fontWeight: '800', color: '#63300E' },
});
