import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, TextInput, KeyboardAvoidingView, Platform, ActivityIndicator, Image, Animated, Dimensions, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { TravelPace, BudgetTier, AvoidOption } from '../../services/api/trips';

interface AiRefineModalProps {
  visible: boolean;
  onClose: () => void;
  refining: boolean;
  onRefine: (pace: TravelPace, budget: BudgetTier, avoid: AvoidOption[], notes: string) => void;
  initialPace?: TravelPace;
  initialBudget?: BudgetTier;
  initialAvoid?: AvoidOption[];
  initialNotes?: string;
  paddingBottom?: number;
}

export const AiRefineModal = ({
  visible,
  onClose,
  refining,
  onRefine,
  initialPace = 'BALANCED',
  initialBudget = 'MEDIUM',
  initialAvoid = [],
  initialNotes = '',
  paddingBottom = 0,
}: AiRefineModalProps) => {
  const [pace, setPace] = useState<TravelPace>(initialPace);
  const [budget, setBudget] = useState<BudgetTier>(initialBudget);
  const [avoid, setAvoid] = useState<AvoidOption[]>(initialAvoid);
  const [notes, setNotes] = useState(initialNotes);

  const [isRendered, setIsRendered] = useState(visible);

  const translateY = useRef(new Animated.Value(Dimensions.get('window').height)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setPace(initialPace);
      setBudget(initialBudget);
      setAvoid(initialAvoid);
      setNotes(initialNotes);
      setIsRendered(true);
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: Dimensions.get('window').height,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setIsRendered(false);
      });
    }
  }, [visible]);

  if (!isRendered) return null;

  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 100000, elevation: 100 }]} pointerEvents={visible ? "auto" : "none"}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.5)', opacity }]} />
      <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />

      <Animated.View style={[{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '85%', transform: [{ translateY }] }]}>
        <KeyboardAvoidingView enabled={Platform.OS === 'ios'} behavior="padding" style={{ flex: 1 }}>
          <View style={{ flex: 1, backgroundColor: '#FFFFFF', borderTopLeftRadius: 28, borderTopRightRadius: 28 }}>
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: '#E2E8F0', alignSelf: 'center', marginTop: 12, marginBottom: 8 }} />
            
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 24, paddingBottom: 24, gap: 24 }} showsVerticalScrollIndicator={false}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, position: 'relative' }}>
                <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: '#FFFDF9', borderWidth: 1, borderColor: '#F5EFE6', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="color-wand" size={32} color="#B9834B" />
                </View>
                <View style={{ flex: 1, zIndex: 10 }}>
                  <Text style={{ fontFamily: 'Inter-SemiBold', fontSize: 22, color: '#2A2623', marginBottom: 4 }}>
                    AI Refine Itinerary
                  </Text>
                  <Text style={{ fontSize: 13, color: '#64748B', lineHeight: 18, paddingRight: 40 }}>
                    Keeps your pinned stops and re-generates the rest around your updated preferences.
                  </Text>
                </View>
                <Image 
                  source={require('../../assets/explore_map.png')} 
                  style={{ position: 'absolute', right: -24, top: -20, width: 140, height: 100, resizeMode: 'contain', opacity: 0.6 }} 
                />
              </View>

              <View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: '#FFFDF9', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="time-outline" size={14} color="#9A6324" />
                  </View>
                  <Text style={{ fontFamily: 'Inter-Medium', fontSize: 15, color: '#2A2623' }}>Pace</Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
                  {(['VERY_RELAXED', 'RELAXED', 'BALANCED', 'QUICK'] as TravelPace[]).map((p) => {
                    const selected = pace === p;
                    return (
                      <TouchableOpacity
                        key={p}
                        onPress={() => setPace(p)}
                        style={{
                          paddingHorizontal: 16, paddingVertical: 12, borderRadius: 24,
                          backgroundColor: selected ? '#FFFDF9' : '#FFFFFF',
                          borderWidth: 1, borderColor: selected ? '#D4A373' : '#F1F5F9',
                          flexDirection: 'row', alignItems: 'center', gap: 6,
                          minWidth: 100, justifyContent: 'center'
                        }}
                      >
                        <Text style={{ fontSize: 12, color: selected ? '#B9834B' : '#475569', fontFamily: selected ? 'Inter-SemiBold' : 'Inter-Medium' }}>
                          {p.replace('_', ' ')}
                        </Text>
                        {selected && <Icon name="checkmark-circle" size={16} color="#B9834B" />}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: '#F0FDF4', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="wallet-outline" size={14} color="#15803D" />
                  </View>
                  <Text style={{ fontFamily: 'Inter-Medium', fontSize: 15, color: '#2A2623' }}>Budget</Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
                  {(['LOW', 'MEDIUM', 'HIGH'] as BudgetTier[]).map((b) => {
                    const selected = budget === b;
                    return (
                      <TouchableOpacity
                        key={b}
                        onPress={() => setBudget(b)}
                        style={{
                          paddingHorizontal: 16, paddingVertical: 12, borderRadius: 24,
                          backgroundColor: selected ? '#F0FDF4' : '#FFFFFF',
                          borderWidth: 1, borderColor: selected ? '#22C55E' : '#F1F5F9',
                          flexDirection: 'row', alignItems: 'center', gap: 6,
                          minWidth: 100, justifyContent: 'center'
                        }}
                      >
                        <Text style={{ fontSize: 12, color: selected ? '#166534' : '#475569', fontFamily: selected ? 'Inter-SemiBold' : 'Inter-Medium' }}>
                          {b}
                        </Text>
                        {selected && <Icon name="checkmark-circle" size={16} color="#15803D" />}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: '#FEF2F2', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="warning-outline" size={14} color="#DC2626" />
                  </View>
                  <Text style={{ fontFamily: 'Inter-Medium', fontSize: 15, color: '#2A2623' }}>Must avoid</Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
                  {([
                    { key: 'CROWDED', label: 'Crowded', icon: 'people-outline' },
                    { key: 'LONG_TRAVEL', label: 'Long travel', icon: 'car-outline' },
                    { key: 'EXPENSIVE_ENTRY', label: 'Expensive entry', icon: 'ticket-outline' },
                    { key: 'NON_FAMILY_FRIENDLY', label: 'Non-family friendly', icon: 'people-outline' },
                  ] as { key: AvoidOption; label: string; icon: string }[]).map((a) => {
                    const selected = avoid.includes(a.key);
                    return (
                      <TouchableOpacity
                        key={a.key}
                        onPress={() => setAvoid(prev => selected ? prev.filter(x => x !== a.key) : [...prev, a.key])}
                        style={{
                          paddingHorizontal: 16, paddingVertical: 12, borderRadius: 24,
                          backgroundColor: selected ? '#FEF2F2' : '#FFFFFF',
                          borderWidth: 1, borderColor: selected ? '#FCA5A5' : '#E2E8F0',
                          flexDirection: 'row', alignItems: 'center', gap: 8,
                        }}
                      >
                        <Icon name={a.icon} size={16} color={selected ? '#DC2626' : '#94A3B8'} />
                        <Text style={{ fontSize: 12, color: selected ? '#DC2626' : '#475569', fontFamily: selected ? 'Inter-SemiBold' : 'Inter-Medium' }}>
                          {a.label}
                        </Text>
                        {selected && <Icon name="checkmark-circle" size={16} color="#DC2626" style={{ marginLeft: 2 }} />}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: '#F5F3FF', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="chatbubble-ellipses-outline" size={14} color="#6D28D9" />
                  </View>
                  <Text style={{ fontFamily: 'Inter-Medium', fontSize: 15, color: '#2A2623' }}>
                    Anything else? <Text style={{ color: '#94A3B8', fontSize: 13, fontFamily: 'Inter-Regular' }}>(optional)</Text>
                  </Text>
                </View>
                <TextInput
                  style={{
                    minHeight: 80, borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 16,
                    padding: 16, color: '#2A2623', fontSize: 14, fontFamily: 'Inter-Regular',
                    textAlignVertical: 'top', backgroundColor: '#F8FAFC',
                  }}
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="e.g. Prefer quieter spots, less walking..."
                  placeholderTextColor="#94A3B8"
                  multiline
                />
              </View>
            </ScrollView>

            <View style={{ flexDirection: 'row', gap: 12, paddingHorizontal: 24, paddingTop: 16, paddingBottom: Math.max(paddingBottom, 32), backgroundColor: '#FFFFFF', borderTopWidth: 1, borderColor: '#F1F5F9' }}>
              <TouchableOpacity onPress={onClose} disabled={refining} style={{ flex: 1, height: 52, borderRadius: 26, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: '#0F172A', fontFamily: 'Inter-Medium', fontSize: 15 }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => onRefine(pace, budget, avoid, notes)} disabled={refining} style={{ flex: 1.5, height: 52, borderRadius: 26, backgroundColor: '#B9834B', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 }}>
                {refining ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Icon name="color-wand" size={18} color="#FFF" />
                    <Text style={{ color: '#fff', fontFamily: 'Inter-SemiBold', fontSize: 15 }}>Refine with AI</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Animated.View>
    </View>
  );
};
