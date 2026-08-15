import React, { memo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Image,
  ActivityIndicator,
  Alert,
  Platform,
  KeyboardAvoidingView,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import { launchImageLibrary } from 'react-native-image-picker';
import {
  PI,
  SERIF,
  SANS,
  SANS_BOLD,
  SANS_SEMI,
  TRAVEL_INTERESTS,
  INDIAN_STATES,
  LANGUAGE_OPTIONS,
  type GenderOption,
} from './personalInfoTheme';
import { SelectModal } from '../ui/SelectModal';
import { INDIAN_CITIES_BY_STATE, ALL_INDIAN_CITIES } from '../../constants/locations';

const AVATAR_EMOJIS = ['👦', '👧', '👨', '👩', '👶', '👸', '🤴', '🧑'];

export type PersonalInfoForm = {
  displayName: string;
  username: string;
  bio: string;
  city: string;
  state: string;
  gender: GenderOption | '';
  dateOfBirth: string;
  language: string;
  interests: string[];
  avatarUri: string | null;
  avatarStyle: number;
};

type Props = {
  visible: boolean;
  saving?: boolean;
  email?: string;
  phoneNumber?: string;
  emailVerified?: boolean;
  form: PersonalInfoForm;
  onChange: (patch: Partial<PersonalInfoForm>) => void;
  onClose: () => void;
  onSave: () => void;
};


function PersonalInformationModalComponent({
  visible,
  saving,
  email,
  phoneNumber,
  emailVerified = true,
  form,
  onChange,
  onClose,
  onSave,
}: Props) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const sheetHeight = Math.round(windowHeight * 0.92);
  const bioCount = form.bio.length;
  const bioMax = 200;
  
  const [selectModal, setSelectModal] = React.useState<{
    visible: boolean;
    title: string;
    options: readonly string[];
    selectedValue?: string;
    onSelect: (v: string) => void;
  } | null>(null);

  const openSelectModal = (title: string, options: readonly string[], selectedValue: string, onSelect: (v: string) => void) => {
    setSelectModal({ visible: true, title, options, selectedValue, onSelect });
  };

  const avatarSource = form.avatarUri
    ? { uri: form.avatarUri }
    : null;

  const pickAvatar = useCallback(() => {
    launchImageLibrary(
      { mediaType: 'photo', quality: 0.7, selectionLimit: 1 },
      response => {
        if (response.didCancel || response.errorCode) return;
        const uri = response.assets?.[0]?.uri;
        if (uri) onChange({ avatarUri: uri, avatarStyle: -1 });
      },
    );
  }, [onChange]);

  const toggleInterest = (key: string) => {
    const next = form.interests.includes(key)
      ? form.interests.filter(i => i !== key)
      : [...form.interests, key];
    onChange({ interests: next });
  };

  const genderOptions: { key: GenderOption; label: string; icon: string }[] = [
    { key: 'male', label: 'Male', icon: 'person' },
    { key: 'female', label: 'Female', icon: 'female-outline' },
    { key: 'prefer_not', label: 'Prefer not to say', icon: 'ban-outline' },
  ];

  const handleDobChange = (text: string) => {
    const cleaned = text.replace(/\D/g, '');
    let formatted = cleaned;
    if (cleaned.length >= 3) {
      formatted = `${cleaned.slice(0, 2)} / ${cleaned.slice(2)}`;
    }
    if (cleaned.length >= 5) {
      formatted = `${cleaned.slice(0, 2)} / ${cleaned.slice(2, 4)} / ${cleaned.slice(4, 8)}`;
    }
    onChange({ dateOfBirth: formatted });
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}
      >
        <View style={[styles.sheet, { height: sheetHeight }]}>
          <View style={styles.header}>
            <TouchableOpacity style={styles.iconBtn} onPress={onClose} hitSlop={8}>
              <Icon name="arrow-back" size={20} color={PI.text} />
            </TouchableOpacity>
            <View style={styles.headerTextCol}>
              <Text style={styles.title}>Personal Information</Text>
              <Text style={styles.subtitle}>Manage your PalSafar profile</Text>
            </View>
            <View style={{ flex: 1 }} />
            <TouchableOpacity style={styles.iconBtn} onPress={onClose} hitSlop={8}>
              <Icon name="close" size={20} color={PI.text} />
            </TouchableOpacity>
          </View>

          <View style={styles.scrollHost}>
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              nestedScrollEnabled
              scrollEnabled
              showsVerticalScrollIndicator
              bounces
              alwaysBounceVertical={false}
            >
            {/* Avatar */}
            <View style={styles.avatarSection}>
              <TouchableOpacity onPress={pickAvatar} activeOpacity={0.9} style={styles.avatarWrap}>
                <View style={styles.avatarRing}>
                  {avatarSource ? (
                    <Image source={avatarSource} style={styles.avatarImage} />
                  ) : (
                    <View style={styles.avatarFallback}>
                      <Text style={styles.avatarEmoji}>
                        {AVATAR_EMOJIS[Math.max(0, form.avatarStyle)] || '🧑'}
                      </Text>
                    </View>
                  )}
                </View>
                <View style={styles.cameraBadge}>
                  <Icon name="camera" size={14} color="#FFFFFF" />
                </View>
              </TouchableOpacity>
              <Text style={styles.avatarHint}>Tap to update profile picture</Text>
            </View>

            {/* Row: Full Name + Username */}
            <View style={styles.row}>
              <View style={styles.col}>
                <Text style={styles.label}>Full Name</Text>
                <View style={styles.inputWrap}>
                  <Icon name="person-outline" size={16} color="#6A6158" style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    value={form.displayName}
                    onChangeText={v => onChange({ displayName: v })}
                    placeholder="Your name"
                    placeholderTextColor={PI.textMuted}
                  />
                </View>
              </View>
              <View style={styles.col}>
                <Text style={styles.label}>Username (optional)</Text>
                <View style={styles.inputWrap}>
                  <Icon name="at" size={16} color="#6A6158" style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    value={form.username}
                    onChangeText={v => onChange({ username: v.replace(/\s/g, '').toLowerCase() })}
                    placeholder="username"
                    placeholderTextColor={PI.textMuted}
                    autoCapitalize="none"
                  />
                </View>
              </View>
            </View>

            {/* Row: Email + Phone */}
            <View style={styles.row}>
              <View style={styles.col}>
                <Text style={styles.label}>Email</Text>
                <View style={styles.inputWrap}>
                  <Icon name="mail-outline" size={16} color="#6A6158" style={styles.inputIcon} />
                  <Text style={styles.readonlyText} numberOfLines={1}>
                    {email || '—'}
                  </Text>
                  {emailVerified ? (
                    <View style={styles.verifiedBadge}>
                      <Text style={styles.verifiedText}>Verified</Text>
                    </View>
                  ) : null}
                </View>
              </View>
              <View style={styles.col}>
                <Text style={styles.label}>Phone Number</Text>
                <View style={styles.inputWrap}>
                  <Icon name="call-outline" size={16} color="#6A6158" style={styles.inputIcon} />
                  <Text style={styles.readonlyText} numberOfLines={1}>
                    {phoneNumber || '—'}
                  </Text>
                  <Icon name="lock-closed-outline" size={14} color="#159947" />
                </View>
              </View>
            </View>

            {/* Row: City + State */}
            <View style={styles.row}>
              <View style={styles.col}>
                <Text style={styles.label}>City</Text>
                <TouchableOpacity
                  style={styles.inputWrap}
                  onPress={() => {
                    if (!form.state) {
                      Alert.alert('Select state first', 'Please choose a state before selecting a city.');
                      return;
                    }
                    openSelectModal('City', INDIAN_CITIES_BY_STATE[form.state] || [], form.city, v => onChange({ city: v }));
                  }}
                  activeOpacity={0.85}
                >
                  <Icon name="location-outline" size={16} color="#6A6158" style={styles.inputIcon} />
                  <Text style={[styles.selectText, !form.city && styles.placeholder]} numberOfLines={1}>
                    {form.city || (form.state ? 'Select city' : 'Select state first')}
                  </Text>
                  <Icon name="chevron-down" size={16} color="#6A6158" />
                </TouchableOpacity>
              </View>
              <View style={styles.col}>
                <Text style={styles.label}>State</Text>
                <TouchableOpacity
                  style={styles.inputWrap}
                  onPress={() => openSelectModal('State', INDIAN_STATES, form.state, v => onChange({ state: v }))}
                  activeOpacity={0.85}
                >
                  <Icon name="business-outline" size={16} color="#6A6158" style={styles.inputIcon} />
                  <Text style={[styles.selectText, !form.state && styles.placeholder]} numberOfLines={1}>
                    {form.state || 'Select state'}
                  </Text>
                  <Icon name="chevron-down" size={16} color="#6A6158" />
                </TouchableOpacity>
              </View>
            </View>

            {/* Row: Gender & DOB */}
            <View style={styles.row}>
              <View style={styles.col}>
                <Text style={styles.label}>Gender (optional)</Text>
                <View style={styles.genderRow}>
                  {genderOptions.map(opt => {
                    const active = form.gender === opt.key;
                    return (
                      <TouchableOpacity
                        key={opt.key}
                        style={[styles.genderOption, active && styles.genderOptionActive]}
                        onPress={() => onChange({ gender: opt.key })}
                        activeOpacity={0.85}
                      >
                        <Icon name={opt.icon} size={14} color={active ? '#7B563D' : '#6A6158'} />
                        <Text style={[styles.genderLabel, active && styles.genderLabelActive]}>{opt.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
              
              <View style={styles.col}>
                <Text style={styles.label}>Date of Birth (optional)</Text>
                <View style={styles.inputWrap}>
                  <Icon name="calendar-outline" size={16} color="#6A6158" style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    value={form.dateOfBirth}
                    onChangeText={handleDobChange}
                    placeholder="DD / MM / YYYY"
                    placeholderTextColor="#9E978F"
                    keyboardType="number-pad"
                    maxLength={14}
                  />
                  <Icon name="chevron-down" size={16} color="#6A6158" />
                </View>
              </View>
            </View>

            {/* Travel Interests */}
            <Text style={[styles.label, styles.sectionGap]}>Travel Interests</Text>
            <View style={styles.chipGrid}>
              {TRAVEL_INTERESTS.map(item => {
                const selected = form.interests.includes(item.key);
                return (
                  <TouchableOpacity
                    key={item.key}
                    style={[styles.chip, selected && styles.chipSelected]}
                    onPress={() => toggleInterest(item.key)}
                    activeOpacity={0.85}
                  >
                    <Icon name={item.icon} size={16} color={selected ? '#7B563D' : '#6A6158'} />
                    <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]} numberOfLines={1} adjustsFontSizeToFit>{item.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Row: Language + Bio */}
            <View style={[styles.row, { alignItems: 'flex-start' }]}>
              <View style={[styles.col, { flex: 1 }]}>
                <Text style={styles.label}>Language</Text>
                <TouchableOpacity
                  style={styles.inputWrap}
                  onPress={() =>
                    openSelectModal('Language', [...LANGUAGE_OPTIONS], form.language, v => onChange({ language: v }))
                  }
                  activeOpacity={0.85}
                >
                  <Icon name="globe-outline" size={16} color="#6A6158" style={styles.inputIcon} />
                  <Text style={styles.selectText}>{form.language || 'English'}</Text>
                  <Icon name="chevron-down" size={16} color="#6A6158" />
                </TouchableOpacity>
              </View>

              <View style={[styles.col, { flex: 1.5 }]}>
                <Text style={styles.label}>Bio (optional)</Text>
                <View style={styles.bioWrap}>
                  <TextInput
                    style={styles.bioInput}
                    value={form.bio}
                    onChangeText={v => onChange({ bio: v.slice(0, bioMax) })}
                    placeholder="Tell us about your travel style..."
                    placeholderTextColor="#9E978F"
                    multiline
                    textAlignVertical="top"
                  />
                  <Text style={styles.bioCount}>
                    {bioCount}/{bioMax}
                  </Text>
                </View>
              </View>
            </View>
            </ScrollView>
          </View>

          <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            <View style={styles.actions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={onClose} activeOpacity={0.85}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={onSave} disabled={saving} activeOpacity={0.85}>
                {saving ? (
                  <ActivityIndicator size="small" color={PI.darkBtnText} />
                ) : (
                  <Text style={styles.saveBtnText}>Save Changes</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>

      {selectModal && (
        <SelectModal
          visible={selectModal.visible}
          title={selectModal.title}
          options={selectModal.options}
          selectedValue={selectModal.selectedValue}
          onSelect={selectModal.onSelect}
          onClose={() => setSelectModal(null)}
        />
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    backgroundColor: '#FAFAFA',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    width: '100%',
    overflow: 'hidden',
  },
  scrollHost: {
    flex: 1,
    minHeight: 0,
  },
  handle: {
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: PI.divider,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 24,
    flexShrink: 0,
  },
  headerTextCol: { marginLeft: 16 },
  title: {
    fontFamily: SANS_BOLD,
    fontSize: 20,
    color: '#13111C',
    marginBottom: 4,
  },
  subtitle: {
    fontFamily: SANS,
    fontSize: 12,
    color: '#6A6158',
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#F3EBE3',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#2B1D15',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 24,
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#F3EBE3',
    backgroundColor: '#FAFAFA',
    flexShrink: 0,
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: 24,
  },
  avatarWrap: {
    position: 'relative',
  },
  avatarRing: {
    width: 104,
    height: 104,
    borderRadius: 52,
    borderWidth: 2,
    borderColor: '#F3EBE3',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: {
    width: 90,
    height: 90,
    borderRadius: 45,
  },
  avatarFallback: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: '#FDF7F2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarEmoji: { fontSize: 40 },
  cameraBadge: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#7B563D',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  avatarHint: {
    marginTop: 12,
    fontFamily: SANS,
    fontSize: 11,
    color: '#6A6158',
  },
  row: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 14,
  },
  col: { flex: 1, minWidth: 0 },
  label: {
    fontFamily: SANS,
    fontSize: 12,
    color: '#6A6158',
    marginBottom: 8,
  },
  sectionGap: { marginTop: 8 },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#F3EBE3',
    borderRadius: 12,
    paddingHorizontal: 12,
    minHeight: 46,
  },
  inputReadonly: {
    backgroundColor: '#FFFFFF',
  },
  inputIcon: { marginRight: 8 },
  input: {
    flex: 1,
    fontFamily: SANS,
    fontSize: 13,
    color: '#13111C',
    paddingVertical: 10,
  },
  readonlyText: {
    flex: 1,
    fontFamily: SANS,
    fontSize: 13,
    color: '#13111C',
  },
  selectText: {
    flex: 1,
    fontFamily: SANS,
    fontSize: 13,
    color: '#13111C',
  },
  placeholder: { color: '#9E978F' },
  verifiedBadge: {
    backgroundColor: '#E7F6EC',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginLeft: 6,
  },
  verifiedText: {
    fontFamily: SANS_SEMI,
    fontSize: 10,
    color: '#159947',
  },
  genderRow: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    justifyContent: 'space-between',
    gap: 6,
  },
  genderOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#F3EBE3',
    backgroundColor: '#FFFFFF',
    gap: 4,
  },
  genderOptionActive: {
    backgroundColor: '#FDF7F2',
    borderColor: '#E8DDD0',
  },
  genderLabel: {
    fontFamily: SANS,
    fontSize: 9,
    color: '#6A6158',
  },
  genderLabelActive: {
    color: '#7B563D',
    fontFamily: SANS_SEMI,
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 20,
    gap: 8,
  },
  chip: {
    width: '31%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#F3EBE3',
    backgroundColor: '#FFFFFF',
  },
  chipSelected: {
    backgroundColor: '#FDF7F2',
    borderColor: '#E8DDD0',
  },
  chipLabel: {
    fontFamily: SANS,
    fontSize: 10,
    color: '#13111C',
    flexShrink: 1,
  },
  chipLabelSelected: {
    color: '#7B563D',
    fontFamily: SANS_SEMI,
  },
  bioWrap: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#F3EBE3',
    borderRadius: 12,
    padding: 12,
    minHeight: 110,
    marginBottom: 0,
  },
  bioInput: {
    fontFamily: SANS,
    fontSize: 12,
    color: '#13111C',
    lineHeight: 18,
    minHeight: 70,
  },
  bioCount: {
    alignSelf: 'flex-end',
    fontFamily: SANS,
    fontSize: 10,
    color: '#9E978F',
    marginTop: 4,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    paddingTop: 8,
  },
  cancelBtn: {
    flex: 1,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#E8DDD0',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    fontFamily: SANS_BOLD,
    fontSize: 14,
    color: '#4A3427',
  },
  saveBtn: {
    flex: 1,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#4A3427',
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: {
    fontFamily: SANS_BOLD,
    fontSize: 14,
    color: '#FFFFFF',
  },
});

export const PersonalInformationModal = memo(PersonalInformationModalComponent);
