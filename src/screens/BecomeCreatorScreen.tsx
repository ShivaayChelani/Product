import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  StatusBar,
  Platform,
  KeyboardAvoidingView,
  useWindowDimensions,
  Image,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { useUserContext } from '../context/UserContext';
import { socialApi } from '../services/api/social';
import { useBottomSafePadding } from '../design/responsive';
import { ApiErrorCodes, getApiErrorCode } from '../services/api/client';
import type { UserProfile } from '../types';
import { launchImageLibrary } from 'react-native-image-picker';
import { uploadApi } from '../services/api/upload';
import { caughtErrorMessage } from '../utils/caughtError';
import { extractCreatorHandle } from '../utils/creatorHandle';
import { SelectModal } from '../components/ui/SelectModal';
import {
  assertSupportedUploadMime,
  normalizeUploadMime,
} from '../services/upload/formFile';

type PortfolioItem = {
  uri: string;
  type: string;
  name?: string;
  remoteUrl?: string;
};

function isRemoteUrl(uri: string): boolean {
  return uri.startsWith('https://') || uri.startsWith('http://');
}

// Using local theme tokens modeled after the mockup
const CF = {
  bg: '#F9F9F9',
  card: '#FFFFFF',
  text: '#111111',
  textSecondary: '#555555',
  textMuted: '#999999',
  border: '#EAEAEA',
  primary: '#B67A3D', // Brown button color
  primaryDark: '#936130',
  accent: '#EAB256', // Gold star
};

const SANS = 'Inter-Regular';
const SANS_SEMI = 'Inter-SemiBold';
const SANS_BOLD = 'Inter-Bold';
const SERIF = 'Merriweather-Bold';

const CONTENT_TYPES = ['Travel Vlogs', 'Photography', 'Food Guides', 'Hotel Reviews', 'Budget Travel'];
const EXPERIENCES = ['Beginner (0-1 year)', 'Intermediate (1-3 years)', 'Expert (3+ years)'];
const LANGUAGES = ['English', 'Hindi', 'Marathi', 'Gujarati', 'Bengali', 'Tamil', 'Telugu', 'Other'];
const HEARD_ABOUT = ['Social Media', 'Friend/Colleague', 'Search Engine', 'Other'];
const COLLAB = ['Yes, full-time', 'Yes, part-time', 'No, just sharing content'];

function parsePhone(raw?: string): { code: string; number: string } {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.startsWith('91') && digits.length > 10) return { code: '+91', number: digits.slice(2) };
  if (digits.length === 10) return { code: '+91', number: digits };
  return { code: '+91', number: digits };
}

function deriveCreatorUsername(instagram: string, fullName: string): string {
  const fromIg = extractCreatorHandle(instagram);
  if (fromIg && fromIg.length >= 3) return fromIg.slice(0, 30);
  const fromName = fullName.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();
  if (fromName.length >= 3) return fromName.slice(0, 30);
  return `cr_${Date.now().toString(36)}`.slice(0, 30);
}

function normalizeInstagramUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed.slice(0, 500);
  const handle = trimmed.replace(/^@/, '').replace(/\s/g, '');
  return handle ? `https://instagram.com/${handle}`.slice(0, 500) : '';
}

function normalizeOptionalUrl(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  if (/^https?:\/\//i.test(trimmed)) return trimmed.slice(0, 500);
  return `https://${trimmed.replace(/^\/+/, '')}`.slice(0, 500);
}

export default function BecomeCreatorScreen({ onBack }: { onBack: () => void }) {
  const insets = useSafeAreaInsets();
  const contentPadBottom = useBottomSafePadding(32);
  const { width } = useWindowDimensions();
  const { user, setUser: setContextUser } = useUserContext();

  const profile = user.creatorProfile;
  const parsedPhone = useMemo(() => parsePhone(user.phoneNumber), [user.phoneNumber]);

  // States
  const [fullName, setFullName] = useState(profile?.fullName || user.displayName || '');
  const [dob, setDob] = useState('');

  const handleDobChange = (text: string) => {
    const cleaned = text.replace(/\D/g, '');
    let formatted = cleaned;
    if (cleaned.length >= 3) {
      formatted = `${cleaned.slice(0, 2)} / ${cleaned.slice(2)}`;
    }
    if (cleaned.length >= 5) {
      formatted = `${cleaned.slice(0, 2)} / ${cleaned.slice(2, 4)} / ${cleaned.slice(4, 8)}`;
    }
    setDob(formatted);
  };
  
  const [email, setEmail] = useState(user.email || '');
  const [phoneCode, setPhoneCode] = useState(parsedPhone.code);
  const [phone, setPhone] = useState(parsedPhone.number);
  
  const [instagram, setInstagram] = useState(profile?.instagramUrl || '');
  const [youtube, setYoutube] = useState(profile?.youtubeUrl || '');
  const [otherLink, setOtherLink] = useState('');
  
  const [bio, setBio] = useState(profile?.bio || '');
  
  const [contentType, setContentType] = useState('');
  const [experience, setExperience] = useState('');
  const [languages, setLanguages] = useState<string[]>([]);
  
  const [followers, setFollowers] = useState('');
  const [engagement, setEngagement] = useState('');
  const [reach, setReach] = useState('');
  
  const [howHeard, setHowHeard] = useState('');
  const [collab, setCollab] = useState('');
  const [extraInfo, setExtraInfo] = useState('');
  const [portfolioItems, setPortfolioItems] = useState<PortfolioItem[]>(
    () => (profile?.portfolioLinks || []).map((url) => ({
      uri: url,
      type: 'image/jpeg',
      remoteUrl: url,
    })),
  );
  const [uploadingPortfolio, setUploadingPortfolio] = useState(false);
  
  const [submitting, setSubmitting] = useState(false);
  const [selectModal, setSelectModal] = useState<{
    visible: boolean; title: string; options: readonly string[]; selectedValue?: string; onSelect: (v: string) => void;
  } | null>(null);

  const toggleLanguage = (lang: string) => {
    setLanguages(prev => prev.includes(lang) ? prev.filter(l => l !== lang) : [...prev, lang]);
  };

  const buildApplicationReason = () => {
    return [
      `DOB: ${dob}`,
      `Content Type: ${contentType}`,
      `Experience: ${experience}`,
      `Languages: ${languages.join(', ')}`,
      `Followers: ${followers}`,
      `Engagement Rate: ${engagement}`,
      `Monthly Reach: ${reach}`,
      `Heard About: ${howHeard}`,
      `Collab Available: ${collab}`,
      `Extra Info: ${extraInfo}`,
      `Other Link: ${otherLink}`,
    ].filter(Boolean).join('\n');
  };

  const pickPortfolio = useCallback(async () => {
    if (uploadingPortfolio) return;
    if (portfolioItems.length >= 5) {
      Alert.alert('Limit reached', 'You can upload up to 5 files.');
      return;
    }
    try {
      const result = await launchImageLibrary({
        mediaType: 'mixed',
        selectionLimit: Math.max(1, 5 - portfolioItems.length),
        quality: 0.8,
        maxWidth: 1920,
        maxHeight: 1920,
      });
      if (result.didCancel) return;
      const assets = (result.assets || []).filter(a => a.uri);
      if (assets.length === 0) {
        Alert.alert('No file selected', result.errorMessage || 'Please choose a JPEG, PNG, WebP, or MP4 file.');
        return;
      }

      setUploadingPortfolio(true);
      const uploadedItems: PortfolioItem[] = [];
      for (const asset of assets) {
        const uri = asset.uri as string;
        const kind: 'image' | 'video' =
          Number(asset.duration) > 0 || String(asset.type || '').toLowerCase().startsWith('video/')
            ? 'video'
            : 'image';
        const type = normalizeUploadMime(
          kind,
          asset.type,
          (asset.fileName || '').split('.').pop(),
        );
        assertSupportedUploadMime(kind, type);
        const uploaded = kind === 'video'
          ? await uploadApi.uploadVideo(uri, undefined, type, asset.fileName)
          : await uploadApi.uploadImage(uri, type, asset.fileName);
        if (!uploaded?.url) {
          throw new Error('Upload failed');
        }
        uploadedItems.push({
          uri: uploaded.url,
          type,
          name: asset.fileName || undefined,
          remoteUrl: uploaded.url,
        });
      }
      setPortfolioItems(prev => [...prev, ...uploadedItems].slice(0, 5));
    } catch (err: unknown) {
      Alert.alert('Upload failed', caughtErrorMessage(err, 'Could not upload this file. Please try a JPEG or PNG under 5MB.'));
    } finally {
      setUploadingPortfolio(false);
    }
  }, [portfolioItems.length, uploadingPortfolio]);

  const submitApplication = async (confirmSwitch: boolean = false) => {
    setSubmitting(true);
    try {
      const username = deriveCreatorUsername(instagram, fullName);
      const instagramUrl = normalizeInstagramUrl(instagram);
      const portfolioLinks = portfolioItems
        .map((item) => item.remoteUrl || (isRemoteUrl(item.uri) ? item.uri : ''))
        .filter(Boolean);
      if (portfolioItems.length > 0 && portfolioLinks.length !== portfolioItems.length) {
        throw new Error('A portfolio file is still uploading. Wait for it to finish, or remove it and try again.');
      }

      const res = await socialApi.applyCreator({
        username,
        fullName: fullName.trim(),
        bio: bio.trim(),
        travelCategories: contentType ? [contentType] : [],
        instagramUrl,
        youtubeUrl: normalizeOptionalUrl(youtube),
        applicationReason: buildApplicationReason().slice(0, 1000),
        languages,
        confirmSwitch: confirmSwitch || undefined,
        portfolioLinks: portfolioLinks.length ? portfolioLinks : undefined,
      });
      const data = res.data || res;

      const updatedUser: UserProfile = {
        ...user,
        ...(confirmSwitch ? { roles: (user.roles || []).filter(r => String(r) !== 'VENDOR') } : {}),
        creatorProfile: {
          id: data.id,
          username: data.username,
          fullName: data.fullName,
          bio: data.bio || '',
          travelCategories: data.travelCategories || [],
          instagramUrl: data.instagramUrl,
          youtubeUrl: data.youtubeUrl,
          applicationReason: data.applicationReason,
          portfolioLinks: data.portfolioLinks || portfolioLinks,
          status: 'PENDING',
          followerCount: 0,
          totalViews: 0,
          verified: false,
        },
      };
      setContextUser(updatedUser);
      Alert.alert('Application Submitted', 'Your creator application is under review.', [{ text: 'OK', onPress: onBack }]);
    } catch (err: unknown) {
      if (!confirmSwitch && getApiErrorCode(err) === ApiErrorCodes.SWITCH_CONFIRMATION_REQUIRED) {
        Alert.alert('Switch to Creator?', 'Continuing will retire your Vendor role.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Continue', style: 'destructive', onPress: () => { void submitApplication(true); } },
        ]);
        return;
      }
      Alert.alert('Application Failed', caughtErrorMessage(err, 'Failed to submit.'));
    } finally {
      setSubmitting(false);
    }
  };

  const validateAndSubmit = () => {
    if (uploadingPortfolio) {
      Alert.alert('Upload in progress', 'Wait for the portfolio image to finish uploading.');
      return;
    }
    if (
      !fullName.trim()
      || !email.trim()
      || !phone.trim()
      || !dob.trim()
      || !bio.trim()
      || bio.trim().length < 20
      || !contentType
      || !experience
      || languages.length === 0
      || !howHeard
      || !collab
    ) {
      Alert.alert(
        'Missing Fields',
        'Please fill in all required fields (marked with *). Your bio must be at least 20 characters.',
      );
      return;
    }
    if (!normalizeInstagramUrl(instagram)) {
      Alert.alert('Instagram required', 'Add your Instagram handle or profile link before submitting.');
      return;
    }
    void submitApplication(false);
  };

  const renderInput = (
    label: string, icon: string, value: string, onChange: (t: string) => void, placeholder: string, required?: boolean, options?: any
  ) => (
    <View style={styles.fieldCol}>
      <Text style={styles.label}>{label}{required && <Text style={styles.req}> *</Text>}</Text>
      <View style={styles.inputWrap}>
        <Icon name={icon} size={18} color={CF.textMuted} style={styles.inputIcon} />
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={CF.textMuted}
          keyboardType={options?.keyboard || 'default'}
          maxLength={options?.maxLength}
        />
      </View>
    </View>
  );

  const renderSelect = (label: string, value: string, options: string[], onSelect: (v: string) => void, required?: boolean) => (
    <View style={styles.fieldCol}>
      <Text style={styles.label}>{label}{required && <Text style={styles.req}> *</Text>}</Text>
      <TouchableOpacity
        style={styles.inputWrap}
        onPress={() => setSelectModal({ visible: true, title: label, options, selectedValue: value, onSelect })}
        activeOpacity={0.8}
      >
        <Text style={[styles.input, { color: value ? CF.text : CF.textMuted, paddingTop: 14 }]}>
          {value || 'Select an option'}
        </Text>
        <Icon name="chevron-down" size={18} color={CF.textMuted} style={styles.inputIconRight} />
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        
        <TouchableOpacity style={[styles.backBtn, { top: insets.top + 10 }]} onPress={onBack}>
          <Icon name="arrow-back" size={22} color="#333" />
        </TouchableOpacity>

        <ScrollView contentContainerStyle={{ paddingBottom: contentPadBottom }} showsVerticalScrollIndicator={false}>
          
          <View style={styles.heroWrap}>
            <Image source={require('../assets/traveler_banner.jpg')} style={styles.heroImg} resizeMode="cover" />
            <View style={styles.sheetTopRounded} />
          </View>

          <View style={styles.sheetContent}>
            
            <View style={styles.avatarWrap}>
              <View style={styles.avatarInner}>
                <Icon name="star-outline" size={24} color={CF.primary} style={styles.avatarStar} />
                <Icon name="people" size={20} color={CF.primary} />
              </View>
            </View>

            <Text style={styles.pageTitle}>Creator Application</Text>
            <Text style={styles.pageSub}>Join our creator community and inspire travelers</Text>

            <View style={styles.benefitsInline}>
              <Text style={styles.benefitText}>⭐ Earn Points</Text>
              <View style={styles.divLine} />
              <Text style={styles.benefitText}>👥 Grow Your Audience</Text>
              <View style={styles.divLine} />
              <Text style={styles.benefitText}>🎁 Exclusive Benefits</Text>
            </View>

            <View style={styles.whyCard}>
              <Text style={styles.whyTitle}>Why Join PalSafar Creator Program?</Text>
              <View style={styles.whyRow}>
                <View style={styles.whyItem}>
                  <Icon name="trophy-outline" size={24} color={CF.primary} />
                  <Text style={styles.whyItemTitle}>Earn Rewards</Text>
                  <Text style={styles.whyItemSub}>Get points for your amazing content</Text>
                </View>
                <View style={styles.whyItem}>
                  <Icon name="people-outline" size={24} color={CF.primary} />
                  <Text style={styles.whyItemTitle}>Build Community</Text>
                  <Text style={styles.whyItemSub}>Connect with travelers and creators</Text>
                </View>
                <View style={styles.whyItem}>
                  <Icon name="bag-check-outline" size={24} color={CF.primary} />
                  <Text style={styles.whyItemTitle}>Exclusive Access</Text>
                  <Text style={styles.whyItemSub}>Early access to features and events</Text>
                </View>
              </View>
            </View>

            {/* 01 Personal Info */}
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeaderRow}>
                <View style={styles.sectionNumber}><Text style={styles.sectionNumberTxt}>01</Text></View>
                <Icon name="lock-closed-outline" size={18} color={CF.primary} />
                <Text style={styles.sectionTitle}>Personal Information</Text>
              </View>
              <View style={styles.row}>
                <View style={styles.flex}>{renderInput('Full Name', 'person-outline', fullName, setFullName, 'Enter your full name', true)}</View>
                <View style={styles.flex}>{renderInput('Date of Birth', 'calendar-outline', dob, handleDobChange, 'DD / MM / YYYY', true, { keyboard: 'number-pad', maxLength: 14 })}</View>
              </View>
            </View>

            {/* 02 Contact Info */}
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeaderRow}>
                <View style={styles.sectionNumber}><Text style={styles.sectionNumberTxt}>02</Text></View>
                <Icon name="call-outline" size={18} color={CF.primary} />
                <Text style={styles.sectionTitle}>Contact Information</Text>
              </View>
              <View style={styles.row}>
                <View style={styles.flex}>{renderInput('Email Address', 'mail-outline', email, setEmail, 'youremail@example.com', true, { keyboard: 'email-address' })}</View>
                <View style={styles.flex}>
                  {renderInput('Phone Number', 'call-outline', phone, setPhone, 'Enter your phone number', true, { keyboard: 'phone-pad' })}
                </View>
              </View>
            </View>

            {/* 03 Social Media */}
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeaderRow}>
                <View style={styles.sectionNumber}><Text style={styles.sectionNumberTxt}>03</Text></View>
                <Icon name="share-social-outline" size={18} color={CF.primary} />
                <Text style={styles.sectionTitle}>Social Media Links</Text>
              </View>
              <View style={styles.row}>
                <View style={styles.flex}>{renderInput('Instagram Handle', 'logo-instagram', instagram, setInstagram, '@yourusername', true)}</View>
                <View style={styles.flex}>{renderInput('YouTube Channel', 'logo-youtube', youtube, setYoutube, 'youtube.com/@yourchannel')}</View>
                <View style={styles.flex}>{renderInput('Other Link (Optional)', 'link-outline', otherLink, setOtherLink, 'https://...')}</View>
              </View>
            </View>

            {/* 04 About You */}
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeaderRow}>
                <View style={styles.sectionNumber}><Text style={styles.sectionNumberTxt}>04</Text></View>
                <Icon name="person-outline" size={18} color={CF.primary} />
                <Text style={styles.sectionTitle}>About You</Text>
              </View>
              <Text style={styles.label}>Short Bio<Text style={styles.req}> *</Text></Text>
              <View style={styles.bioBox}>
                <TextInput
                  style={styles.bioInput}
                  value={bio}
                  onChangeText={v => setBio(v.slice(0, 250))}
                  placeholder="Tell us about yourself, your content and what makes you unique..."
                  multiline
                  textAlignVertical="top"
                />
                <Text style={styles.charCount}>{bio.length} / 250</Text>
              </View>
            </View>

            {/* 05 Content Details */}
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeaderRow}>
                <View style={styles.sectionNumber}><Text style={styles.sectionNumberTxt}>05</Text></View>
                <Icon name="document-text-outline" size={18} color={CF.primary} />
                <Text style={styles.sectionTitle}>Content Details</Text>
              </View>
              <View style={styles.row}>
                <View style={styles.flex}>{renderSelect('Primary Content Type', contentType, CONTENT_TYPES, setContentType, true)}</View>
                <View style={styles.flex}>{renderSelect('Travel Experience', experience, EXPERIENCES, setExperience, true)}</View>
              </View>
              
              <Text style={[styles.label, { marginTop: 16 }]}>Content Languages<Text style={styles.req}> *</Text></Text>
              <Text style={styles.helperText}>Select all languages you create content in</Text>
              <View style={styles.chipRow}>
                {LANGUAGES.map(lang => (
                  <TouchableOpacity
                    key={lang}
                    style={[styles.chip, languages.includes(lang) && styles.chipActive]}
                    onPress={() => toggleLanguage(lang)}
                  >
                    <Text style={[styles.chipTxt, languages.includes(lang) && styles.chipTxtActive]}>{lang}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* 06 Upload Portfolio */}
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeaderRow}>
                <View style={styles.sectionNumber}><Text style={styles.sectionNumberTxt}>06</Text></View>
                <Icon name="cloud-upload-outline" size={18} color={CF.primary} />
                <Text style={styles.sectionTitle}>Upload Portfolio</Text>
              </View>
              <Text style={styles.helperText}>Share your best work samples (Images/Videos)</Text>
              <TouchableOpacity
                style={styles.uploadBox}
                activeOpacity={0.7}
                onPress={() => { void pickPortfolio(); }}
                disabled={uploadingPortfolio || submitting}
              >
                <Icon name="cloud-upload-outline" size={32} color={CF.text} style={{ marginBottom: 8 }} />
                <Text style={styles.uploadBold}>Tap to upload images/videos</Text>
                <Text style={styles.uploadSub}>JPG, PNG, WebP, MP4 • up to 5 files • images max 5MB</Text>
                {uploadingPortfolio ? (
                  <ActivityIndicator style={{ marginTop: 8 }} color={CF.primary} />
                ) : null}
              </TouchableOpacity>
              {portfolioItems.length > 0 ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                  {portfolioItems.map((item, idx) => (
                    <TouchableOpacity
                      key={`${item.uri}-${idx}`}
                      onPress={() => setPortfolioItems(prev => prev.filter((_, i) => i !== idx))}
                      style={{ width: 64, height: 64, borderRadius: 8, overflow: 'hidden', backgroundColor: CF.border }}
                    >
                      {item.type.startsWith('video/') ? (
                        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                          <Icon name="videocam-outline" size={22} color={CF.text} />
                        </View>
                      ) : (
                        <Image source={{ uri: item.remoteUrl || item.uri }} style={{ width: 64, height: 64 }} />
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              ) : null}
            </View>

            {/* 07 Additional Information */}
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeaderRow}>
                <View style={styles.sectionNumber}><Text style={styles.sectionNumberTxt}>07</Text></View>
                <Icon name="information-circle-outline" size={18} color={CF.primary} />
                <Text style={styles.sectionTitle}>Additional Information</Text>
              </View>
              <View style={styles.row}>
                <View style={styles.flex}>{renderSelect('How did you hear about us?', howHeard, HEARD_ABOUT, setHowHeard, true)}</View>
                <View style={styles.flex}>{renderSelect('Are you available for collaborations?', collab, COLLAB, setCollab, true)}</View>
              </View>

              <Text style={[styles.label, { marginTop: 16 }]}>Anything else you'd like to tell us?</Text>
              <View style={styles.bioBox}>
                <TextInput
                  style={styles.bioInput}
                  value={extraInfo}
                  onChangeText={v => setExtraInfo(v.slice(0, 250))}
                  placeholder="Additional information..."
                  multiline
                  textAlignVertical="top"
                />
                <Text style={styles.charCount}>{extraInfo.length} / 250</Text>
              </View>
            </View>

            <TouchableOpacity style={styles.submitBtn} onPress={validateAndSubmit} disabled={submitting || uploadingPortfolio}>
              {submitting ? <ActivityIndicator color="#FFF" /> : (
                <>
                  <Text style={styles.submitBtnTxt}>Submit Application</Text>
                  <Icon name="paper-plane-outline" size={18} color="#FFF" />
                </>
              )}
            </TouchableOpacity>

            <Text style={styles.footerLegal}>
              By submitting this form, you agree to our <Text style={styles.legalLink}>Terms & Conditions</Text> and <Text style={styles.legalLink}>Privacy Policy</Text>.
            </Text>

          </View>
        </ScrollView>
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
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: CF.bg },
  flex: { flex: 1 },
  row: { flexDirection: 'row', gap: 12 },
  backBtn: {
    position: 'absolute', zIndex: 10, left: 16,
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center', justifyContent: 'center',
  },
  heroWrap: {
    width: '100%',
    height: 220,
    position: 'relative',
  },
  heroImg: { width: '100%', height: '100%' },
  sheetTopRounded: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    height: 30, backgroundColor: CF.bg,
    borderTopLeftRadius: 30, borderTopRightRadius: 30,
  },
  sheetContent: {
    backgroundColor: CF.bg,
    paddingHorizontal: 16,
    alignItems: 'center',
    paddingTop: 10,
  },
  avatarWrap: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: '#FFF',
    borderWidth: 2, borderColor: CF.primary,
    alignItems: 'center', justifyContent: 'center',
    marginTop: -50, marginBottom: 16,
  },
  avatarInner: {
    width: 66, height: 66, borderRadius: 33,
    borderWidth: 1, borderColor: CF.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarStar: { position: 'absolute', top: 4 },
  pageTitle: { fontFamily: SERIF, fontSize: 24, color: CF.text, marginBottom: 4 },
  pageSub: { fontFamily: SANS, fontSize: 13, color: CF.textSecondary, marginBottom: 16 },
  
  benefitsInline: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 24 },
  benefitText: { fontFamily: SANS_SEMI, fontSize: 11, color: CF.text },
  divLine: { width: 1, height: 12, backgroundColor: CF.border },

  whyCard: {
    width: '100%', backgroundColor: '#FFF', borderRadius: 12,
    borderWidth: 1, borderColor: CF.border,
    padding: 16, marginBottom: 24,
  },
  whyTitle: { fontFamily: SANS_BOLD, fontSize: 14, color: CF.text, textAlign: 'center', marginBottom: 16 },
  whyRow: { flexDirection: 'row', justifyContent: 'space-between' },
  whyItem: { flex: 1, alignItems: 'center', paddingHorizontal: 4 },
  whyItemTitle: { fontFamily: SANS_BOLD, fontSize: 11, color: CF.text, marginTop: 8, marginBottom: 4, textAlign: 'center' },
  whyItemSub: { fontFamily: SANS, fontSize: 9, color: CF.textSecondary, textAlign: 'center' },

  sectionCard: {
    width: '100%', backgroundColor: '#FFF', borderRadius: 12,
    borderWidth: 1, borderColor: CF.border,
    padding: 16, marginBottom: 16,
  },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
  sectionNumber: { width: 24, height: 24, borderRadius: 12, backgroundColor: CF.primary, alignItems: 'center', justifyContent: 'center' },
  sectionNumberTxt: { color: '#FFF', fontSize: 11, fontFamily: SANS_BOLD },
  sectionTitle: { fontFamily: SANS_BOLD, fontSize: 15, color: CF.text },

  fieldCol: { marginBottom: 12 },
  label: { fontFamily: SANS_SEMI, fontSize: 12, color: CF.text, marginBottom: 6 },
  req: { color: '#D93025' },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: CF.border, borderRadius: 8,
    backgroundColor: '#FFF',
    height: 44, paddingHorizontal: 12,
  },
  inputIcon: { marginRight: 8 },
  inputIconRight: { marginLeft: 'auto' },
  input: { flex: 1, fontFamily: SANS, fontSize: 13, color: CF.text, height: 44 },

  phoneWrap: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: CF.border, borderRadius: 8,
    backgroundColor: '#FFF', height: 44,
  },
  phoneCodeBox: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, borderRightWidth: 1, borderRightColor: CF.border,
    height: '100%',
  },
  phoneCodeTxt: { fontFamily: SANS_SEMI, fontSize: 13, color: CF.text },

  bioBox: {
    borderWidth: 1, borderColor: CF.border, borderRadius: 8,
    backgroundColor: '#FFF', padding: 12,
  },
  bioInput: { fontFamily: SANS, fontSize: 13, color: CF.text, height: 60 },
  charCount: { fontFamily: SANS, fontSize: 10, color: CF.textMuted, textAlign: 'right', marginTop: 4 },

  helperText: { fontFamily: SANS, fontSize: 11, color: CF.textSecondary, marginBottom: 8 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 16, paddingVertical: 8,
    borderRadius: 20, borderWidth: 1, borderColor: CF.border, backgroundColor: '#FFF',
  },
  chipActive: { borderColor: CF.primary, backgroundColor: '#FDF7F2' },
  chipTxt: { fontFamily: SANS, fontSize: 12, color: CF.textSecondary },
  chipTxtActive: { color: CF.primary, fontFamily: SANS_SEMI },

  uploadBox: {
    borderWidth: 1.5, borderColor: CF.border, borderStyle: 'dashed',
    borderRadius: 12, padding: 24, alignItems: 'center', backgroundColor: '#FAFAFA',
  },
  uploadBold: { fontFamily: SANS_BOLD, fontSize: 12, color: CF.text, marginBottom: 4 },
  uploadSub: { fontFamily: SANS, fontSize: 10, color: CF.textMuted },

  submitBtn: {
    width: '100%', backgroundColor: CF.primary,
    borderRadius: 24, height: 48,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginVertical: 16,
  },
  submitBtnTxt: { fontFamily: SANS_BOLD, fontSize: 15, color: '#FFF' },

  footerLegal: { fontFamily: SANS, fontSize: 10, color: CF.textSecondary, textAlign: 'center', marginBottom: 24 },
  legalLink: { color: CF.primary, fontFamily: SANS_SEMI },
});
