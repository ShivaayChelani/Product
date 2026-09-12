import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert, ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { riddlesApi, type Riddle } from '../services/api/riddles';
import { useLocationContext } from '../context/LocationContext';
import { TH, SERIF, SANS, SANS_BOLD, SANS_SEMI } from '../features/treasureHunt/theme';

type Lang = 'en' | 'hi';

export default function TreasureHuntActiveScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();

  // Guard params defensively
  const huntId: string | undefined = route?.params?.huntId;
  const riddleId: string | undefined = route?.params?.riddleId;

  const { effectivePosition } = useLocationContext();

  const [riddle, setRiddle] = useState<Riddle | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [answer, setAnswer] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [lang, setLang] = useState<Lang>('en');

  const loadData = useCallback(async () => {
    if (!huntId || !riddleId) {
      Alert.alert('Error', 'Invalid navigation parameters.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
      return;
    }
    setLoading(true);
    setLoadError(null);
    setAnswer('');
    try {
      if (!effectivePosition) {
        Alert.alert('Location Required', 'We need your location to verify you are in the hunt city.', [
          { text: 'OK', onPress: () => navigation.goBack() },
        ]);
        return;
      }
      const pos = effectivePosition;
      const riddleRes = await riddlesApi.getRiddle(huntId, riddleId, pos.latitude, pos.longitude);
      const data = riddleRes?.data;
      if (!data?.id) {
        throw new Error('Riddle data missing from server response.');
      }
      setRiddle(data);
    } catch (err: any) {
      const code = err?.code;
      const msg = typeof err?.message === 'string' ? err.message : 'Failed to load the riddle.';
      if (code === 'TREASURE_HUNT_CITY_MISMATCH') {
        Alert.alert('City Changed', msg, [
          { text: 'OK', onPress: () => navigation.navigate('TreasureHuntLanding') },
        ]);
      } else {
        setLoadError(msg);
      }
    } finally {
      setLoading(false);
    }
  }, [huntId, riddleId, effectivePosition, navigation]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleToggleLang = () => {
    setLang((l) => (l === 'en' ? 'hi' : 'en'));
  };

  const handleSubmit = async () => {
    const trimmed = answer.trim();
    if (!trimmed || submitting || !riddle?.id || !huntId) return;
    setSubmitting(true);
    try {
      const pos = effectivePosition;
      if (!pos) {
        Alert.alert('Location Required', 'We need your location to verify your answer.');
        return;
      }
      const res = await riddlesApi.submitAnswer(huntId, riddle.id, trimmed, lang, pos.latitude, pos.longitude);
      const data = res?.data;
      const correct = data?.correct === true;
      const rewardCoins = typeof data?.rewardCoins === 'number' ? data.rewardCoins : 0;

      // Navigate to daily result screen regardless of correct/wrong
      // The riddle is now locked for the rest of today
      navigation.replace('TreasureHuntSuccess', {
        huntId,
        correct,
        rewardCoins,
        city: undefined,
      });
    } catch (err: any) {
      const code = err?.code;
      const msg = typeof err?.message === 'string' ? err.message : 'Failed to submit your answer.';
      if (code === 'TREASURE_HUNT_CITY_MISMATCH') {
        Alert.alert('City Changed', msg, [
          { text: 'OK', onPress: () => navigation.navigate('TreasureHuntLanding') },
        ]);
      } else if (code === 'RIDDLE_OUT_OF_ORDER') {
        Alert.alert('Riddle Mismatch', msg, [
          { text: 'OK', onPress: () => navigation.navigate('TreasureHuntLanding') },
        ]);
      } else {
        Alert.alert('Error', msg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={TH.brown} />
        <Text style={styles.locatingText}>Loading today's riddle...</Text>
      </View>
    );
  }

  // ── Load error ───────────────────────────────────────────────────────────
  if (loadError || !riddle) {
    return (
      <View style={[styles.container, styles.center]}>
        <Icon name="alert-circle-outline" size={44} color={TH.gold} style={{ marginBottom: 16 }} />
        <Text style={styles.errorTitle}>Couldn't load riddle</Text>
        <Text style={styles.errorText}>{loadError || 'Unknown error. Please try again.'}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={loadData}>
          <Text style={styles.retryBtnText}>Try Again</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.backLink} onPress={() => navigation.goBack()}>
          <Text style={styles.backLinkText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Main riddle UI ───────────────────────────────────────────────────────
  const clueText = lang === 'hi' ? (riddle.clueHindi ?? '') : (riddle.clueEnglish ?? '');

  return (
    <KeyboardAvoidingView
      style={styles.flex1}
      behavior={Platform.OS === 'ios' ? 'padding' : (Platform.Version as number) >= 35 ? 'height' : undefined}
    >
      <View style={styles.container}>
        <View style={[styles.header, { paddingTop: Math.max(insets.top, 10) }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconBtn}>
            <Icon name="chevron-back" size={26} color={TH.text} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Treasure Hunt</Text>
            <Text style={styles.headerSub}>Daily Challenge</Text>
          </View>
          <View style={styles.iconBtn} />
        </View>

        <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {/* Riddle card */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Icon name="extension-puzzle" size={22} color={TH.gold} />
              <Text style={styles.cardTitle}>Solve the Clue</Text>
            </View>
            <View style={styles.divider} />
            <Text style={styles.clueText}>{clueText}</Text>
          </View>

          {/* Language toggle */}
          <View style={styles.langToggle}>
            <TouchableOpacity
              style={[styles.langOption, lang === 'en' && styles.langOptionActive]}
              onPress={() => setLang('en')}
            >
              <Text style={[styles.langOptionText, lang === 'en' && styles.langOptionTextActive]}>English</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.langOption, lang === 'hi' && styles.langOptionActive]}
              onPress={() => setLang('hi')}
            >
              <Text style={[styles.langOptionText, lang === 'hi' && styles.langOptionTextActive]}>हिंदी</Text>
            </TouchableOpacity>
          </View>

          {/* Answer input */}
          <View style={styles.inputCard}>
            <Text style={styles.inputLabel}>Enter the name of the place.</Text>
            <TextInput
              style={styles.input}
              placeholder="Your answer..."
              placeholderTextColor={TH.textMuted}
              value={answer}
              onChangeText={setAnswer}
              returnKeyType="send"
              onSubmitEditing={handleSubmit}
              autoCapitalize="words"
              autoCorrect={false}
              editable={!submitting}
            />
          </View>
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 20) }]}>
          <TouchableOpacity
            style={[styles.submitBtn, (!answer.trim() || submitting) && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={!answer.trim() || submitting}
          >
            {submitting ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <>
                <Text style={styles.submitBtnText}>Submit Answer</Text>
                <Icon name="checkmark-circle-outline" size={20} color="#FFF" />
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  center: { justifyContent: 'center', alignItems: 'center', padding: 24 },
  container: { flex: 1, backgroundColor: TH.bg },
  scroll: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  iconBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { fontFamily: SANS_BOLD, fontSize: 16, color: TH.text },
  headerSub: { fontFamily: SANS, fontSize: 11, color: TH.textSecondary, marginTop: 1 },
  content: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: TH.card,
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: TH.border,
    ...TH.shadow,
    marginBottom: 16,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  cardTitle: { fontFamily: SANS_BOLD, fontSize: 16, color: TH.text, marginLeft: 10 },
  divider: { height: 1, backgroundColor: TH.border, marginBottom: 20 },
  clueText: { fontFamily: SERIF, fontSize: 22, lineHeight: 32, color: TH.text, textAlign: 'center' },
  langToggle: {
    flexDirection: 'row',
    alignSelf: 'center',
    backgroundColor: TH.cream,
    borderRadius: 10,
    padding: 3,
    marginBottom: 16,
  },
  langOption: { paddingVertical: 7, paddingHorizontal: 18, borderRadius: 8 },
  langOptionActive: { backgroundColor: TH.card, ...TH.shadow },
  langOptionText: { fontFamily: SANS_SEMI, fontSize: 12, color: TH.textSecondary },
  langOptionTextActive: { color: TH.brown },
  inputCard: {
    backgroundColor: TH.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: TH.border,
    padding: 18,
  },
  inputLabel: { fontFamily: SANS_BOLD, fontSize: 13, color: TH.brown, marginBottom: 12 },
  input: {
    backgroundColor: TH.bg,
    borderWidth: 1,
    borderColor: TH.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 16,
    color: TH.text,
    fontFamily: SANS,
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: TH.border,
  },
  submitBtn: {
    backgroundColor: TH.brown,
    borderRadius: 16,
    paddingVertical: 17,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    ...TH.shadow,
  },
  submitBtnDisabled: { backgroundColor: TH.textMuted, shadowOpacity: 0, elevation: 0 },
  submitBtnText: { fontFamily: SANS_BOLD, color: '#FFF', fontSize: 16, marginRight: 8 },
  locatingText: { fontFamily: SANS, fontSize: 14, color: TH.textSecondary, marginTop: 16 },
  errorTitle: { fontFamily: SERIF, fontSize: 22, color: TH.text, textAlign: 'center', marginBottom: 8 },
  errorText: { fontFamily: SANS, fontSize: 13, color: TH.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  retryBtn: {
    backgroundColor: TH.brown,
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 28,
    marginBottom: 12,
  },
  retryBtnText: { fontFamily: SANS_BOLD, color: '#FFF', fontSize: 14 },
  backLink: { paddingVertical: 8 },
  backLinkText: { fontFamily: SANS, fontSize: 13, color: TH.textSecondary, textDecorationLine: 'underline' },
});
