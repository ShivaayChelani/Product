import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, TouchableOpacity, ScrollView, Alert, StatusBar, Switch,
  KeyboardAvoidingView, Platform, Image, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBottomSafePadding } from '../design/responsive';
import { launchImageLibrary } from 'react-native-image-picker';
import { MaterialIcons, Ionicons } from '../utils/Icons';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { useDataContext } from '../context/DataContext';
import { DEV_FLAGS } from '../config/devFlags';
import { vendorsApi, apiClient } from '../services/api';
import { uploadApi } from '../services/api/upload';
import { VendorOffer } from '../types';
import { useVendorScreenInsets, VendorUI } from '../design/vendorLayout';
import { PalPointsIcon } from '../components/PalPointsIcon';
import { useNavigation } from '@react-navigation/native';

const C = {
  bg: '#FFFFFF',
  white: '#FFFFFF',
  soft: '#FFFFFF',
  peach: '#F8E8D8',
  text: '#3B1E12',
  muted: '#8B7355',
  mutedLight: '#B8A88A',
  border: '#E9D4BE',
  deep: '#3B1E12',
  bronze: '#B9834B',
  gold: '#D4A05A',
  success: '#16A34A',
  successBg: '#E8F7EE',
};

type OfferKind = 'discount' | 'bogo' | 'freebie' | 'combo';
type Step = 1 | 2 | 3;
type ValueMode = 'percentage' | 'flat';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

interface CreateOfferScreenProps {
  onBack: () => void;
  offerId?: string;
}

function daysBetween(start?: string, end?: string): number {
  if (!start || !end) return 0;
  const a = new Date(start).getTime();
  const b = new Date(end).getTime();
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return 0;
  return Math.max(1, Math.round((b - a) / (1000 * 60 * 60 * 24)) + 1);
}

function dateFromOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

const DATE_PRESETS = [
  { label: 'Today', offset: 0 },
  { label: '+7d', offset: 7 },
  { label: '+30d', offset: 30 },
  { label: '+60d', offset: 60 },
] as const;

const START_TIME_PRESETS = ['07:00 AM', '09:00 AM', '11:00 AM'] as const;
const END_TIME_PRESETS = ['10:00 PM', '11:00 PM', '12:00 AM'] as const;

export default function CreateOfferScreen({ onBack, offerId }: CreateOfferScreenProps) {
  const navigation = useNavigation<any>();
  const { currentVendor, createVendorOffer, vendorOffers, refreshVendorData } = useDataContext();
  const screenInsets = useVendorScreenInsets({ withTabBar: false });
  const insets = useSafeAreaInsets();
  const contentPadBottom = useBottomSafePadding(24);
  const existing = offerId ? vendorOffers.find(o => o.id === offerId) : undefined;
  const isEditing = !!existing;

  const [step, setStep] = useState<Step>(1);
  const [offerKind, setOfferKind] = useState<OfferKind>('discount');
  const [title, setTitle] = useState(existing?.offerTitle || '');
  const [description, setDescription] = useState(existing?.offerDescription || '');
  const [imageUrl, setImageUrl] = useState((existing as any)?.imageUrl || '');

  const normalizeType = (raw?: string): 'flat' | 'percentage' | 'freebie' => {
    const v = String(raw || '').trim().toLowerCase();
    if (v === 'percentage' || v === 'percent') return 'percentage';
    if (v === 'flat' || v === 'fixed') return 'flat';
    if (v === 'freebie' || v === 'other' || v === 'bogo') return 'freebie';
    return 'flat';
  };

  const [valueMode, setValueMode] = useState<ValueMode>(
    normalizeType(existing?.discountType) === 'percentage' ? 'percentage' : 'flat',
  );
  const [discountType, setDiscountType] = useState<'flat' | 'percentage' | 'freebie'>(
    normalizeType(existing?.discountType),
  );
  const [discountValue, setDiscountValue] = useState(
    existing && normalizeType(existing.discountType) !== 'freebie' ? String(existing.discountValue ?? '') : '',
  );
  const [pointsRequired, setPointsRequired] = useState(existing ? String(existing.pointsRequired) : '');
  const [minBill, setMinBill] = useState(existing?.minBillAmount != null ? String(existing.minBillAmount) : '');
  const [dailyLimit, setDailyLimit] = useState(existing?.dailyLimit != null ? String(existing.dailyLimit) : '');
  const [couponCode, setCouponCode] = useState(existing?.couponCode || '');
  const [validTill, setValidTill] = useState(
    existing?.validTill ? String(existing.validTill).slice(0, 10) : '',
  );
  const [isActive, setIsActive] = useState(existing?.isActive ?? true);
  const [startDate, setStartDate] = useState(
    existing?.startDate ? String(existing.startDate).slice(0, 10) : new Date().toISOString().slice(0, 10),
  );
  const [useTimeSlot, setUseTimeSlot] = useState(false);
  const [startTime, setStartTime] = useState('07:00 AM');
  const [endTime, setEndTime] = useState('11:00 PM');
  const [selectedDays, setSelectedDays] = useState<string[]>([...DAYS]);
  const [terms, setTerms] = useState(
    '• Offer valid only for dine-in\n• Cannot be combined with other offers\n• PalPoints will be deducted on redemption',
  );
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showUrlFallback, setShowUrlFallback] = useState(false);

  useEffect(() => {
    if (!offerId || existing) return;
    let cancelled = false;
    (async () => {
      try {
        const offersRes = await vendorsApi.listMyOffers();
        if (cancelled) return;
        const list = (offersRes as any)?.data || offersRes || [];
        const found = list.find((o: any) => o.id === offerId);
        if (!found) return;
        await refreshVendorData();
      } catch {
        /* ignore */
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offerId]);

  useEffect(() => {
    if (!existing) return;
    const dtype = normalizeType(existing.discountType);
    setTitle(existing.offerTitle || '');
    setDescription(existing.offerDescription || '');
    setDiscountType(dtype);
    setValueMode(dtype === 'percentage' ? 'percentage' : 'flat');
    setOfferKind(dtype === 'freebie' ? 'freebie' : 'discount');
    setDiscountValue(dtype !== 'freebie' ? String(existing.discountValue ?? '') : '');
    setPointsRequired(String(existing.pointsRequired || ''));
    setMinBill(existing.minBillAmount != null ? String(existing.minBillAmount) : '');
    setDailyLimit(existing.dailyLimit != null ? String(existing.dailyLimit) : '');
    setCouponCode(existing.couponCode || '');
    setValidTill(existing.validTill ? String(existing.validTill).slice(0, 10) : '');
    setIsActive(existing.isActive);
    setStartDate(existing.startDate ? String(existing.startDate).slice(0, 10) : new Date().toISOString().slice(0, 10));
    setImageUrl((existing as any)?.imageUrl || '');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing?.id]);

  const activeDays = daysBetween(startDate, validTill);
  const discountLabel = useMemo(() => {
    if (offerKind === 'freebie' || discountType === 'freebie') return 'FREE';
    if (offerKind === 'bogo') return 'BOGO';
    if (offerKind === 'combo') return 'COMBO';
    if (valueMode === 'percentage') return `${discountValue || '0'}% OFF`;
    return `₹${discountValue || '0'} OFF`;
  }, [offerKind, discountType, valueMode, discountValue]);

  const selectOfferKind = (kind: OfferKind) => {
    setOfferKind(kind);
    if (kind === 'freebie') {
      setDiscountType('freebie');
    } else if (kind === 'discount') {
      setDiscountType(valueMode);
    } else {
      setDiscountType('freebie');
    }
  };

  const toggleDay = (day: string) => {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day],
    );
  };

  const pickImage = async () => {
    try {
      const result = await launchImageLibrary({ mediaType: 'photo', quality: 0.8 });
      const asset = result.assets?.[0];
      if (!asset?.uri) return;
      setUploading(true);
      const uploaded = await uploadApi.uploadImage(asset.uri);
      const url = uploaded?.url || (uploaded as any)?.secure_url || (uploaded as any)?.data?.url;
      if (!url) throw new Error('Upload failed');
      setImageUrl(url);
      setShowUrlFallback(false);
    } catch (err: any) {
      Alert.alert('Upload failed', err?.message || 'Could not upload image.');
    } finally {
      setUploading(false);
    }
  };

  const validateStep1 = () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) { Alert.alert('Validation', 'Offer title is required.'); return false; }
    if (trimmedTitle.length < 3) { Alert.alert('Validation', 'Offer title must be at least 3 characters.'); return false; }
    if (offerKind === 'discount') {
      const discountVal = parseInt(discountValue, 10);
      if (!discountValue.trim() || !discountVal || discountVal <= 0) {
        Alert.alert('Validation', 'Discount value must be greater than 0.');
        return false;
      }
      if (valueMode === 'percentage' && discountVal > 100) {
        Alert.alert('Validation', 'Percentage discount cannot exceed 100%.');
        return false;
      }
    }
    const pts = parseInt(pointsRequired, 10);
    if (!pts || pts <= 0) { Alert.alert('Validation', 'Points required must be greater than 0.'); return false; }
    return true;
  };

  const validateStep2 = () => {
    if (!startDate.trim()) { Alert.alert('Validation', 'Start date is required.'); return false; }
    if (!validTill.trim()) { Alert.alert('Validation', 'End date is required.'); return false; }
    const s = new Date(startDate.trim());
    const e = new Date(validTill.trim());
    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) {
      Alert.alert('Validation', 'Please enter valid dates (YYYY-MM-DD).');
      return false;
    }
    if (e < s) { Alert.alert('Validation', 'End date must be after start date.'); return false; }
    return true;
  };

  const goNext = () => {
    if (step === 1 && !validateStep1()) return;
    if (step === 2 && !validateStep2()) return;
    setStep((s) => Math.min(3, s + 1) as Step);
  };

  const goBack = () => {
    if (step === 1) onBack();
    else setStep((s) => Math.max(1, s - 1) as Step);
  };

  const handleSave = async () => {
    if (!currentVendor || currentVendor.verificationStatus !== 'approved') {
      Alert.alert('Access Denied', 'Only approved vendors can manage offers.');
      return;
    }
    if (!validateStep1() || !validateStep2()) return;

    const trimmedTitle = title.trim();
    const pts = parseInt(pointsRequired, 10);
    const discountVal = parseInt(discountValue, 10);
    const billAmount = parseInt(minBill, 10);
    const dailyCap = parseInt(dailyLimit, 10);
    if (minBill.trim() && (!billAmount || billAmount < 0)) {
      Alert.alert('Validation', 'Invalid minimum bill amount.');
      return;
    }
    if (dailyLimit.trim() && (!dailyCap || dailyCap < 1)) {
      Alert.alert('Validation', 'Redemption limit must be at least 1 if set.');
      return;
    }

    const finalType =
      offerKind === 'freebie' || offerKind === 'bogo' || offerKind === 'combo'
        ? 'freebie'
        : valueMode;

    const trimmedImageUrl = imageUrl.trim();

    const payload: {
      title: string;
      description?: string;
      discountType: string;
      discountValue: number;
      pointsRequired: number;
      minBillAmount?: number;
      dailyLimit?: number;
      couponCode?: string;
      validTill?: string;
      startDate?: string;
      isActive: boolean;
      imageUrl?: string;
      category?: string;
    } = {
      title: trimmedTitle,
      description: [description.trim(), terms.trim()].filter(Boolean).join('\n\n') || undefined,
      discountType: finalType,
      discountValue: finalType === 'freebie' ? 0 : discountVal,
      pointsRequired: pts,
      minBillAmount: minBill.trim() ? billAmount : undefined,
      dailyLimit: dailyLimit.trim() ? dailyCap : undefined,
      couponCode: couponCode.trim().toUpperCase() || undefined,
      validTill: new Date(validTill.trim()).toISOString(),
      startDate: new Date(startDate.trim()).toISOString(),
      isActive,
      imageUrl: trimmedImageUrl || undefined,
      category: currentVendor.category || undefined,
    };

    setSaving(true);
    try {
      if (DEV_FLAGS.USE_SERVER_API) {
        const ok = await apiClient.ensureAuth();
        if (!ok || !apiClient.getToken()) {
          Alert.alert('Session Expired', 'Please log out and sign in again as a vendor to create offers.');
          return;
        }

        if (isEditing && offerId) {
          const updated = await vendorsApi.updateOffer(offerId, payload);
          createVendorOffer({
            id: offerId,
            vendorId: currentVendor.id,
            offerTitle: updated?.title || trimmedTitle,
            offerDescription: updated?.description || description.trim(),
            discountType: normalizeType(updated?.discountType || finalType),
            discountValue: updated?.discountValue ?? payload.discountValue,
            pointsRequired: updated?.pointsRequired ?? pts,
            minBillAmount: updated?.minBillAmount ?? payload.minBillAmount,
            dailyLimit: updated?.dailyLimit ?? payload.dailyLimit,
            couponCode: updated?.couponCode ?? payload.couponCode,
            startDate: updated?.startDate ?? payload.startDate,
            validTill: updated?.validTill ?? payload.validTill,
            isActive: updated?.isActive ?? isActive,
            imageUrl: updated?.imageUrl ?? payload.imageUrl,
            createdAt: existing?.createdAt || new Date().toISOString(),
            currentRedemptions: existing?.currentRedemptions ?? 0,
          });
        } else {
          const created = await vendorsApi.createOffer(payload);
          if (created?.id) {
            const mapped: VendorOffer = {
              id: created.id,
              vendorId: created.vendorId || currentVendor.id,
              offerTitle: created.title || trimmedTitle,
              offerDescription: created.description || description.trim(),
              discountType: normalizeType(created.discountType || finalType),
              discountValue: created.discountValue ?? payload.discountValue,
              pointsRequired: created.pointsRequired ?? pts,
              minBillAmount: created.minBillAmount ?? payload.minBillAmount,
              dailyLimit: created.dailyLimit ?? payload.dailyLimit,
              couponCode: created.couponCode ?? payload.couponCode,
              startDate: created.startDate ?? payload.startDate,
              validTill: created.validTill ?? payload.validTill,
              isActive: created.isActive ?? true,
              imageUrl: created.imageUrl ?? payload.imageUrl,
              createdAt: created.createdAt || new Date().toISOString(),
              currentRedemptions: created.currentRedemptions ?? 0,
            };
            createVendorOffer(mapped);
            if (!isActive) {
              try {
                await vendorsApi.pauseOffer(created.id);
                createVendorOffer({ ...mapped, isActive: false });
              } catch {
                /* optional */
              }
            }
          } else {
            throw new Error('Offer was not created. Please try again.');
          }
        }
      } else {
        const local: VendorOffer = {
          id: offerId || `offer_${currentVendor.id}_${Date.now()}`,
          vendorId: currentVendor.id,
          offerTitle: trimmedTitle,
          offerDescription: description.trim(),
          discountType: finalType,
          discountValue: payload.discountValue,
          pointsRequired: pts,
          minBillAmount: payload.minBillAmount,
          dailyLimit: payload.dailyLimit,
          couponCode: payload.couponCode,
          startDate: payload.startDate,
          validTill: payload.validTill,
          isActive,
          imageUrl: payload.imageUrl,
          createdAt: existing?.createdAt || new Date().toISOString(),
        };
        createVendorOffer(local);
      }

      Alert.alert(isEditing ? 'Offer Updated' : 'Offer Created', isEditing ? 'Changes saved.' : 'Offer created successfully.', [
        { text: 'OK', onPress: onBack },
      ]);
    } catch (err: any) {
      const msg = err?.message || '';
      const fieldErrors = Array.isArray(err?.data?.errors)
        ? err.data.errors.map((e: any) => `${e.field || 'field'}: ${e.message}`).join('\n')
        : '';
      if (err?.status === 429 || /too many requests/i.test(msg)) {
        Alert.alert('Please wait', 'The server is rate-limiting requests. Wait about a minute, then try again.');
      } else if (err?.status === 401 || /authentication required|valid token|expired token/i.test(msg)) {
        Alert.alert('Session Expired', 'Your login session expired. Please log out and sign in again.');
      } else if (err?.status === 403 || err?.code === 'PLAN_LIMIT_REACHED') {
        Alert.alert('Upgrade plan', msg || 'Your current plan does not allow more offers.', [
          { text: 'Not now', style: 'cancel' },
          { text: 'Upgrade Plan', onPress: () => navigation.navigate('VendorSubscription') },
        ]);
      } else if (err?.status === 400 || /validation failed/i.test(msg)) {
        Alert.alert('Validation failed', fieldErrors || msg || 'Please check offer fields and try again.');
      } else {
        Alert.alert('Error', fieldErrors || msg || `Failed to ${isEditing ? 'update' : 'create'} offer.`);
      }
    } finally {
      setSaving(false);
    }
  };

  const steps = [
    { n: 1 as Step, label: 'Offer Details' },
    { n: 2 as Step, label: 'Validity & Time' },
    { n: 3 as Step, label: 'Review & Publish' },
  ];

  const offerKinds: { key: OfferKind; icon: string; title: string; sub: string }[] = [
    { key: 'discount', icon: 'percent', title: 'Discount', sub: 'Flat or % off' },
    { key: 'bogo', icon: 'swap-horizontal', title: 'Buy X Get Y', sub: 'Buy & Get' },
    { key: 'freebie', icon: 'bag-handle-outline', title: 'Free Item', sub: 'Free item with purchase' },
    { key: 'combo', icon: 'gift-outline', title: 'Combo Offer', sub: 'Combo deals' },
  ];

  return (
    <View style={[styles.container, { paddingTop: Math.max(insets.top, 16) }]}>
      <StatusBar barStyle="dark-content" backgroundColor={C.bg} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={goBack} style={styles.headerBtn} hitSlop={8}>
            <MaterialIcons name="arrow-back" size={24} color={C.deep} />
          </TouchableOpacity>
          <Text style={styles.title}>{isEditing ? 'Edit Offer' : 'Create Offer'}</Text>
          <View style={styles.headerBtn} />
        </View>

        {/* Stepper */}
        <View style={styles.stepper}>
          {steps.map((s, i) => {
            const done = step > s.n;
            const active = step === s.n;
            return (
              <React.Fragment key={s.n}>
                <View style={styles.stepItem}>
                  <View style={[styles.stepDot, (active || done) && styles.stepDotActive]}>
                    {done ? (
                      <Ionicons name="checkmark" size={14} color="#fff" />
                    ) : (
                      <Text style={[styles.stepNum, active && styles.stepNumActive]}>{s.n}</Text>
                    )}
                  </View>
                  <Text style={[styles.stepLabel, (active || done) && styles.stepLabelActive]} numberOfLines={1}>
                    {s.label}
                  </Text>
                </View>
                {i < steps.length - 1 ? (
                  <View style={[styles.stepLine, step > s.n && styles.stepLineActive]} />
                ) : null}
              </React.Fragment>
            );
          })}
        </View>

        <ScrollView
          style={styles.flex}
          contentContainerStyle={{
            paddingHorizontal: VendorUI.space.screen,
            paddingBottom: contentPadBottom + 100,
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {step === 1 ? (
            <>
              <Text style={styles.pageSub}>Create exciting offers to attract more tourists.</Text>

              <Text style={styles.sectionLabel}>Offer Type</Text>
              <View style={styles.kindRow}>
                {offerKinds.map((k) => {
                  const active = offerKind === k.key;
                  return (
                    <TouchableOpacity
                      key={k.key}
                      style={[styles.kindCard, active && styles.kindCardActive]}
                      onPress={() => selectOfferKind(k.key)}
                      activeOpacity={0.85}
                    >
                      <View style={[styles.kindIcon, active && styles.kindIconActive]}>
                        <Ionicons name={k.icon as any} size={18} color={active ? C.gold : C.muted} />
                      </View>
                      <Text style={[styles.kindTitle, active && styles.kindTitleActive]} numberOfLines={1}>
                        {k.title}
                      </Text>
                      <Text style={styles.kindSub} numberOfLines={2}>{k.sub}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={styles.fieldHead}>
                <Text style={styles.sectionLabel}>Offer Title *</Text>
                <Text style={styles.counter}>{title.length}/60</Text>
              </View>
              <TextInput
                style={styles.input}
                placeholder="E.g. 25% OFF on All Beverages"
                placeholderTextColor={C.mutedLight}
                value={title}
                onChangeText={(t) => setTitle(t.slice(0, 60))}
              />

              <View style={styles.fieldHead}>
                <Text style={styles.sectionLabel}>Offer Description *</Text>
                <Text style={styles.counter}>{description.length}/250</Text>
              </View>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="Describe your offer in detail..."
                placeholderTextColor={C.mutedLight}
                value={description}
                onChangeText={(t) => setDescription(t.slice(0, 250))}
                multiline
              />

              <Text style={styles.sectionLabel}>Offer Image</Text>
              <View style={styles.imageRow}>
                <TouchableOpacity
                  style={styles.uploadBox}
                  onPress={pickImage}
                  disabled={uploading}
                  activeOpacity={0.85}
                >
                  {uploading ? (
                    <ActivityIndicator size="small" color={C.bronze} />
                  ) : (
                    <Ionicons name="image-outline" size={22} color={C.bronze} />
                  )}
                  <Text style={styles.uploadText}>{uploading ? 'Uploading…' : 'Upload Image'}</Text>
                  <Text style={styles.uploadHint}>JPG, PNG up to 5MB</Text>
                </TouchableOpacity>
                <View style={styles.previewBox}>
                  {imageUrl ? (
                    <Image source={{ uri: imageUrl }} style={styles.previewImg} />
                  ) : (
                    <View style={styles.previewEmpty}>
                      <Text style={styles.previewLabel}>Preview</Text>
                    </View>
                  )}
                  {imageUrl ? (
                    <TouchableOpacity style={styles.clearImg} onPress={() => setImageUrl('')}>
                      <Ionicons name="close" size={12} color="#fff" />
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>
              {!showUrlFallback ? (
                <TouchableOpacity onPress={() => setShowUrlFallback(true)} style={styles.urlFallbackLink}>
                  <Text style={styles.urlFallbackText}>Use image URL instead</Text>
                </TouchableOpacity>
              ) : (
                <TextInput
                  style={styles.input}
                  placeholder="Paste image URL (fallback)"
                  placeholderTextColor={C.mutedLight}
                  value={imageUrl}
                  onChangeText={setImageUrl}
                  autoCapitalize="none"
                />
              )}

              {offerKind === 'discount' ? (
                <>
                  <Text style={styles.sectionLabel}>Offer Value *</Text>
                  <View style={styles.valueTabs}>
                    {([
                      { key: 'percentage' as ValueMode, label: '% Discount' },
                      { key: 'flat' as ValueMode, label: 'Flat Amount' },
                    ]).map((t) => (
                      <TouchableOpacity
                        key={t.key}
                        style={[styles.valueTab, valueMode === t.key && styles.valueTabActive]}
                        onPress={() => {
                          setValueMode(t.key);
                          setDiscountType(t.key);
                        }}
                      >
                        <Text style={[styles.valueTabText, valueMode === t.key && styles.valueTabTextActive]}>
                          {t.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <View style={styles.valueInputWrap}>
                    <TextInput
                      style={[styles.input, { flex: 1, marginBottom: 0 }]}
                      placeholder={valueMode === 'percentage' ? '25' : '100'}
                      placeholderTextColor={C.mutedLight}
                      value={discountValue}
                      onChangeText={setDiscountValue}
                      keyboardType="numeric"
                    />
                    <Text style={styles.valueSuffix}>{valueMode === 'percentage' ? '%' : '₹'}</Text>
                  </View>
                  <Text style={styles.helper}>
                    {valueMode === 'percentage'
                      ? `Customers will get ${discountValue || '0'}% discount`
                      : `Customers will get ₹${discountValue || '0'} off`}
                  </Text>
                </>
              ) : null}

              <Text style={styles.sectionLabel}>PalPoints Required *</Text>
              <View style={styles.iconInput}>
                <PalPointsIcon size={18} />
                <TextInput
                  style={styles.iconInputField}
                  placeholder="200 pts"
                  placeholderTextColor={C.mutedLight}
                  value={pointsRequired}
                  onChangeText={setPointsRequired}
                  keyboardType="numeric"
                />
              </View>
              <Text style={styles.helper}>Points customer needs to redeem this offer</Text>

              <Text style={styles.sectionLabel}>Minimum Bill (Optional)</Text>
              <View style={styles.iconInput}>
                <Text style={styles.rupee}>₹</Text>
                <TextInput
                  style={styles.iconInputField}
                  placeholder="300"
                  placeholderTextColor={C.mutedLight}
                  value={minBill}
                  onChangeText={setMinBill}
                  keyboardType="numeric"
                />
              </View>
              <Text style={styles.helper}>Minimum bill amount to avail this offer</Text>
            </>
          ) : null}

          {step === 2 ? (
            <>
              <Text style={styles.sectionLabel}>Validity Period</Text>
              <View style={styles.dateRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldMini}>Start Date</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={C.mutedLight}
                    value={startDate}
                    onChangeText={setStartDate}
                  />
                  <View style={styles.presetRow}>
                    {DATE_PRESETS.map((p) => (
                      <TouchableOpacity
                        key={`start-${p.label}`}
                        style={[styles.presetChip, startDate === dateFromOffset(p.offset) && styles.presetChipActive]}
                        onPress={() => setStartDate(dateFromOffset(p.offset))}
                      >
                        <Text style={[styles.presetChipText, startDate === dateFromOffset(p.offset) && styles.presetChipTextActive]}>
                          {p.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldMini}>End Date</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={C.mutedLight}
                    value={validTill}
                    onChangeText={setValidTill}
                  />
                  <View style={styles.presetRow}>
                    {DATE_PRESETS.map((p) => (
                      <TouchableOpacity
                        key={`end-${p.label}`}
                        style={[styles.presetChip, validTill === dateFromOffset(p.offset) && styles.presetChipActive]}
                        onPress={() => setValidTill(dateFromOffset(p.offset))}
                      >
                        <Text style={[styles.presetChipText, validTill === dateFromOffset(p.offset) && styles.presetChipTextActive]}>
                          {p.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              </View>
              {activeDays > 0 ? (
                <View style={styles.infoBanner}>
                  <Ionicons name="calendar-outline" size={14} color={C.bronze} />
                  <Text style={styles.infoBannerText}>Offer will be active for {activeDays} days</Text>
                </View>
              ) : null}

              <View style={styles.switchRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.switchTitle}>Time Slot (Optional)</Text>
                  <Text style={styles.helper}>Restrict offer to specific hours</Text>
                </View>
                <Switch
                  value={useTimeSlot}
                  onValueChange={setUseTimeSlot}
                  trackColor={{ false: C.border, true: C.gold }}
                  thumbColor="#fff"
                />
              </View>
              {useTimeSlot ? (
                <>
                  <View style={styles.dateRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.fieldMini}>Start Time</Text>
                      <TextInput style={styles.input} value={startTime} onChangeText={setStartTime} />
                      <View style={styles.presetRow}>
                        {START_TIME_PRESETS.map((t) => (
                          <TouchableOpacity
                            key={`start-${t}`}
                            style={[styles.presetChip, startTime === t && styles.presetChipActive]}
                            onPress={() => setStartTime(t)}
                          >
                            <Text style={[styles.presetChipText, startTime === t && styles.presetChipTextActive]}>{t}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.fieldMini}>End Time</Text>
                      <TextInput style={styles.input} value={endTime} onChangeText={setEndTime} />
                      <View style={styles.presetRow}>
                        {END_TIME_PRESETS.map((t) => (
                          <TouchableOpacity
                            key={`end-${t}`}
                            style={[styles.presetChip, endTime === t && styles.presetChipActive]}
                            onPress={() => setEndTime(t)}
                          >
                            <Text style={[styles.presetChipText, endTime === t && styles.presetChipTextActive]}>{t}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  </View>
                  <View style={styles.infoBanner}>
                    <Ionicons name="time-outline" size={14} color={C.bronze} />
                    <Text style={styles.infoBannerText}>
                      {selectedDays.length === 7 ? 'Offer available all days' : `Available on ${selectedDays.join(', ')}`}
                    </Text>
                  </View>
                </>
              ) : null}

              <Text style={styles.sectionLabel}>Applicable Days</Text>
              <View style={styles.daysRow}>
                {DAYS.map((d) => {
                  const on = selectedDays.includes(d);
                  return (
                    <TouchableOpacity
                      key={d}
                      style={[styles.dayChip, on && styles.dayChipActive]}
                      onPress={() => toggleDay(d)}
                    >
                      <Text style={[styles.dayText, on && styles.dayTextActive]}>{d}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={styles.fieldHead}>
                <Text style={styles.sectionLabel}>Terms & Conditions</Text>
                <Text style={styles.counter}>{terms.length}/300</Text>
              </View>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={terms}
                onChangeText={(t) => setTerms(t.slice(0, 300))}
                multiline
                placeholderTextColor={C.mutedLight}
              />

              <Text style={styles.sectionLabel}>Redemption Limit (Optional)</Text>
              <View style={styles.iconInput}>
                <Ionicons name="hourglass-outline" size={16} color={C.bronze} />
                <TextInput
                  style={styles.iconInputField}
                  placeholder="100 times"
                  placeholderTextColor={C.mutedLight}
                  value={dailyLimit}
                  onChangeText={setDailyLimit}
                  keyboardType="numeric"
                />
              </View>
              <Text style={styles.helper}>Leave empty for unlimited redemptions</Text>

              <Text style={styles.sectionLabel}>What the customer sees</Text>
              <View style={styles.previewCard}>
                <View style={styles.previewThumbWrap}>
                  {imageUrl ? (
                    <Image source={{ uri: imageUrl }} style={styles.previewThumb} />
                  ) : (
                    <View style={[styles.previewThumb, styles.previewThumbEmpty]}>
                      <MaterialCommunityIcons name="food" size={28} color={C.bronze} />
                    </View>
                  )}
                  <View style={styles.previewBadge}>
                    <Text style={styles.previewBadgeText}>{discountLabel}</Text>
                  </View>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.previewTitle} numberOfLines={2}>
                    {title.trim() || 'Your offer title'}
                  </Text>
                  <View style={styles.previewMeta}>
                    <PalPointsIcon size={12} />
                    <Text style={styles.previewMetaText}>{pointsRequired || '0'} pts</Text>
                  </View>
                  {minBill ? (
                    <Text style={styles.previewMetaText}>Min. Bill: ₹{minBill}</Text>
                  ) : null}
                  <Text style={styles.previewMetaText}>
                    {startDate || '—'} - {validTill || '—'}
                  </Text>
                  {useTimeSlot ? (
                    <Text style={styles.previewMetaText}>
                      {startTime} - {endTime}
                    </Text>
                  ) : null}
                  {activeDays > 0 ? (
                    <View style={styles.activePill}>
                      <Text style={styles.activePillText}>Active for {activeDays} days</Text>
                    </View>
                  ) : null}
                </View>
              </View>
            </>
          ) : null}

          {step === 3 ? (
            <>
              <Text style={styles.pageSub}>Review your offer before publishing.</Text>
              <View style={styles.reviewCard}>
                <Text style={styles.reviewLabel}>Title</Text>
                <Text style={styles.reviewValue}>{title}</Text>
                <Text style={styles.reviewLabel}>Type</Text>
                <Text style={styles.reviewValue}>{discountLabel} · {offerKind}</Text>
                <Text style={styles.reviewLabel}>PalPoints</Text>
                <Text style={styles.reviewValue}>{pointsRequired} pts</Text>
                <Text style={styles.reviewLabel}>Validity</Text>
                <Text style={styles.reviewValue}>{startDate} → {validTill} ({activeDays} days)</Text>
                <Text style={styles.reviewLabel}>Schedule</Text>
                <Text style={styles.reviewValue}>
                  {useTimeSlot ? `${startTime} – ${endTime}` : 'All day'} · {selectedDays.length === 7 ? 'All days' : selectedDays.join(', ')}
                </Text>
              </View>

              <View style={styles.switchRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.switchTitle}>Publish immediately</Text>
                  <Text style={styles.helper}>Turn off to save as draft</Text>
                </View>
                <Switch
                  value={isActive}
                  onValueChange={setIsActive}
                  trackColor={{ false: C.border, true: C.gold }}
                  thumbColor="#fff"
                />
              </View>

              <TextInput
                style={styles.input}
                placeholder="Coupon Code (optional)"
                placeholderTextColor={C.mutedLight}
                value={couponCode}
                onChangeText={setCouponCode}
                autoCapitalize="characters"
              />
            </>
          ) : null}
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: Math.max(screenInsets.bottom, 12) }]}>
          {step < 3 ? (
            <TouchableOpacity style={styles.nextBtn} onPress={goNext} activeOpacity={0.88}>
              <Text style={styles.nextBtnText}>Continue</Text>
              <Ionicons name="arrow-forward" size={16} color="#fff" />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.nextBtn, saving && { opacity: 0.6 }]}
              onPress={handleSave}
              disabled={saving}
              activeOpacity={0.88}
            >
              <Text style={styles.nextBtnText}>
                {saving ? (isEditing ? 'Saving...' : 'Publishing...') : (isEditing ? 'Save Changes' : 'Publish Offer')}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: VendorUI.space.screen,
    paddingVertical: 10,
  },
  headerBtn: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '800', color: C.text },

  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  stepItem: { alignItems: 'center', width: 78 },
  stepDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: C.white,
    borderWidth: 1.5,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDotActive: { backgroundColor: C.deep, borderColor: C.deep },
  stepNum: { fontSize: 12, fontWeight: '800', color: C.muted },
  stepNumActive: { color: '#fff' },
  stepLabel: { fontSize: 9, fontWeight: '700', color: C.mutedLight, marginTop: 4, textAlign: 'center' },
  stepLabelActive: { color: C.deep },
  stepLine: { flex: 1, height: 2, backgroundColor: C.border, marginBottom: 16 },
  stepLineActive: { backgroundColor: C.gold },

  pageSub: { fontSize: 13, color: C.muted, marginBottom: 14, fontWeight: '500' },
  sectionLabel: { fontSize: 13, fontWeight: '800', color: C.text, marginBottom: 8, marginTop: 6 },
  fieldHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  counter: { fontSize: 11, fontWeight: '600', color: C.mutedLight },
  fieldMini: { fontSize: 11, fontWeight: '700', color: C.muted, marginBottom: 6 },

  kindRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  kindCard: {
    flex: 1,
    backgroundColor: C.white,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: C.border,
    padding: 10,
    alignItems: 'center',
    minHeight: 96,
  },
  kindCardActive: { borderColor: C.gold, backgroundColor: '#FFF9F0' },
  kindIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: C.soft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  kindIconActive: { backgroundColor: '#F5E6C8' },
  kindTitle: { fontSize: 11, fontWeight: '800', color: C.text, textAlign: 'center' },
  kindTitleActive: { color: C.deep },
  kindSub: { fontSize: 9, color: C.muted, textAlign: 'center', marginTop: 2, lineHeight: 12 },

  input: {
    backgroundColor: C.white,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
    color: C.text,
    fontSize: 14,
    borderWidth: 1,
    borderColor: C.border,
    minHeight: 48,
  },
  textArea: { height: 96, textAlignVertical: 'top', minHeight: 96 },
  helper: { fontSize: 11, color: C.muted, marginBottom: 12, marginTop: -4 },

  imageRow: { flexDirection: 'row', gap: 10, marginBottom: 8 },
  uploadBox: {
    flex: 1,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: C.border,
    borderRadius: 14,
    backgroundColor: C.white,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    gap: 4,
  },
  uploadText: { fontSize: 12, fontWeight: '700', color: C.deep },
  uploadHint: { fontSize: 10, color: C.mutedLight },
  previewBox: {
    width: 88,
    height: 88,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: C.soft,
    borderWidth: 1,
    borderColor: C.border,
  },
  previewImg: { width: '100%', height: '100%' },
  previewEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  previewLabel: { fontSize: 11, fontWeight: '700', color: C.muted },
  clearImg: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  urlFallbackLink: { marginBottom: 10, marginTop: -4 },
  urlFallbackText: { fontSize: 12, fontWeight: '700', color: C.bronze },

  presetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10, marginTop: -4 },
  presetChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.border,
  },
  presetChipActive: { backgroundColor: C.gold, borderColor: C.gold },
  presetChipText: { fontSize: 10, fontWeight: '800', color: C.muted },
  presetChipTextActive: { color: '#fff' },

  valueTabs: {
    flexDirection: 'row',
    backgroundColor: C.soft,
    borderRadius: 12,
    padding: 4,
    marginBottom: 10,
  },
  valueTab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  valueTabActive: { backgroundColor: C.white },
  valueTabText: { fontSize: 12, fontWeight: '700', color: C.muted },
  valueTabTextActive: { color: C.deep },
  valueInputWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  valueSuffix: { fontSize: 16, fontWeight: '800', color: C.deep, width: 24 },

  iconInput: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: C.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 14,
    minHeight: 48,
    marginBottom: 6,
  },
  iconInputField: { flex: 1, color: C.text, fontSize: 14, paddingVertical: 12 },
  rupee: { fontSize: 16, fontWeight: '800', color: C.bronze },

  dateRow: { flexDirection: 'row', gap: 10 },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: C.peach,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    marginTop: -2,
  },
  infoBannerText: { fontSize: 12, fontWeight: '700', color: C.deep },

  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: C.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    padding: 14,
    marginBottom: 12,
  },
  switchTitle: { fontSize: 14, fontWeight: '800', color: C.text },

  daysRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  dayChip: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayChipActive: { backgroundColor: C.gold, borderColor: C.gold },
  dayText: { fontSize: 11, fontWeight: '800', color: C.muted },
  dayTextActive: { color: '#fff' },

  previewCard: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: C.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    padding: 12,
    marginBottom: 12,
  },
  previewThumbWrap: { width: 88, height: 110, borderRadius: 12, overflow: 'hidden' },
  previewThumb: { width: '100%', height: '100%', backgroundColor: C.soft },
  previewThumbEmpty: { alignItems: 'center', justifyContent: 'center' },
  previewBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    backgroundColor: C.gold,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  previewBadgeText: { fontSize: 9, fontWeight: '800', color: '#fff' },
  previewTitle: { fontSize: 14, fontWeight: '800', color: C.text, marginBottom: 6 },
  previewMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 3 },
  previewMetaText: { fontSize: 11, color: C.muted, fontWeight: '600', marginBottom: 2 },
  activePill: {
    alignSelf: 'flex-start',
    backgroundColor: C.successBg,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginTop: 6,
  },
  activePillText: { fontSize: 10, fontWeight: '800', color: C.success },

  reviewCard: {
    backgroundColor: C.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    padding: 16,
    marginBottom: 14,
  },
  reviewLabel: { fontSize: 11, fontWeight: '700', color: C.mutedLight, marginTop: 8 },
  reviewValue: { fontSize: 14, fontWeight: '700', color: C.text, marginTop: 2 },

  footer: {
    paddingHorizontal: 16,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: C.border,
    backgroundColor: C.bg,
  },
  nextBtn: {
    backgroundColor: C.deep,
    borderRadius: 16,
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  nextBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});
