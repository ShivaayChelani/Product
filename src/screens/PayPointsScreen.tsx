import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, StyleSheet, TouchableOpacity, ScrollView,
  StatusBar, Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, borderRadius } from '../config/theme';
import { MaterialIcons } from '../utils/Icons';
import { PalPointsIcon } from '../components/PalPointsIcon';
import { redemptionsApi, walletApi } from '../services/api';

interface PayPointsScreenProps {
  onBack: () => void;
  initialVendorCode?: string;
}

export default function PayPointsScreen({ onBack, initialVendorCode }: PayPointsScreenProps) {
  const insets = useSafeAreaInsets();
  const [vendorCode, setVendorCode] = useState(initialVendorCode || '');
  const [points, setPoints] = useState('');
  const [palPoints, setPalPoints] = useState(0);
  const [paying, setPaying] = useState(false);
  const [receipt, setReceipt] = useState<any>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await walletApi.getProfile();
        setPalPoints(res.data?.palPoints || 0);
      } catch (e) {
      }
    })();
  }, []);

  const handlePay = async () => {
    const trimmedCode = vendorCode.trim().toUpperCase();
    if (!trimmedCode) {
      Alert.alert('Error', 'Enter the vendor business code');
      return;
    }

    const pts = parseInt(points, 10);
    if (!pts || pts <= 0) {
      Alert.alert('Error', 'Enter a valid number of PalPoints');
      return;
    }
    if (pts > palPoints) {
      Alert.alert('Insufficient Points', `You have ${palPoints} PalPoints but need ${pts}.`);
      return;
    }

    setPaying(true);
    try {
      const res = await redemptionsApi.pay(trimmedCode, pts);
      setReceipt(res.data);
      setPalPoints((prev) => Math.max(0, prev - pts));
    } catch (err: any) {
      const msg = err?.data?.message || err?.message || 'Could not send points';
      Alert.alert('Failed', msg);
    } finally {
      setPaying(false);
    }
  };

  if (receipt) {
    return (
      <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <StatusBar barStyle="dark-content" backgroundColor={colors.background} />
        <View style={styles.receiptContainer}>
          <View style={styles.receiptCard}>
            <MaterialIcons name="check-circle" size={64} color={colors.success} />
            <Text style={styles.receiptTitle}>{receipt.pointsSpent || points} PalPoints sent</Text>
            <Text style={styles.receiptSubtitle}>to {receipt.vendorName}</Text>

            <View style={styles.receiptDivider} />

            <View style={styles.receiptRow}>
              <Text style={styles.receiptLabel}>Business Code</Text>
              <Text style={styles.receiptValue}>{vendorCode.trim().toUpperCase()}</Text>
            </View>
            <View style={styles.receiptRow}>
              <Text style={styles.receiptLabel}>Points transferred</Text>
              <Text style={styles.receiptValue}>{receipt.pointsSpent}</Text>
            </View>
            {receipt.receiptNumber ? (
              <View style={styles.receiptRow}>
                <Text style={styles.receiptLabel}>Receipt</Text>
                <Text style={styles.receiptValue}>{receipt.receiptNumber}</Text>
              </View>
            ) : null}

            <Text style={styles.receiptHint}>
              Points were transferred to the vendor instantly. No QR or code verification needed.
            </Text>

            <TouchableOpacity style={styles.doneBtn} onPress={onBack}>
              <Text style={styles.doneBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={onBack} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <MaterialIcons name="arrow-back" size={24} color={colors.primaryDark} />
          </TouchableOpacity>
          <Text style={styles.title}>Send PalPoints</Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView
          style={styles.flex}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: Math.max(insets.bottom, 16) + 24 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.balanceCard}>
            <PalPointsIcon size={52} style={styles.balanceCoin} />
            <Text style={styles.balanceLabel}>Your Balance</Text>
            <Text style={styles.balanceValue}>{palPoints.toLocaleString()}</Text>
            <Text style={styles.balanceSub}>PalPoints</Text>
          </View>

          <View style={styles.formCard}>
            <Text style={styles.helperText}>
              Enter the vendor’s business code and how many PalPoints to send. Points transfer instantly.
            </Text>

            <Text style={styles.formLabel}>Business Code *</Text>
            <View style={styles.inputContainer}>
              <MaterialIcons name="storefront" size={20} color={colors.textSecondary} />
              <TextInput
                style={styles.input}
                placeholder="e.g. VND-CAFE-ABCD"
                placeholderTextColor={colors.textSecondary}
                value={vendorCode}
                onChangeText={setVendorCode}
                autoCapitalize="characters"
                autoCorrect={false}
                underlineColorAndroid="transparent"
              />
            </View>

            <Text style={styles.formLabel}>PalPoints to send *</Text>
            <View style={styles.inputContainer}>
              <PalPointsIcon size={20} />
              <TextInput
                style={styles.input}
                placeholder="Enter points"
                placeholderTextColor={colors.textSecondary}
                value={points}
                onChangeText={setPoints}
                keyboardType="numeric"
                underlineColorAndroid="transparent"
              />
            </View>

            <TouchableOpacity
              style={[styles.payBtn, (!vendorCode.trim() || !points || paying) && styles.payBtnDisabled]}
              onPress={handlePay}
              disabled={!vendorCode.trim() || !points || paying}
            >
              {paying ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <MaterialIcons name="send" size={20} color="#fff" />
                  <Text style={styles.payBtnText}>Send points</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  title: { fontSize: 18, fontWeight: '800', color: colors.primaryDark },
  scrollContent: { paddingHorizontal: spacing.md, paddingTop: spacing.sm },
  balanceCard: {
    backgroundColor: colors.primaryDark,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  balanceCoin: { marginBottom: 8 },
  balanceLabel: { color: 'rgba(255,255,255,0.75)', fontSize: 13, fontWeight: '600' },
  balanceValue: { color: '#fff', fontSize: 36, fontWeight: '800', marginTop: 4 },
  balanceSub: { color: 'rgba(255,255,255,0.7)', fontSize: 13, marginTop: 2 },
  formCard: {
    backgroundColor: '#fff',
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(185,131,75,0.15)',
  },
  helperText: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 19,
    marginBottom: spacing.md,
  },
  formLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primaryDark,
    marginBottom: 8,
    marginTop: 4,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    paddingHorizontal: 12,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(185,131,75,0.18)',
  },
  input: {
    flex: 1,
    paddingVertical: Platform.OS === 'ios' ? 14 : 10,
    fontSize: 15,
    fontWeight: '600',
    color: colors.primaryDark,
  },
  payBtn: {
    marginTop: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  payBtnDisabled: { opacity: 0.5 },
  payBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  receiptContainer: { flex: 1, justifyContent: 'center', padding: spacing.lg },
  receiptCard: {
    backgroundColor: '#fff',
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(185,131,75,0.15)',
  },
  receiptTitle: { fontSize: 22, fontWeight: '800', color: colors.primaryDark, marginTop: 12 },
  receiptSubtitle: { fontSize: 15, color: colors.textSecondary, marginTop: 4 },
  receiptDivider: {
    height: 1,
    alignSelf: 'stretch',
    backgroundColor: 'rgba(185,131,75,0.15)',
    marginVertical: spacing.lg,
  },
  receiptRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignSelf: 'stretch',
    marginBottom: 10,
  },
  receiptLabel: { fontSize: 13, color: colors.textSecondary },
  receiptValue: { fontSize: 13, fontWeight: '700', color: colors.primaryDark },
  receiptHint: {
    marginTop: spacing.md,
    fontSize: 12,
    lineHeight: 18,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  doneBtn: {
    marginTop: spacing.lg,
    backgroundColor: colors.primaryDark,
    borderRadius: borderRadius.md,
    paddingVertical: 14,
    paddingHorizontal: 32,
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  doneBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});
