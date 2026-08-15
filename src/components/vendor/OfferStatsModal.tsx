import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { PalPointsIcon } from '../PalPointsIcon';
import { vendorsApi } from '../../services/api/vendors';

const C = {
  deep: '#3B1E12',
  muted: '#8B7355',
  mutedLight: '#B8A88A',
  border: '#EDE6DC',
  soft: '#F7F0E8',
  white: '#FFFFFF',
  success: '#16A34A',
  bronze: '#B9834B',
  purple: '#8B6BB5',
};

type Props = {
  visible: boolean;
  offerId: string | null;
  offerTitle?: string;
  onClose: () => void;
  onEdit?: () => void;
};

export default function OfferStatsModal({ visible, offerId, offerTitle, onClose, onEdit }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [stats, setStats] = useState({
    views: 0,
    clicks: 0,
    redemptions: 0,
    verified: 0,
    pointsSpent: 0,
    conversion: 0,
  });

  useEffect(() => {
    if (!visible || !offerId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const res = await vendorsApi.getOfferAnalytics(offerId);
        const data = (res as any)?.data ?? res;
        const m = data?.metrics || {};
        const o = data?.offer || {};
        const views = Number(m.views ?? o.viewCount ?? data?.views ?? 0) || 0;
        const redemptions = Number(m.redemptions ?? o.currentRedemptions ?? 0) || 0;
        if (!cancelled) {
          setStats({
            views,
            clicks: Number(m.clicks ?? o.clickCount ?? data?.clicks ?? 0) || 0,
            redemptions,
            verified: Number(m.redemptions ?? 0) || 0,
            pointsSpent: Number(m.palPointsUsed ?? 0) || 0,
            conversion: Number(m.conversionRate ?? (views > 0 ? (redemptions / views) * 100 : 0)) || 0,
          });
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Could not load offer analytics.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [visible, offerId]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.head}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.eyebrow}>OFFER STATS</Text>
              <Text style={styles.title} numberOfLines={2}>{offerTitle || 'Offer performance'}</Text>
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose} hitSlop={8}>
              <Icon name="close" size={18} color={C.deep} />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator color={C.bronze} />
              <Text style={styles.loadingText}>Loading stats…</Text>
            </View>
          ) : error ? (
            <View style={styles.center}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : (
            <View style={styles.grid}>
              {[
                { label: 'Views', value: stats.views, icon: 'eye-outline', color: C.bronze, bg: '#FFF3E4' },
                { label: 'Clicks', value: stats.clicks, icon: 'hand-left-outline', color: '#3B82F6', bg: '#EAF2FB' },
                { label: 'Redeems', value: stats.redemptions, icon: 'gift-outline', color: C.success, bg: '#EAF7F0' },
                { label: 'Verified', value: stats.verified, icon: 'checkmark-circle-outline', color: C.success, bg: '#EAF7F0' },
                { label: 'Conversion', value: `${stats.conversion.toFixed(1)}%`, icon: 'trending-up', color: C.purple, bg: '#F3EEF8' },
                { label: 'PalPoints', value: stats.pointsSpent, palPoints: true, color: C.purple, bg: '#F3EEF8' },
              ].map((item) => (
                <View key={item.label} style={styles.card}>
                  <View style={[styles.iconWrap, { backgroundColor: item.bg }]}>
                    {item.palPoints ? (
                      <PalPointsIcon size={16} />
                    ) : (
                      <Icon name={item.icon as any} size={16} color={item.color} />
                    )}
                  </View>
                  <Text style={styles.value}>{item.value}</Text>
                  <Text style={styles.label}>{item.label}</Text>
                </View>
              ))}
            </View>
          )}

          <View style={styles.actions}>
            {onEdit ? (
              <TouchableOpacity style={styles.secondaryBtn} onPress={onEdit} activeOpacity={0.85}>
                <MaterialIcons name="edit" size={16} color={C.deep} />
                <Text style={styles.secondaryText}>Edit Offer</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity style={styles.primaryBtn} onPress={onClose} activeOpacity={0.85}>
              <Text style={styles.primaryText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(30,14,8,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: C.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 18,
    paddingBottom: 28,
    paddingTop: 10,
  },
  handle: {
    alignSelf: 'center',
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.border,
    marginBottom: 12,
  },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 16 },
  eyebrow: { fontSize: 11, fontWeight: '800', color: C.bronze, letterSpacing: 1 },
  title: { fontSize: 18, fontWeight: '800', color: C.deep, marginTop: 4 },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: C.soft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: { paddingVertical: 36, alignItems: 'center' },
  loadingText: { marginTop: 10, color: C.muted, fontSize: 13 },
  errorText: { color: '#DC2626', fontSize: 13, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  card: {
    width: '48%',
    flexGrow: 1,
    backgroundColor: C.soft,
    borderRadius: 14,
    padding: 14,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  value: { fontSize: 22, fontWeight: '800', color: C.deep },
  label: { fontSize: 12, fontWeight: '600', color: C.muted, marginTop: 2 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 18 },
  secondaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    paddingVertical: 14,
    backgroundColor: C.white,
  },
  secondaryText: { fontSize: 14, fontWeight: '800', color: C.deep },
  primaryBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    paddingVertical: 14,
    backgroundColor: C.deep,
  },
  primaryText: { fontSize: 14, fontWeight: '800', color: '#FFF9F2' },
});
