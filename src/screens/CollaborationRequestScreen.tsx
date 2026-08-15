import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Image,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { collaborationsApi } from '../services/api/collaborations';
import { useDataContext } from '../context/DataContext';
import { useBottomSafePadding } from '../design/responsive';

const C = {
  bg: '#FFFFFF',
  white: '#FFFFFF',
  brown: '#4B3B30',
  brownLight: '#8C7765',
  text: '#1F1A17',
  textSub: '#5E544C',
  textMuted: '#A0968C',
  border: '#E3DACD',
  green: '#2E7D32',
};

const SERVICES = [
  'Reel Creation', 'Short Reel (15–30 sec)', 'Cinematic Reel', 'Travel Story',
  'Business Showcase', 'Food Review', 'Adventure Experience', 'Hotel / Stay Review',
  'Cafe Review', 'Destination Coverage', 'Event Coverage', 'Offer Promotion',
  'Seasonal Promotion', 'New Business Launch', 'Featured Listing Campaign', 'Custom Promotion'
];

const GOALS = [
  'Increase Visitors', 'Increase Bookings', 'Increase Brand Awareness',
  'Promote New Business', 'Promote New Offer', 'Seasonal Campaign',
  'Festival Promotion', 'Weekend Campaign', 'Other'
];

const HIGHLIGHTS = [
  'Scenic View', 'Food', 'Rooms', 'Adventure', 'Experience', 'Offers & Discounts',
  'Family Friendly', 'Couple Friendly', 'Luxury', 'Budget Friendly', 'Cleanliness',
  'Service Quality', 'Local Culture', 'Hidden Gem', 'Sunset', 'Activities', 'Hospitality'
];

const BENEFITS = [
  'Free Stay', 'Free Food', 'Adventure Activity', 'Travel Support',
  'Exclusive Access', 'Gift Hamper', 'Discount Coupons', 'Other'
];

function SimpleDatePickerModal({ visible, onClose, onSelect, initialDate }: { visible: boolean, onClose: () => void, onSelect: (date: string) => void, initialDate?: Date }) {
  const [currentDate, setCurrentDate] = useState(initialDate || new Date());
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();
  
  const grid = [];
  for (let i = 0; i < firstDay; i++) grid.push(null);
  for (let i = 1; i <= daysInMonth; i++) grid.push(i);

  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }}>
        <View style={{ backgroundColor: C.white, borderRadius: 20, padding: 20, width: 320 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <TouchableOpacity onPress={() => setCurrentDate(new Date(year, month - 1, 1))}>
              <Icon name="chevron-back" size={24} color={C.brown} />
            </TouchableOpacity>
            <Text style={{ fontSize: 16, fontWeight: '700', color: C.brown }}>{monthNames[month]} {year}</Text>
            <TouchableOpacity onPress={() => setCurrentDate(new Date(year, month + 1, 1))}>
              <Icon name="chevron-forward" size={24} color={C.brown} />
            </TouchableOpacity>
          </View>
          
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
              <Text key={d} style={{ width: '14.28%', textAlign: 'center', fontWeight: '600', color: C.textMuted, marginBottom: 10 }}>{d}</Text>
            ))}
            {grid.map((day, i) => (
              <TouchableOpacity 
                key={i} 
                style={{ width: '14.28%', aspectRatio: 1, justifyContent: 'center', alignItems: 'center' }}
                disabled={!day}
                onPress={() => {
                  if (day) {
                    const d = new Date(year, month, day);
                    const formatted = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                    onSelect(formatted);
                  }
                }}
              >
                {day ? <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: C.bg, justifyContent: 'center', alignItems: 'center' }}><Text style={{ color: C.brown, fontWeight: '600' }}>{day}</Text></View> : null}
              </TouchableOpacity>
            ))}
          </View>
          
          <TouchableOpacity onPress={onClose} style={{ marginTop: 20, alignItems: 'center' }}>
            <Text style={{ color: C.brown, fontWeight: '700' }}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

export default function CollaborationRequestScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const insets = useSafeAreaInsets();
  const contentPadBottom = useBottomSafePadding(24);
  const { currentVendor } = useDataContext();
  const creatorProfileId = route.params?.creatorProfileId as string;
  const creatorName = route.params?.creatorName as string;

  const [campaignTitle, setCampaignTitle] = useState('');
  const [businessDetails, setBusinessDetails] = useState('');
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [campaignGoal, setCampaignGoal] = useState(GOALS[0]);
  const [showGoalDropdown, setShowGoalDropdown] = useState(false);
  const [selectedHighlights, setSelectedHighlights] = useState<string[]>([]);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [budget, setBudget] = useState('');
  const [budgetNegotiable, setBudgetNegotiable] = useState(false);
  const [selectedBenefits, setSelectedBenefits] = useState<string[]>([]);

  const [contactPerson, setContactPerson] = useState(currentVendor?.businessName || '');
  const [contactPhone, setContactPhone] = useState(currentVendor?.phone || '');
  const [contactWhatsApp, setContactWhatsApp] = useState(currentVendor?.phone || '');
  const [contactEmail, setContactEmail] = useState('');
  const [notes, setNotes] = useState('');

  const [datePickerTarget, setDatePickerTarget] = useState<'start' | 'end' | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const toggleArrayItem = (item: string, list: string[], setter: any) => {
    if (list.includes(item)) setter(list.filter((i: string) => i !== item));
    else setter([...list, item]);
  };

  const validate = () => {
    if (selectedServices.length === 0) return 'Select at least one service.';
    if (!campaignTitle.trim()) return 'Campaign Title is required.';
    if (!businessDetails.trim()) return 'Business details are required.';
    if (selectedHighlights.length === 0) return 'Select at least one highlight point.';
    if (!startDate || !endDate) return 'Campaign duration dates are required.';
    if (!budget || isNaN(Number(budget))) return 'Valid budget is required.';
    if (!contactPerson.trim() || !contactPhone.trim() || !contactEmail.trim()) return 'Contact details are required.';
    return null;
  };

  const handleSubmit = async () => {
    const err = validate();
    if (err) {
      Alert.alert('Missing Fields', err);
      return;
    }
    setSubmitting(true);
    try {
      const budgetPaise = Math.round(Number(budget) * 100);
      
      const structuredData = {
        _isStructured: true,
        servicesRequested: selectedServices,
        businessDetails: businessDetails.trim(),
        campaignGoal,
        highlightPoints: selectedHighlights,
        startDate,
        endDate,
        budgetNegotiable,
        benefitsOffered: selectedBenefits,
      };

      await collaborationsApi.create({
        creatorProfileId,
        campaignTitle: campaignTitle.trim(),
        campaignCategory: 'Other', 
        budgetPaise,
        deliverables: [{ type: 'REEL', quantity: 1 }],
        campaignBrief: JSON.stringify(structuredData),
        expectedShootDate: startDate ? new Date(startDate).toISOString() : undefined,
        expectedUploadDate: endDate ? new Date(endDate).toISOString() : undefined,
        contactPerson: contactPerson.trim(),
        contactPhone: contactPhone.trim(),
        contactWhatsApp: contactWhatsApp.trim() || undefined,
        contactEmail: contactEmail.trim(),
        notes: notes.trim() || undefined,
      });

      setShowSuccess(true);
    } catch (error: any) {
      if (error?.status === 403 || error?.code === 'PLAN_LIMIT_REACHED') {
        Alert.alert(
          'Subscription required',
          error?.message || 'Subscribe to a vendor plan to send collaboration requests.',
          [
            { text: 'Not now', style: 'cancel' },
            { text: 'Subscribe', onPress: () => navigation.navigate('VendorSubscription') },
          ],
        );
        return;
      }
      Alert.alert('Error', error?.message || 'Could not send request.');
    } finally {
      setSubmitting(false);
    }
  };

  if (showSuccess) {
    return (
      <View style={styles.successRoot}>
        <View style={styles.successContent}>
          <View style={styles.successCircle}>
            <Icon name="checkmark" size={60} color={C.white} />
          </View>
          <Text style={styles.successTitle}>Request Sent Successfully</Text>
          <Text style={styles.successSub}>
            Your collaboration request has been sent to {creatorName || 'the creator'}.
          </Text>
          <View style={styles.statusCard}>
            <Icon name="time-outline" size={20} color={C.brown} />
            <Text style={styles.statusText}>Pending Review</Text>
          </View>
          <Text style={styles.successNote}>The creator will review your request and respond soon.</Text>
        </View>
        <View style={[styles.successFooter, { paddingBottom: contentPadBottom }]}>
          <TouchableOpacity 
            style={styles.primaryBtn} 
            onPress={() => {
              setShowSuccess(false);
              navigation.replace('VendorTabs', { screen: 'Collaborations' });
            }}
          >
            <Text style={styles.primaryBtnText}>View My Requests</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.outlineBtn} 
            onPress={() => {
              setShowSuccess(false);
              navigation.goBack();
            }}
          >
            <Text style={styles.outlineBtnText}>Back to Creator Profile</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { paddingTop: Math.max(insets.top, 16) }]} edges={['left', 'right']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Icon name="chevron-back" size={24} color={C.text} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Collaborate with {creatorName?.split(' ')[0]}</Text>
            <Text style={styles.headerSub}>Request promotion on PalSafar</Text>
          </View>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>1. Promotion Type</Text>
            <View style={styles.dropdownSelected}>
              <Icon name="checkmark-circle" size={18} color={C.green} style={{ marginRight: 8 }} />
              <Text style={styles.dropdownSelectedText}>Promotion on PalSafar</Text>
            </View>
            <Text style={styles.helpText}>Your business will only be promoted inside the PalSafar app.</Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>2. Service Required *</Text>
            <View style={styles.chipWrap}>
              {SERVICES.map(s => {
                const active = selectedServices.includes(s);
                return (
                  <TouchableOpacity 
                    key={s} 
                    style={[styles.chip, active && styles.chipActive]} 
                    onPress={() => toggleArrayItem(s, selectedServices, setSelectedServices)}
                  >
                    {active && <Icon name="checkmark" size={14} color={C.white} style={{ marginRight: 4 }} />}
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{s}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>3. Campaign Title *</Text>
            <TextInput 
              style={styles.input} 
              placeholder="e.g. Grand Opening Offer" 
              placeholderTextColor={C.textMuted}
              value={campaignTitle}
              onChangeText={setCampaignTitle}
            />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>4. Business Details *</Text>
            <Text style={styles.helpText}>Explain your business, why customers should visit, special offers, and unique experiences.</Text>
            <TextInput 
              style={[styles.input, styles.textArea]} 
              placeholder="Write details about your business..." 
              placeholderTextColor={C.textMuted}
              value={businessDetails}
              onChangeText={setBusinessDetails}
              multiline
            />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>5. Campaign Goal *</Text>
            <TouchableOpacity style={styles.dropdownInput} onPress={() => setShowGoalDropdown(!showGoalDropdown)}>
              <Text style={styles.dropdownText}>{campaignGoal}</Text>
              <Icon name={showGoalDropdown ? "chevron-up" : "chevron-down"} size={20} color={C.textMuted} />
            </TouchableOpacity>
            {showGoalDropdown && (
              <View style={styles.dropdownMenu}>
                {GOALS.map(g => (
                  <TouchableOpacity 
                    key={g} 
                    style={styles.dropdownItem} 
                    onPress={() => { setCampaignGoal(g); setShowGoalDropdown(false); }}
                  >
                    <Text style={[styles.dropdownItemText, campaignGoal === g && { color: C.brown, fontWeight: '600' }]}>{g}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>6. What should the creator highlight? *</Text>
            <View style={styles.chipWrap}>
              {HIGHLIGHTS.map(h => {
                const active = selectedHighlights.includes(h);
                return (
                  <TouchableOpacity 
                    key={h} 
                    style={[styles.chip, active && styles.chipActive]} 
                    onPress={() => toggleArrayItem(h, selectedHighlights, setSelectedHighlights)}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{h}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>7. Campaign Duration *</Text>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Start Date</Text>
                <TouchableOpacity style={styles.dropdownInput} onPress={() => setDatePickerTarget('start')}>
                  <Text style={[styles.dropdownText, !startDate && { color: C.textMuted }]}>{startDate || 'YYYY-MM-DD'}</Text>
                  <Icon name="calendar-outline" size={20} color={C.textMuted} />
                </TouchableOpacity>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>End Date</Text>
                <TouchableOpacity style={styles.dropdownInput} onPress={() => setDatePickerTarget('end')}>
                  <Text style={[styles.dropdownText, !endDate && { color: C.textMuted }]}>{endDate || 'YYYY-MM-DD'}</Text>
                  <Icon name="calendar-outline" size={20} color={C.textMuted} />
                </TouchableOpacity>
              </View>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>8. Budget (INR) *</Text>
            <TextInput 
              style={[styles.input, { fontSize: 18, fontWeight: '600' }]} 
              placeholder="₹ 15000" 
              placeholderTextColor={C.textMuted} 
              value={budget} 
              onChangeText={setBudget} 
              keyboardType="numeric" 
            />
            <TouchableOpacity 
              style={styles.checkboxRow} 
              onPress={() => setBudgetNegotiable(!budgetNegotiable)}
            >
              <Icon name={budgetNegotiable ? "checkbox" : "square-outline"} size={22} color={budgetNegotiable ? C.brown : C.textMuted} />
              <Text style={styles.checkboxText}>Budget Negotiable</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>9. Benefits Offered</Text>
            <View style={styles.chipWrap}>
              {BENEFITS.map(b => {
                const active = selectedBenefits.includes(b);
                return (
                  <TouchableOpacity 
                    key={b} 
                    style={[styles.chip, active && styles.chipActive]} 
                    onPress={() => toggleArrayItem(b, selectedBenefits, setSelectedBenefits)}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{b}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>10. Contact Person *</Text>
            <TextInput style={styles.input} placeholder="Name" placeholderTextColor={C.textMuted} value={contactPerson} onChangeText={setContactPerson} />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>11. Contact Details *</Text>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Phone</Text>
                <TextInput style={styles.input} placeholder="Phone" placeholderTextColor={C.textMuted} value={contactPhone} onChangeText={setContactPhone} keyboardType="phone-pad" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>WhatsApp</Text>
                <TextInput style={styles.input} placeholder="WhatsApp" placeholderTextColor={C.textMuted} value={contactWhatsApp} onChangeText={setContactWhatsApp} keyboardType="phone-pad" />
              </View>
            </View>
            <Text style={[styles.label, { marginTop: 12 }]}>Email</Text>
            <TextInput style={styles.input} placeholder="Email" placeholderTextColor={C.textMuted} value={contactEmail} onChangeText={setContactEmail} keyboardType="email-address" autoCapitalize="none" />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>12. Additional Notes</Text>
            <TextInput 
              style={[styles.input, styles.textArea]} 
              placeholder="Anything else the creator should know?" 
              placeholderTextColor={C.textMuted}
              value={notes}
              onChangeText={setNotes}
              multiline
            />
          </View>
        </ScrollView>

        {/* Sticky Bottom */}
        <View style={[styles.stickyBottom, { paddingBottom: contentPadBottom }]}>
          <View style={styles.stickyRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.stickyLabel}>Estimated Budget</Text>
              <Text style={styles.stickyBudget}>₹{budget || '0'}</Text>
            </View>
            <TouchableOpacity style={[styles.primaryBtn, { flex: 2 }]} onPress={handleSubmit} disabled={submitting}>
              {submitting ? <ActivityIndicator color={C.white} /> : <Text style={styles.primaryBtnText}>Send Collaboration Request</Text>}
            </TouchableOpacity>
          </View>
        </View>

        {datePickerTarget && (
          <SimpleDatePickerModal
            visible={!!datePickerTarget}
            onClose={() => setDatePickerTarget(null)}
            initialDate={datePickerTarget === 'start' && startDate ? new Date(startDate) : datePickerTarget === 'end' && endDate ? new Date(endDate) : new Date()}
            onSelect={(date) => {
              if (datePickerTarget === 'start') setStartDate(date);
              if (datePickerTarget === 'end') setEndDate(date);
              setDatePickerTarget(null);
            }}
          />
        )}

      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    backgroundColor: C.white,
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 16, fontWeight: '700', color: C.text },
  headerSub: { fontSize: 12, color: C.textSub, marginTop: 2 },
  scrollContent: { padding: 16, paddingBottom: 40 },
  
  section: {
    backgroundColor: C.white,
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: C.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
  },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: C.brown, marginBottom: 12 },
  helpText: { fontSize: 13, color: C.textSub, marginBottom: 12, lineHeight: 18 },
  label: { fontSize: 12, fontWeight: '600', color: C.textSub, marginBottom: 6 },
  
  dropdownSelected: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F8E9',
    borderWidth: 1,
    borderColor: '#C5E1A5',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 8,
  },
  dropdownSelectedText: { fontSize: 14, fontWeight: '600', color: C.green },
  
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginRight: 8,
    marginBottom: 8,
  },
  chipActive: {
    backgroundColor: C.brown,
    borderColor: C.brown,
  },
  chipText: { fontSize: 13, fontWeight: '600', color: C.textSub },
  chipTextActive: { color: C.white },
  
  input: {
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: C.text,
  },
  textArea: { minHeight: 120, textAlignVertical: 'top' },
  
  dropdownInput: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  dropdownText: { fontSize: 15, color: C.text },
  dropdownMenu: {
    marginTop: 8,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 14,
    overflow: 'hidden',
  },
  dropdownItem: { paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.bg },
  dropdownItemText: { fontSize: 14, color: C.textSub },
  
  row: { flexDirection: 'row', gap: 12 },
  
  checkboxRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12 },
  checkboxText: { marginLeft: 8, fontSize: 14, fontWeight: '600', color: C.text },
  
  stickyBottom: {
    backgroundColor: C.white,
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  stickyRow: { flexDirection: 'row', alignItems: 'center' },
  stickyLabel: { fontSize: 12, color: C.textMuted, fontWeight: '600' },
  stickyBudget: { fontSize: 18, fontWeight: '700', color: C.text, marginTop: 2 },
  
  primaryBtn: {
    backgroundColor: C.brown,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: { color: C.white, fontSize: 15, fontWeight: '700' },
  
  outlineBtn: {
    borderWidth: 1,
    borderColor: C.brown,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  outlineBtnText: { color: C.brown, fontSize: 15, fontWeight: '700' },

  successRoot: { flex: 1, backgroundColor: C.bg, justifyContent: 'space-between' },
  successContent: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  successCircle: { width: 100, height: 100, borderRadius: 50, backgroundColor: C.green, alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  successTitle: { fontSize: 24, fontWeight: '800', color: C.text, marginBottom: 8, textAlign: 'center' },
  successSub: { fontSize: 15, color: C.textSub, textAlign: 'center', lineHeight: 22, marginBottom: 32 },
  statusCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F3ECE4', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 20, marginBottom: 24 },
  statusText: { fontSize: 15, fontWeight: '700', color: C.brown, marginLeft: 8 },
  successNote: { fontSize: 13, color: C.textMuted, textAlign: 'center' },
  successFooter: { padding: 24, backgroundColor: C.white, borderTopWidth: 1, borderTopColor: C.border },
});
