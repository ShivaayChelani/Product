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
  SANS,
  SANS_BOLD,
  SANS_SEMI,
  TRAVEL_INTERESTS,
  INDIAN_STATES,
  LANGUAGE_OPTIONS,
  type GenderOption,
} from './personalInfoTheme';
import { SelectModal } from '../ui/SelectModal';
import { INDIAN_CITIES_BY_STATE } from '../../constants/locations';

const AVATAR_EMOJIS = ['👦', '👧', '👨', '👩', '👶', '👸', '🤴', '🧑'];

const PAGE_PAD = 20;
const GRID_GAP = 12;
const FIELD_GAP = 16;
const SECTION_GAP = 22;
const CHIP_GAP = 10;
const CONTROL_H = 48;
const ICON_SIZE = 16;

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
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const sheetHeight = Math.round(windowHeight * 0.92);
  const contentWidth = Math.max(0, windowWidth - PAGE_PAD * 2);
  const chipWidth = Math.floor((contentWidth - CHIP_GAP * 2) / 3);
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
            <TouchableOpacity style={styles.iconBtn} onPress={onClose} hitSlop={8} accessibilityLabel="Back">
              <Icon name="arrow-back" size={20} color={PI.text} />
            </TouchableOpacity>
            <View style={styles.headerTextCol}>
              <Text style={styles.title}>Personal Information</Text>
              <Text style={styles.subtitle}>Manage your PalSafar profile</Text>
            </View>
            <TouchableOpacity style={styles.iconBtn} onPress={onClose} hitSlop={8} accessibilityLabel="Close">
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
                  <Icon name="person-outline" size={ICON_SIZE} color="#6A6158" style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    value={form.displayName}
                    onChangeText={v => onChange({ displayName: v })}
                    placeholder="Your name"
                    placeholderTextColor={PI.textMuted}
                    underlineColorAndroid="transparent"
                  />
                </View>
              </View>
              <View style={styles.col}>
                <Text style={styles.label}>Username (optional)</Text>
                <View style={styles.inputWrap}>
                  <Icon name="at" size={ICON_SIZE} color="#6A6158" style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    value={form.username}
                    onChangeText={v => onChange({ username: v.replace(/\s/g, '').toLowerCase() })}
                    placeholder="username"
                    placeholderTextColor={PI.textMuted}
                    autoCapitalize="none"
                    underlineColorAndroid="transparent"
                  />
                </View>
              </View>
            </View>

            {/* Row: Email + Phone */}
            <View style={styles.row}>
              <View style={styles.col}>
                <Text style={styles.label}>Email</Text>
                <View style={styles.inputWrap}>
                  <Icon name="mail-outline" size={ICON_SIZE} color="#6A6158" style={styles.inputIcon} />
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
                  <Icon name="call-outline" size={ICON_SIZE} color="#6A6158" style={styles.inputIcon} />
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
                  <Icon name="location-outline" size={ICON_SIZE} color="#6A6158" style={styles.inputIcon} />
                  <Text style={[styles.selectText, !form.city && styles.placeholder]} numberOfLines={1}>
                    {form.city || 'Select city'}
                  </Text>
                  <Icon name="chevron-down" size={ICON_SIZE} color="#6A6158" />
                </TouchableOpacity>
              </View>
              <View style={styles.col}>
                <Text style={styles.label}>State</Text>
                <TouchableOpacity
                  style={styles.inputWrap}
                  onPress={() => openSelectModal('State', INDIAN_STATES, form.state, v => onChange({ state: v }))}
                  activeOpacity={0.85}
                >
                  <Icon name="business-outline" size={ICON_SIZE} color="#6A6158" style={styles.inputIcon} />
                  <Text style={[styles.selectText, !form.state && styles.placeholder]} numberOfLines={1}>
                    {form.state || 'Select state'}
                  </Text>
                  <Icon name="chevron-down" size={ICON_SIZE} color="#6A6158" />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.fieldBlock}>
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
                      <Text
                        style={[styles.genderLabel, active && styles.genderLabelActive]}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.8}
                      >
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={styles.fieldBlock}>
              <Text style={styles.label}>Date of Birth (optional)</Text>
              <View style={styles.inputWrap}>
                <Icon name="calendar-outline" size={ICON_SIZE} color="#6A6158" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  value={form.dateOfBirth}
                  onChangeText={handleDobChange}
                  placeholder="DD / MM / YYYY"
                  placeholderTextColor="#9E978F"
                  keyboardType="number-pad"
                  maxLength={14}
                  underlineColorAndroid="transparent"
                />
                <Icon name="chevron-down" size={ICON_SIZE} color="#6A6158" />
              </View>
            </View>

            {/* Travel Interests */}
            <Text style={styles.sectionLabel}>Travel Interests</Text>
            <View style={styles.chipGrid}>
              {TRAVEL_INTERESTS.map(item => {
                const selected = form.interests.includes(item.key);
                return (
                  <TouchableOpacity
                    key={item.key}
                    style={[styles.chip, { width: chipWidth }, selected && styles.chipSelected]}
                    onPress={() => toggleInterest(item.key)}
                    activeOpacity={0.85}
                  >
                    <Icon name={item.icon} size={ICON_SIZE} color={selected ? '#7B563D' : '#6A6158'} />
                    <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]} numberOfLines={1} adjustsFontSizeToFit>
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Row: Language + Bio */}
            <View style={[styles.row, styles.rowLast]}>
              <View style={styles.col}>
                <Text style={styles.label}>Language</Text>
                <TouchableOpacity
                  style={styles.inputWrap}
                  onPress={() =>
                    openSelectModal('Language', [...LANGUAGE_OPTIONS], form.language, v => onChange({ language: v }))
                  }
                  activeOpacity={0.85}
                >
                  <Icon name="globe-outline" size={ICON_SIZE} color="#6A6158" style={styles.inputIcon} />
                  <Text style={styles.selectText} numberOfLines={1}>{form.language || 'English'}</Text>
                  <Icon name="chevron-down" size={ICON_SIZE} color="#6A6158" />
                </TouchableOpacity>
              </View>

              <View style={styles.col}>
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
                    underlineColorAndroid="transparent"
                  />
                  <Text style={styles.bioCount}>
                    {bioCount}/{bioMax}
                  </Text>
                </View>
              </View>
            </View>
            </ScrollView>
          </View>

          <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: PAGE_PAD,
    paddingTop: 18,
    paddingBottom: 16,
  },
  headerTextCol: {
    flex: 1,
    marginHorizontal: 12,
    justifyContent: 'center',
  },
  title: {
    fontFamily: SANS_BOLD,
    fontSize: 20,
    lineHeight: 26,
    color: '#13111C',
    marginBottom: 2,
  },
  subtitle: {
    fontFamily: SANS,
    fontSize: 12,
    lineHeight: 16,
    color: '#6A6158',
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E8DDD0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: PAGE_PAD,
    paddingTop: 8,
    paddingBottom: 20,
  },
  footer: {
    paddingHorizontal: PAGE_PAD,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E8DDD0',
    backgroundColor: '#FAFAFA',
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: SECTION_GAP,
  },
  avatarWrap: {
    position: 'relative',
  },
  avatarRing: {
    width: 104,
    height: 104,
    borderRadius: 52,
    borderWidth: 2,
    borderColor: '#E8DDD0',
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
    marginTop: 10,
    fontFamily: SANS,
    fontSize: 12,
    lineHeight: 16,
    color: '#6A6158',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: GRID_GAP,
    marginBottom: FIELD_GAP,
  },
  rowLast: {
    marginBottom: 0,
  },
  fieldBlock: {
    marginBottom: FIELD_GAP,
  },
  col: {
    flex: 1,
    minWidth: 0,
  },
  label: {
    fontFamily: SANS,
    fontSize: 12,
    lineHeight: 16,
    color: '#6A6158',
    marginBottom: 8,
  },
  sectionLabel: {
    fontFamily: SANS,
    fontSize: 12,
    lineHeight: 16,
    color: '#6A6158',
    marginTop: 6,
    marginBottom: 8,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E8DDD0',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: CONTROL_H,
  },
  inputIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    height: CONTROL_H,
    fontFamily: SANS,
    fontSize: 13,
    lineHeight: 18,
    color: '#13111C',
    paddingVertical: 0,
    paddingHorizontal: 0,
    textAlignVertical: 'center',
    includeFontPadding: false,
  },
  readonlyText: {
    flex: 1,
    fontFamily: SANS,
    fontSize: 13,
    lineHeight: 18,
    color: '#13111C',
    paddingRight: 6,
  },
  selectText: {
    flex: 1,
    fontFamily: SANS,
    fontSize: 13,
    lineHeight: 18,
    color: '#13111C',
    paddingRight: 6,
  },
  placeholder: { color: '#9E978F' },
  verifiedBadge: {
    backgroundColor: '#E7F6EC',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    marginLeft: 4,
    flexShrink: 0,
  },
  verifiedText: {
    fontFamily: SANS_SEMI,
    fontSize: 10,
    lineHeight: 13,
    color: '#159947',
  },
  genderRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 6,
    height: CONTROL_H,
  },
  genderOption: {
    flex: 1,
    minWidth: 0,
    height: CONTROL_H,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E8DDD0',
    backgroundColor: '#FFFFFF',
    gap: 3,
  },
  genderOptionActive: {
    backgroundColor: '#FDF7F2',
    borderColor: '#E8DDD0',
  },
  genderLabel: {
    flexShrink: 1,
    fontFamily: SANS,
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'center',
    color: '#6A6158',
  },
  genderLabelActive: {
    color: '#7B563D',
    fontFamily: SANS_SEMI,
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: CHIP_GAP,
    marginBottom: SECTION_GAP,
  },
  chip: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E8DDD0',
    backgroundColor: '#FFFFFF',
  },
  chipSelected: {
    backgroundColor: '#FDF7F2',
    borderColor: '#E8DDD0',
  },
  chipLabel: {
    fontFamily: SANS,
    fontSize: 12,
    lineHeight: 16,
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
    borderColor: '#E8DDD0',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 8,
    minHeight: 112,
  },
  bioInput: {
    fontFamily: SANS,
    fontSize: 13,
    lineHeight: 18,
    color: '#13111C',
    minHeight: 72,
    paddingVertical: 0,
    paddingHorizontal: 0,
    textAlignVertical: 'top',
    includeFontPadding: false,
  },
  bioCount: {
    alignSelf: 'flex-end',
    fontFamily: SANS,
    fontSize: 10,
    lineHeight: 13,
    color: '#9E978F',
    marginTop: 6,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: GRID_GAP,
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
