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
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: '#D9E0DB', alignSelf: 'center', marginTop: 12, marginBottom: 8 }} />
            
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 24, paddingBottom: 24, gap: 24 }} showsVerticalScrollIndicator={false}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, position: 'relative' }}>
                <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: '#F7F6F1', borderWidth: 1, borderColor: '#F7F6F1', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="color-wand" size={32} color="#1F4D3A" />
                </View>
                <View style={{ flex: 1, zIndex: 10 }}>
                  <Text style={{ fontFamily: 'Inter-SemiBold', fontSize: 22, color: '#1D2420', marginBottom: 4 }}>
                    AI Refine Itinerary
                  </Text>
                  <Text style={{ fontSize: 13, color: '#68756D', lineHeight: 18, paddingRight: 40 }}>
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
                  <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: '#F7F6F1', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="time-outline" size={14} color="#B7791F" />
                  </View>
                  <Text style={{ fontFamily: 'Inter-Medium', fontSize: 15, color: '#1D2420' }}>Pace</Text>
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
                          backgroundColor: selected ? '#F7F6F1' : '#FFFFFF',
                          borderWidth: 1, borderColor: selected ? '#B7791F' : '#F7F6F1',
                          flexDirection: 'row', alignItems: 'center', gap: 6,
                          minWidth: 100, justifyContent: 'center'
                        }}
                      >
                        <Text style={{ fontSize: 12, color: selected ? '#1F4D3A' : '#68756D', fontFamily: selected ? 'Inter-SemiBold' : 'Inter-Medium' }}>
                          {p.replace('_', ' ')}
                        </Text>
                        {selected && <Icon name="checkmark-circle" size={16} color="#1F4D3A" />}
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
                  <Text style={{ fontFamily: 'Inter-Medium', fontSize: 15, color: '#1D2420' }}>Budget</Text>
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
                          borderWidth: 1, borderColor: selected ? '#22C55E' : '#F7F6F1',
                          flexDirection: 'row', alignItems: 'center', gap: 6,
                          minWidth: 100, justifyContent: 'center'
                        }}
                      >
                        <Text style={{ fontSize: 12, color: selected ? '#166534' : '#68756D', fontFamily: selected ? 'Inter-SemiBold' : 'Inter-Medium' }}>
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
                  <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: '#FBEAEA', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="warning-outline" size={14} color="#C94A4A" />
                  </View>
                  <Text style={{ fontFamily: 'Inter-Medium', fontSize: 15, color: '#1D2420' }}>Must avoid</Text>
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
                          backgroundColor: selected ? '#FBEAEA' : '#FFFFFF',
                          borderWidth: 1, borderColor: selected ? '#FCA5A5' : '#D9E0DB',
                          flexDirection: 'row', alignItems: 'center', gap: 8,
                        }}
                      >
                        <Icon name={a.icon} size={16} color={selected ? '#C94A4A' : '#68756D'} />
                        <Text style={{ fontSize: 12, color: selected ? '#C94A4A' : '#68756D', fontFamily: selected ? 'Inter-SemiBold' : 'Inter-Medium' }}>
                          {a.label}
                        </Text>
                        {selected && <Icon name="checkmark-circle" size={16} color="#C94A4A" style={{ marginLeft: 2 }} />}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: '#F7F6F1', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="chatbubble-ellipses-outline" size={14} color="#1F4D3A" />
                  </View>
                  <Text style={{ fontFamily: 'Inter-Medium', fontSize: 15, color: '#1D2420' }}>
                    Anything else? <Text style={{ color: '#68756D', fontSize: 13, fontFamily: 'Inter-Regular' }}>(optional)</Text>
                  </Text>
                </View>
                <TextInput
                  style={{
                    minHeight: 80, borderWidth: 1, borderColor: '#D9E0DB', borderRadius: 16,
                    padding: 16, color: '#1D2420', fontSize: 14, fontFamily: 'Inter-Regular',
                    textAlignVertical: 'top', backgroundColor: '#F7F6F1',
                  }}
                  value={notes}
                  onChangeText={setNotes}
                  placeholder={'Try: "Make Day 2 less busy", "Start after 10 AM", "Add more nature", or "Remove a place"'}
                  placeholderTextColor="#68756D"
                  multiline
                />
              </View>
            </ScrollView>

            <View style={{ flexDirection: 'row', gap: 12, paddingHorizontal: 24, paddingTop: 16, paddingBottom: Math.max(paddingBottom, 32), backgroundColor: '#FFFFFF', borderTopWidth: 1, borderColor: '#F7F6F1' }}>
              <TouchableOpacity onPress={onClose} disabled={refining} style={{ flex: 1, height: 52, borderRadius: 26, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#D9E0DB', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: '#1D2420', fontFamily: 'Inter-Medium', fontSize: 15 }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => onRefine(pace, budget, avoid, notes)} disabled={refining} style={{ flex: 1.5, height: 52, borderRadius: 26, backgroundColor: '#1F4D3A', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 }}>
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
