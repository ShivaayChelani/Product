import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator, Alert, Share, Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import RNFS from 'react-native-fs';
import { monetizationApi } from '../services/api/monetization';
import { apiClient } from '../services/api/client';
import { API_CONFIG } from '../config/api';
import { useBottomSafePadding } from '../design/responsive';

type Tx = {
  id: string;
  status: string;
  amountPaise: number;
  currency?: string;
  createdAt: string;
  plan?: { name?: string };
  invoice?: { id?: string; invoiceNumber?: string } | null;
  invoiceId?: string | null;
  provider?: string;
  subscription?: { plan?: { name?: string } };
  description?: string;
};

export default function BillingHistoryScreen({ onBack }: { onBack?: () => void }) {
  const insets = useSafeAreaInsets();
  const contentPadBottom = useBottomSafePadding(24);
  const [items, setItems] = useState<Tx[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [res, inv] = await Promise.all([
        monetizationApi.listTransactions(),
        monetizationApi.listInvoices().catch(() => null),
      ]);
      const rows = Array.isArray((res as any)?.data)
        ? (res as any).data
        : Array.isArray(res)
          ? res
          : [];
      const invoices = Array.isArray((inv as any)?.data) ? (inv as any).data : [];
      // Prefer invoice id on matching transactions when present
      const byTx = new Map(invoices.map((i: any) => [i.transactionId, i]));
      setItems(rows.map((t: any) => ({
        ...t,
        invoice: t.invoice || byTx.get(t.id) || null,
      })));
    } catch (e: any) {
      setError(e?.message || 'Could not load billing history');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openInvoice = async (tx: Tx) => {
    const invoiceId = tx.invoice?.id || tx.invoiceId || tx.id;
    try {
      const token = apiClient.getToken();
      if (!token) {
        Alert.alert('Invoice', 'Please sign in again to download invoices.');
        return;
      }
      const url = `${API_CONFIG.baseUrl}/monetization/invoices/${invoiceId}/pdf`;
      const path = `${RNFS.CachesDirectoryPath}/invoice-${invoiceId}.pdf`;
      const result = await RNFS.downloadFile({
        fromUrl: url,
        toFile: path,
        headers: { Authorization: `Bearer ${token}` },
      }).promise;
      if (result.statusCode && result.statusCode >= 400) {
        throw new Error(`Download failed (${result.statusCode})`);
      }
      const fileUrl = Platform.OS === 'android' ? `file://${path}` : path;
      await Share.share({
        url: fileUrl,
        title: tx.invoice?.invoiceNumber || 'GST Invoice',
        message: Platform.OS === 'android' ? `Invoice saved: ${path}` : undefined,
      });
    } catch (e: any) {
      Alert.alert('Invoice', e?.message || 'Could not download GST invoice PDF.');
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { paddingTop: Math.max(insets.top, 16) }]} edges={['left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.iconBtn}>
          <Icon name="chevron-back" size={22} color="#63300E" />
        </TouchableOpacity>
        <Text style={styles.title}>Billing history</Text>
        <View style={styles.iconBtn} />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color="#B9834B" /></View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.muted}>{error}</Text>
          <TouchableOpacity style={styles.btn} onPress={load}><Text style={styles.btnText}>Try again</Text></TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={
            items.length === 0 ? styles.center : [styles.list, { paddingBottom: contentPadBottom }]
          }
          ListEmptyComponent={<Text style={styles.muted}>No payments yet.</Text>}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.row}>
                <Text style={styles.name}>
                  {item.subscription?.plan?.name || item.plan?.name || item.description || item.provider || 'Payment'}
                </Text>
                <Text style={styles.amount}>₹{((item.amountPaise || 0) / 100).toFixed(0)}</Text>
              </View>
              <Text style={styles.muted}>
                {new Date(item.createdAt).toLocaleString('en-IN')} · {item.status}
              </Text>
              <TouchableOpacity style={styles.link} onPress={() => openInvoice(item)}>
                <Icon name="download-outline" size={16} color="#B9834B" />
                <Text style={styles.linkText}>GST invoice PDF</Text>
              </TouchableOpacity>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFFFFF' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10 },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, textAlign: 'center', fontWeight: '800', fontSize: 17, color: '#63300E' },
  list: { padding: 16, gap: 10 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  card: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#E9D4BE', padding: 14, marginBottom: 10, gap: 6 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { fontWeight: '800', color: '#63300E', flex: 1, marginRight: 8 },
  amount: { fontWeight: '900', color: '#B9834B' },
  muted: { fontSize: 13, color: '#8B7355' },
  link: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  linkText: { color: '#B9834B', fontWeight: '700', fontSize: 13 },
  btn: { backgroundColor: '#B9834B', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10 },
  btnText: { color: '#fff', fontWeight: '800' },
});
