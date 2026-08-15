import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Linking,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { collaborationsApi, type CollaborationItem } from '../services/api/collaborations';
import {
  ReasonPromptModal,
  promptDeclineWithOptions,
  promptWithReason,
} from '../components/ReasonPromptModal';
import { useBottomSafePadding } from '../design/responsive';
import { CollaborationTimeline, ContextAwareActionFooter } from '../features/creator/components/CollaborationDetailWidgets';

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
  red: '#D32F2F',
  pending: '#F59E0B',
};

type AndroidPromptState = {
  title: string;
  message?: string;
  placeholder?: string;
  defaultValue?: string;
  confirmLabel?: string;
  required?: boolean;
  onConfirm: (reason: string) => void;
};

function StatusTimeline({ status, rejectionReason }: { status: string; rejectionReason?: string | null }) {
  const steps = [
    { key: 'PENDING', label: 'Request Sent', active: true },
    { key: 'ACCEPTED', label: 'Accepted', active: ['ACCEPTED', 'IN_PROGRESS', 'REEL_UPLOADED', 'REVISION_REQUESTED', 'APPROVED', 'COMPLETED'].includes(status) },
    { key: 'COMPLETED', label: 'Completed', active: ['COMPLETED', 'APPROVED'].includes(status) },
  ];

  if (status === 'REJECTED' || status === 'CANCELLED') {
    return (
      <View style={styles.timelineBox}>
        <View style={styles.timelineRow}>
          <Icon name="close-circle" size={24} color={C.red} />
          <Text style={[styles.timelineText, { color: C.red }]}>
            {status === 'REJECTED' ? 'Request Rejected' : 'Request Cancelled'}
          </Text>
        </View>
        {rejectionReason ? <Text style={styles.rejectReason}>Reason: {rejectionReason}</Text> : null}
      </View>
    );
  }

  return (
    <View style={styles.timelineBox}>
      {steps.map((step, index) => (
        <View key={step.key} style={styles.timelineStep}>
          <View style={styles.timelineIconWrap}>
            <View style={[styles.timelineDot, step.active && styles.timelineDotActive]} />
            {index < steps.length - 1 && <View style={[styles.timelineLine, step.active && steps[index+1]?.active && styles.timelineLineActive]} />}
          </View>
          <Text style={[styles.timelineLabel, step.active && styles.timelineLabelActive]}>{step.label}</Text>
        </View>
      ))}
    </View>
  );
}

export default function CollaborationDetailScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const collaborationId = route.params?.collaborationId as string;
  const queryClient = useQueryClient();
  const [acting, setActing] = useState(false);
  const [androidPrompt, setAndroidPrompt] = useState<AndroidPromptState | null>(null);
  const insets = useSafeAreaInsets();
  const contentPadBottom = useBottomSafePadding(24);

  const openAndroidModal = (
    opts: Omit<AndroidPromptState, 'onConfirm'>,
    onConfirm: (reason: string) => void,
  ) => {
    setAndroidPrompt({ ...opts, onConfirm });
  };

  const { data: item, isLoading, refetch, error } = useQuery({
    queryKey: ['collaboration', collaborationId],
    queryFn: async () => {
      const res = await collaborationsApi.getById(collaborationId);
      return ((res as any)?.data?.data ?? (res as any)?.data) as CollaborationItem;
    },
    enabled: !!collaborationId,
  });

  const role = item?.viewerRole || 'other';
  const isCreator = role === 'creator';
  const isVendor = role === 'vendor';

  const runAction = async (label: string, fn: () => Promise<unknown>) => {
    setActing(true);
    try {
      await fn();
      await refetch();
      queryClient.invalidateQueries({ queryKey: ['collaborations'] });
      Alert.alert('Done', label);
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Action failed');
    } finally {
      setActing(false);
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safe}>
        <ActivityIndicator style={{ marginTop: 60 }} color={C.brown} />
      </SafeAreaView>
    );
  }

  if (error || !item) {
    return (
      <SafeAreaView style={styles.safe}>
        <Text style={styles.errorText}>Collaboration not found</Text>
        <TouchableOpacity onPress={() => navigation.goBack()}><Text style={styles.link}>Go back</Text></TouchableOpacity>
      </SafeAreaView>
    );
  }

  let parsedBrief: any = null;
  try {
    if (item.campaignBrief && item.campaignBrief.includes('_isStructured')) {
      parsedBrief = JSON.parse(item.campaignBrief);
    }
  } catch (e) {}

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right']}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Icon name="chevron-back" size={24} color={C.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Request Details</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: contentPadBottom }]}>
        
        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <Text style={styles.cardLabel}>Collaboration Type</Text>
            <Text style={styles.cardValue}>Promotion on PalSafar</Text>
          </View>
          
          <View style={styles.divider} />

          <Text style={styles.cardLabel}>Services Requested</Text>
          <View style={styles.chipWrap}>
            {parsedBrief?.servicesRequested?.length ? parsedBrief.servicesRequested.map((s: string) => (
              <View key={s} style={styles.chip}><Text style={styles.chipText}>{s}</Text></View>
            )) : (
              <View style={styles.chip}><Text style={styles.chipText}>1 Reel</Text></View>
            )}
          </View>

          <View style={styles.divider} />

          <View style={styles.rowBetween}>
            <Text style={styles.cardLabel}>Goal</Text>
            <Text style={styles.cardValue}>{parsedBrief?.campaignGoal || item.campaignCategory}</Text>
          </View>
          
          <View style={styles.divider} />
          
          <View style={styles.rowBetween}>
            <Text style={styles.cardLabel}>Campaign Duration</Text>
            <Text style={styles.cardValue}>{parsedBrief?.startDate} – {parsedBrief?.endDate}</Text>
          </View>
          
          <View style={styles.divider} />
          
          <View style={styles.rowBetween}>
            <Text style={styles.cardLabel}>Budget</Text>
            <Text style={styles.cardValue}>
              {item.budgetFormatted} {parsedBrief?.budgetNegotiable ? <Text style={styles.negotiable}> Negotiable</Text> : ''}
            </Text>
          </View>

          {parsedBrief?.benefitsOffered?.length ? (
            <>
              <View style={styles.divider} />
              <View style={styles.rowBetween}>
                <Text style={styles.cardLabel}>Additional Benefits</Text>
                <Text style={styles.cardValue}>{parsedBrief.benefitsOffered.join(', ')}</Text>
              </View>
            </>
          ) : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardSectionTitle}>About Business</Text>
          <Text style={styles.bodyText}>
            {parsedBrief?.businessDetails || (!parsedBrief ? item.campaignBrief : 'No details provided.')}
          </Text>
          
          {parsedBrief?.highlightPoints?.length ? (
            <>
              <Text style={[styles.cardSectionTitle, { marginTop: 16 }]}>Key Highlights</Text>
              <View style={styles.chipWrap}>
                {parsedBrief.highlightPoints.map((h: string) => (
                  <View key={h} style={styles.chipOutline}><Text style={styles.chipOutlineText}>{h}</Text></View>
                ))}
              </View>
            </>
          ) : null}
        </View>

        {!item.contactsUnlocked ? (
          <View style={styles.lockedCard}>
            <Icon name="lock-closed" size={20} color={C.textMuted} />
            <Text style={styles.lockedText}>Contact details unlock after the creator accepts.</Text>
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.cardSectionTitle}>Contact Details</Text>
            {item.contactPerson ? <Text style={styles.bodyText}>{item.contactPerson}</Text> : null}
            {item.contactPhone ? (
              <TouchableOpacity onPress={() => Linking.openURL(`tel:${item.contactPhone}`)}>
                <Text style={styles.link}>📞 {item.contactPhone}</Text>
              </TouchableOpacity>
            ) : null}
            {item.contactWhatsApp ? (
              <TouchableOpacity onPress={() => Linking.openURL(`https://wa.me/${item.contactWhatsApp?.replace(/\D/g, '')}`)}>
                <Text style={styles.link}>WhatsApp: {item.contactWhatsApp}</Text>
              </TouchableOpacity>
            ) : null}
            {item.contactEmail ? (
              <TouchableOpacity onPress={() => Linking.openURL(`mailto:${item.contactEmail}`)}>
                <Text style={styles.link}>✉️ {item.contactEmail}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        )}

        {item.notes ? (
          <View style={styles.card}>
            <Text style={styles.cardSectionTitle}>Additional Notes</Text>
            <Text style={styles.bodyText}>{item.notes}</Text>
          </View>
        ) : null}

        {isCreator ? (
          <CollaborationTimeline status={item.status} />
        ) : (
          <>
            <Text style={styles.sectionHeader}>Status Timeline</Text>
            <StatusTimeline status={item.status} rejectionReason={item.rejectionReason} />
          </>
        )}

        {acting && <ActivityIndicator color={C.brown} style={{ marginVertical: 12 }} />}

        {isVendor && ['PENDING'].includes(item.status) ? (
          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.outlineBtn}
              disabled={acting}
              onPress={() =>
                promptWithReason(
                  {
                    title: 'Cancel campaign',
                    message: 'Reason (optional)',
                    placeholder: 'Why are you cancelling?',
                    defaultValue: 'Cancelled',
                  },
                  (reason) =>
                    runAction('Campaign cancelled', () => collaborationsApi.cancel(item.id, reason || 'Cancelled')),
                  openAndroidModal,
                )
              }
            >
              <Text style={[styles.outlineBtnText, { color: C.red, borderColor: C.red }]}>Cancel Request</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </ScrollView>

      {isCreator ? (
        <ContextAwareActionFooter
          status={item.status}
          onAccept={() => runAction('Collaboration accepted', () => collaborationsApi.accept(item.id))}
          onDecline={() =>
            promptDeclineWithOptions(
              'Decline',
              (reason) => runAction('Collaboration declined', () => collaborationsApi.reject(item.id, reason)),
              openAndroidModal,
              { quick: 'Declined' },
            )
          }
          onMessage={() => {
            const phone = item.contactWhatsApp || item.contactPhone;
            if (phone) Linking.openURL(`https://wa.me/${phone.replace(/\D/g, '')}`);
            else if (item.contactEmail) Linking.openURL(`mailto:${item.contactEmail}`);
            else Alert.alert('No contact info', 'Vendor has not provided contact details yet.');
          }}
          onStart={() => navigation.navigate('CreateReel', { collaborationId: item.id })}
          onSubmitContent={() => navigation.navigate('CreateReel', { collaborationId: item.id })}
          onViewContent={() => Alert.alert('View Content', 'This would open the reel viewer.')}
          onViewEarnings={() => navigation.navigate('Wallet')}
        />
      ) : null}

      <ReasonPromptModal
        visible={!!androidPrompt}
        title={androidPrompt?.title ?? ''}
        message={androidPrompt?.message}
        placeholder={androidPrompt?.placeholder}
        defaultValue={androidPrompt?.defaultValue}
        confirmLabel={androidPrompt?.confirmLabel}
        required={androidPrompt?.required}
        onConfirm={(reason) => {
          androidPrompt?.onConfirm(reason);
          setAndroidPrompt(null);
        }}
        onCancel={() => setAndroidPrompt(null)}
      />
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
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700', color: C.text },
  content: { padding: 16, paddingBottom: 60 },
  
  errorText: { textAlign: 'center', marginTop: 100, fontSize: 16, color: C.textMuted },
  
  card: {
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
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  divider: { height: 1, backgroundColor: C.border, marginVertical: 16 },
  
  cardLabel: { fontSize: 14, fontWeight: '600', color: C.text },
  cardValue: { fontSize: 14, color: C.textSub, flex: 1, textAlign: 'right', marginLeft: 16 },
  negotiable: { fontSize: 12, color: C.textMuted },
  
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 12 },
  chip: {
    backgroundColor: C.bg,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: C.border,
    marginRight: 8,
    marginBottom: 8,
  },
  chipText: { fontSize: 13, fontWeight: '600', color: C.brown },
  
  chipOutline: {
    backgroundColor: 'transparent',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: C.border,
    marginRight: 8,
    marginBottom: 8,
  },
  chipOutlineText: { fontSize: 13, color: C.textSub },
  
  cardSectionTitle: { fontSize: 15, fontWeight: '700', color: C.text, marginBottom: 8 },
  bodyText: { fontSize: 14, color: C.textSub, lineHeight: 22 },
  
  lockedCard: {
    backgroundColor: '#F5F5F5',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  lockedText: { fontSize: 13, color: C.textMuted, marginLeft: 12, flex: 1 },
  
  link: { fontSize: 15, color: C.brown, fontWeight: '600', marginVertical: 6 },
  
  sectionHeader: { fontSize: 18, fontWeight: '700', color: C.text, marginTop: 16, marginBottom: 12, paddingHorizontal: 4 },
  
  timelineBox: {
    backgroundColor: C.white,
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: 24,
  },
  timelineStep: { flexDirection: 'row', alignItems: 'flex-start' },
  timelineIconWrap: { alignItems: 'center', width: 24, marginRight: 12 },
  timelineDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: C.border, marginTop: 4, zIndex: 1 },
  timelineDotActive: { backgroundColor: C.green },
  timelineLine: { width: 2, height: 32, backgroundColor: C.border, marginTop: -4, marginBottom: -4, zIndex: 0 },
  timelineLineActive: { backgroundColor: C.green },
  timelineLabel: { fontSize: 15, color: C.textMuted, marginTop: 1 },
  timelineLabelActive: { color: C.text, fontWeight: '600' },
  
  timelineRow: { flexDirection: 'row', alignItems: 'center' },
  timelineText: { fontSize: 15, fontWeight: '600', marginLeft: 8 },
  rejectReason: { fontSize: 14, color: C.textSub, marginTop: 8, paddingLeft: 32 },
  
  actions: { flexDirection: 'row', gap: 12, marginTop: 8 },
  primaryBtn: {
    backgroundColor: C.brown,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  primaryBtnText: { color: C.white, fontSize: 15, fontWeight: '700' },
  outlineBtn: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  outlineBtnText: { color: C.textSub, fontSize: 15, fontWeight: '700' },
});
