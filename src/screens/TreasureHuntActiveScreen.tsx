import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, KeyboardAvoidingView, Platform, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { riddlesApi, Riddle, TreasureHunt, NextRiddle } from '../services/api/riddles';
import { useLocationContext } from '../context/LocationContext';
import Animated, { FadeInUp, FadeIn, ZoomIn } from 'react-native-reanimated';
import { TH, SERIF, SANS, SANS_BOLD, SANS_SEMI } from '../features/treasureHunt/theme';

type Lang = 'en' | 'hi';

export default function TreasureHuntActiveScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { huntId, riddleId } = route.params;
  const { effectivePosition } = useLocationContext();

  const [hunt, setHunt] = useState<TreasureHunt | null>(null);
  const [riddle, setRiddle] = useState<Riddle | null>(null);
  const [loading, setLoading] = useState(true);
  const [answer, setAnswer] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [lang, setLang] = useState<Lang>('en');
  const [wrong, setWrong] = useState(false);

  const [celebrated, setCelebrated] = useState<{
    rewardCoins: number;
    huntCompleteReward: number;
    nextRiddle: NextRiddle | null;
    huntCompleted: boolean;
  } | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setWrong(false);
    setCelebrated(null);
    setAnswer('');
    try {
      if (!effectivePosition) {
        Alert.alert('Location Required', 'We need your location to verify you are in the hunt city.');
        navigation.goBack();
        return;
      }
      const pos = effectivePosition;
      const huntRes = await riddlesApi.getHuntDetails(huntId, pos.latitude, pos.longitude);
      setHunt(huntRes.data);

      const meta = huntRes.data.riddles || [];
      let targetId = riddleId;
      if (riddleId === 'first') {
        targetId = meta[0]?.id;
      }
      if (!targetId) {
        Alert.alert('No Riddles', 'This hunt has no riddles yet. Please check back later.');
        navigation.goBack();
        return;
      }

      const riddleRes = await riddlesApi.getRiddle(huntId, targetId, pos.latitude, pos.longitude);
      setRiddle(riddleRes.data);
    } catch (err: any) {
      const code = err?.code;
      const msg = err?.message || 'Failed to load the riddle.';
      if (code === 'TREASURE_HUNT_CITY_MISMATCH') {
        Alert.alert('City Changed', msg, [{ text: 'OK', onPress: () => navigation.navigate('TreasureHuntLanding') }]);
      } else {
        Alert.alert('Error', msg, [{ text: 'OK', onPress: () => navigation.goBack() }]);
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
    if (!trimmed || submitting) return;
    if (!riddle) return;
    setSubmitting(true);
    setWrong(false);
    try {
      const pos = effectivePosition;
      if (!pos) {
        Alert.alert('Location Required', 'We need your location to verify your answer.');
        setSubmitting(false);
        return;
      }
      const res = await riddlesApi.submitAnswer(huntId, riddle.id, trimmed, lang, pos.latitude, pos.longitude);
      const data = res.data;
      if (data.correct) {
        setCelebrated({
          rewardCoins: data.rewardCoins,
          huntCompleteReward: data.huntCompleteReward,
          nextRiddle: data.nextRiddle,
          huntCompleted: data.huntCompleted,
        });
        setAnswer('');
      } else {
        setWrong(true);
      }
    } catch (err: any) {
      const code = err?.code;
      const msg = err?.message || 'Failed to submit your answer.';
      if (code === 'TREASURE_HUNT_CITY_MISMATCH') {
        Alert.alert('City Changed', msg, [{ text: 'OK', onPress: () => navigation.navigate('TreasureHuntLanding') }]);
      } else {
        Alert.alert('Error', msg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleNext = () => {
    if (!celebrated) return;
    if (celebrated.huntCompleted) {
      navigation.replace('TreasureHuntSuccess', {
        huntId,
        rewardCoins: celebrated.huntCompleteReward,
        completed: true,
        city: hunt?.city,
      });
    } else if (celebrated.nextRiddle) {
      navigation.replace('TreasureHuntActive', { huntId, riddleId: celebrated.nextRiddle.id });
    }
  };

  if (loading || !hunt || !riddle) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={TH.brown} />
      </View>
    );
  }

  const totalRiddles = hunt.riddles?.length || 0;
  const progressPct = totalRiddles > 0 ? Math.min(100, (riddle.sequence / totalRiddles) * 100) : 0;

  return (
    <KeyboardAvoidingView style={styles.flex1} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.container}>
        <View style={[styles.header, { paddingTop: Math.max(insets.top, 10) }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconBtn}>
            <Icon name="close" size={24} color={TH.text} />
          </TouchableOpacity>
          <View style={styles.progressContainer}>
            <Text style={styles.progressText}>
              Riddle {riddle.sequence} of {totalRiddles}
            </Text>
            <View style={styles.progressBarBg}>
              <Animated.View style={[styles.progressBarFill, { width: `${progressPct}%` }]} />
            </View>
          </View>
          <TouchableOpacity style={styles.iconBtn}>
            <Icon name="help-circle-outline" size={22} color={TH.textMuted} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Animated.View entering={FadeInUp.duration(400).springify()} style={styles.card}>
            <View style={styles.cardHeader}>
              <Icon name="extension-puzzle" size={22} color={TH.gold} />
              <Text style={styles.cardTitle}>Solve the Clue</Text>
            </View>
            <View style={styles.divider} />
            <Text style={styles.clueText}>{lang === 'en' ? riddle.clueEnglish : riddle.clueHindi}</Text>
          </Animated.View>

          <View style={styles.langToggle}>
            <TouchableOpacity
              style={[styles.langOption, lang === 'en' && styles.langOptionActive]}
              onPress={handleToggleLang}
            >
              <Text style={[styles.langOptionText, lang === 'en' && styles.langOptionTextActive]}>English</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.langOption, lang === 'hi' && styles.langOptionActive]}
              onPress={handleToggleLang}
            >
              <Text style={[styles.langOptionText, lang === 'hi' && styles.langOptionTextActive]}>हिंदी</Text>
            </TouchableOpacity>
          </View>

          <Animated.View entering={FadeInUp.delay(150).duration(400).springify()} style={styles.inputCard}>
            <Text style={styles.inputLabel}>Your Answer</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter your answer..."
              placeholderTextColor={TH.textMuted}
              value={answer}
              onChangeText={(t) => { setAnswer(t); setWrong(false); }}
              returnKeyType="send"
              onSubmitEditing={handleSubmit}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {wrong && (
              <Animated.View entering={FadeIn.duration(250)} style={styles.wrongRow}>
                <Text style={styles.wrongText}>❌ Not quite! Try again.</Text>
              </Animated.View>
            )}
          </Animated.View>
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

        {celebrated && (
          <View style={styles.overlay}>
            <View style={styles.overlayCard}>
              <View style={styles.overlayBadge}>
                <View style={styles.overlayCircle}>
                  <Icon name="sparkles" size={40} color={TH.brownDark} />
                </View>
              </View>
              <Text style={styles.overlayTitle}>✨ CORRECT! ✨</Text>
              <Text style={styles.overlaySubtitle}>
                {celebrated.huntCompleted ? 'You solved every clue!' : 'You solved the clue!'}
              </Text>
              <View style={styles.overlayReward}>
                <Icon name="logo-bitcoin" size={24} color={TH.gold} />
                <View style={styles.overlayRewardBlock}>
                  <Text style={styles.overlayRewardText}>
                    +{celebrated.rewardCoins} Coins
                  </Text>
                  {celebrated.huntCompleted && celebrated.huntCompleteReward > 0 && (
                    <Text style={styles.overlayRewardSub}>
                      +{celebrated.huntCompleteReward} Coins completion bonus
                    </Text>
                  )}
                </View>
              </View>
              <TouchableOpacity style={styles.nextBtn} onPress={handleNext}>
                <Text style={styles.nextBtnText}>
                  {celebrated.huntCompleted ? 'See Results' : 'Next Riddle'}
                </Text>
                <Icon name="arrow-forward" size={18} color="#FFF" />
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  container: {
    flex: 1,
    backgroundColor: TH.bg,
  },
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
  progressContainer: {
    flex: 1,
    marginHorizontal: 12,
    alignItems: 'center',
  },
  progressText: {
    fontFamily: SANS_BOLD,
    fontSize: 12,
    color: TH.brown,
    marginBottom: 6,
  },
  progressBarBg: {
    height: 6,
    width: '100%',
    backgroundColor: TH.border,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: TH.brown,
    borderRadius: 3,
  },
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
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  cardTitle: {
    fontFamily: SANS_BOLD,
    fontSize: 16,
    color: TH.text,
    marginLeft: 10,
  },
  divider: {
    height: 1,
    backgroundColor: TH.border,
    marginBottom: 20,
  },
  clueText: {
    fontFamily: SERIF,
    fontSize: 22,
    lineHeight: 32,
    color: TH.text,
    textAlign: 'center',
  },
  langToggle: {
    flexDirection: 'row',
    alignSelf: 'center',
    backgroundColor: TH.cream,
    borderRadius: 10,
    padding: 3,
    marginBottom: 16,
  },
  langOption: {
    paddingVertical: 7,
    paddingHorizontal: 18,
    borderRadius: 8,
  },
  langOptionActive: {
    backgroundColor: TH.card,
    ...TH.shadow,
  },
  langOptionText: {
    fontFamily: SANS_SEMI,
    fontSize: 12,
    color: TH.textSecondary,
  },
  langOptionTextActive: {
    color: TH.brown,
  },
  inputCard: {
    backgroundColor: TH.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: TH.border,
    padding: 18,
  },
  inputLabel: {
    fontFamily: SANS_BOLD,
    fontSize: 13,
    color: TH.brown,
    marginBottom: 12,
  },
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
  wrongRow: {
    marginTop: 12,
    backgroundColor: TH.cream,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  wrongText: {
    fontFamily: SANS_SEMI,
    fontSize: 13,
    color: '#B3261E',
    textAlign: 'center',
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
  submitBtnDisabled: {
    backgroundColor: TH.textMuted,
    shadowOpacity: 0,
    elevation: 0,
  },
  submitBtnText: {
    fontFamily: SANS_BOLD,
    color: '#FFF',
    fontSize: 16,
    marginRight: 8,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(252, 249, 242, 0.96)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 28,
  },
  overlayCard: {
    width: '100%',
    backgroundColor: TH.card,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: TH.border,
    padding: 28,
    alignItems: 'center',
    ...TH.shadow,
  },
  overlayBadge: {
    marginBottom: 16,
  },
  overlayCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: TH.gold,
    justifyContent: 'center',
    alignItems: 'center',
  },
  overlayTitle: {
    fontFamily: SERIF,
    fontSize: 28,
    color: TH.text,
    marginBottom: 8,
  },
  overlaySubtitle: {
    fontFamily: SANS,
    fontSize: 14,
    color: TH.textSecondary,
    marginBottom: 18,
  },
  overlayReward: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: TH.cream,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 20,
    marginBottom: 22,
  },
  overlayRewardBlock: {
    alignItems: 'center',
  },
  overlayRewardSub: {
    fontFamily: SANS_SEMI,
    fontSize: 12,
    color: TH.textSecondary,
    marginTop: 2,
  },
  overlayRewardText: {
    fontFamily: SANS_BOLD,
    fontSize: 20,
    color: TH.text,
  },
  nextBtn: {
    backgroundColor: TH.brown,
    borderRadius: 14,
    paddingVertical: 15,
    paddingHorizontal: 30,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
  },
  nextBtnText: {
    fontFamily: SANS_BOLD,
    color: '#FFF',
    fontSize: 15,
  },
});