import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
  ScrollView,
  Platform,
} from 'react-native';
import Video from 'react-native-video';
import Icon from 'react-native-vector-icons/Ionicons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { collaborationsApi, type CollaborationItem } from '../services/api/collaborations';
import { colors } from '../config/theme';
import { ReasonPromptModal, promptWithReason } from '../components/ReasonPromptModal';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBottomSafePadding } from '../design/responsive';

type AndroidPromptState = {
  title: string;
  message?: string;
  placeholder?: string;
  defaultValue?: string;
  confirmLabel?: string;
  required?: boolean;
  onConfirm: (reason: string) => void;
};

export default function CollaborationReviewScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const collaborationId = route.params?.collaborationId as string;
  const queryClient = useQueryClient();
  const [feedback, setFeedback] = useState('');
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

  const { data: item, isLoading, refetch } = useQuery({
    queryKey: ['collaboration', collaborationId],
    queryFn: async () => {
      const res = await collaborationsApi.getById(collaborationId);
      return ((res as any)?.data?.data ?? (res as any)?.data) as CollaborationItem;
    },
    enabled: !!collaborationId,
  });

  const act = async (label: string, fn: () => Promise<unknown>) => {
    setActing(true);
    try {
      await fn();
      await refetch();
      queryClient.invalidateQueries({ queryKey: ['collaborations'] });
      Alert.alert('Success', label, [{ text: 'OK', onPress: () => navigation.goBack() }]);
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed');
    } finally {
      setActing(false);
    }
  };

  if (isLoading || !item) {
    return (
      <SafeAreaView style={styles.safe}>
        <ActivityIndicator style={{ marginTop: 60 }} color={colors.primary} />
      </SafeAreaView>
    );
  }

  const creatorName = item.creator?.fullName || item.creator?.username || 'Creator';

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right']}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Icon name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Review Reel</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: contentPadBottom }]}>
        <Text style={styles.hero}>{creatorName} uploaded your collaboration reel</Text>
        <Text style={styles.sub}>{item.campaignTitle}</Text>

        {item.reel?.videoUrl ? (
          <View style={styles.videoWrap}>
            <Video
              source={{ uri: item.reel.videoUrl }}
              style={styles.video}
              resizeMode="contain"
              controls
              paused={false}
            />
          </View>
        ) : (
          <Text style={styles.sub}>No preview available</Text>
        )}

        <Text style={styles.label}>Request changes (optional feedback)</Text>
        <TextInput
          style={styles.input}
          value={feedback}
          onChangeText={setFeedback}
          placeholder="Describe what to revise..."
          placeholderTextColor={colors.textMuted}
          multiline
        />

        {acting ? <ActivityIndicator color={colors.primary} style={{ marginVertical: 12 }} /> : null}

        <TouchableOpacity
          style={styles.approveBtn}
          disabled={acting}
          onPress={() => act('Reel approved and published', () => collaborationsApi.approveReel(item.id))}
        >
          <Text style={styles.approveText}>Approve & Publish</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.revisionBtn}
          disabled={acting || feedback.trim().length < 10}
          onPress={() => act('Revision requested', () => collaborationsApi.requestRevision(item.id, feedback.trim()))}
        >
          <Text style={styles.revisionText}>Request Changes</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.rejectBtn}
          disabled={acting}
          onPress={() => {
            const reject = (reason: string) => {
              if (!reason.trim()) {
                Alert.alert('Reason required', 'Please provide a reason for rejecting this reel.');
                return;
              }
              act('Reel rejected', () => collaborationsApi.rejectReel(item.id, reason.trim()));
            };

            if (Platform.OS === 'android') {
              openAndroidModal(
                {
                  title: 'Reject reel',
                  message: 'Tell the creator why this reel was rejected.',
                  placeholder: 'Reason…',
                  confirmLabel: 'Reject',
                  required: true,
                },
                reject,
              );
              return;
            }

            promptWithReason(
              { title: 'Reject reel', message: 'Reason', placeholder: 'Reason…', required: true },
              reject,
              openAndroidModal,
            );
          }}
        >
          <Text style={styles.rejectText}>Reject Reel</Text>
        </TouchableOpacity>
      </ScrollView>

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
  safe: { flex: 1, backgroundColor: '#0B0F14' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16 },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: '#fff' },
  content: { padding: 20, paddingBottom: 40 },
  hero: { color: '#fff', fontSize: 20, fontWeight: '800' },
  sub: { color: '#94A3B8', marginTop: 6, marginBottom: 16 },
  videoWrap: { borderRadius: 16, overflow: 'hidden', backgroundColor: '#000', aspectRatio: 9 / 16, maxHeight: 420 },
  video: { width: '100%', height: '100%' },
  label: { color: '#CBD5E1', marginTop: 20, marginBottom: 8, fontWeight: '600' },
  input: { backgroundColor: '#1E293B', borderRadius: 12, padding: 14, color: '#fff', minHeight: 90, textAlignVertical: 'top' },
  approveBtn: { marginTop: 20, backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  approveText: { color: '#fff', fontWeight: '700' },
  revisionBtn: { marginTop: 10, backgroundColor: '#F59E0B', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  revisionText: { color: '#fff', fontWeight: '700' },
  rejectBtn: { marginTop: 10, borderWidth: 1, borderColor: '#475569', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  rejectText: { color: '#FCA5A5', fontWeight: '700' },
});
