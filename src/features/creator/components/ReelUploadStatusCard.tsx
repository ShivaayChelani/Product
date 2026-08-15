import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Image,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import type { ReelUploadJob } from '../../../services/creator/creatorUploadManager';

const C = {
  card: '#FFFFFF',
  border: '#ECE3D7',
  text: '#202020',
  textSub: '#6F6F6F',
  gold: '#D9A441',
  green: '#2E7D32',
  red: '#C62828',
  track: '#F1EBE3',
};

interface Props {
  job: ReelUploadJob;
  onRetry: (localUploadId: string) => void;
  onDismiss?: (localUploadId: string) => void;
  onViewReel?: (reelId: string) => void;
}

export function ReelUploadStatusCard({ job, onRetry, onDismiss, onViewReel }: Props) {
  const isActive = job.status === 'QUEUED' || job.status === 'UPLOADING' || job.status === 'PROCESSING';
  const title = isActive
    ? job.status === 'PROCESSING'
      ? 'Processing reel…'
      : 'Uploading reel…'
    : job.status === 'POSTED'
      ? 'Reel posted'
      : job.status === 'FAILED'
        ? 'Upload failed'
        : 'Upload cancelled';

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <View style={styles.thumbWrap}>
          {job.thumbnail ? (
            <Image source={{ uri: job.thumbnail }} style={styles.thumb} />
          ) : (
            <View style={styles.thumbPlaceholder}>
              <Icon name="videocam-outline" size={22} color={C.textSub} />
            </View>
          )}
          {isActive && (
            <View style={styles.thumbOverlay}>
              <ActivityIndicator color="#fff" size="small" />
            </View>
          )}
        </View>

        <View style={styles.body}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.caption} numberOfLines={1}>
            {job.caption || 'Untitled reel'}
          </Text>

          {isActive && (
            <>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${Math.max(job.progress, 8)}%` }]} />
              </View>
              <Text style={styles.progressText}>
                {job.status === 'PROCESSING' ? 'Please wait…' : `${job.progress}%`}
              </Text>
            </>
          )}

          {job.status === 'POSTED' && job.reelId && (
            <TouchableOpacity style={styles.linkBtn} onPress={() => onViewReel?.(job.reelId!)}>
              <Icon name="checkmark-circle" size={16} color={C.green} />
              <Text style={styles.linkText}>View reel</Text>
            </TouchableOpacity>
          )}

          {job.status === 'FAILED' && (
            <>
              <Text style={styles.errorText} numberOfLines={2}>
                {job.error || 'Reel upload failed — tap to retry'}
              </Text>
              <TouchableOpacity style={styles.retryBtn} onPress={() => onRetry(job.localUploadId)}>
                <Icon name="refresh-outline" size={16} color={C.gold} />
                <Text style={styles.retryText}>Retry</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {(job.status === 'POSTED' || job.status === 'FAILED') && onDismiss && (
          <TouchableOpacity style={styles.dismissBtn} onPress={() => onDismiss(job.localUploadId)}>
            <Icon name="close" size={18} color={C.textSub} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: C.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    padding: 14,
    marginBottom: 12,
  },
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  thumbWrap: {
    width: 56,
    height: 72,
    borderRadius: 10,
    overflow: 'hidden',
    marginRight: 12,
    backgroundColor: '#F5F0EA',
  },
  thumb: { width: '100%', height: '100%' },
  thumbPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  thumbOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1 },
  title: { fontSize: 15, fontWeight: '700', color: C.text },
  caption: { fontSize: 12, color: C.textSub, marginTop: 2, marginBottom: 8 },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: C.track,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: C.gold, borderRadius: 3 },
  progressText: { fontSize: 11, color: C.textSub, marginTop: 4, fontWeight: '600' },
  errorText: { fontSize: 12, color: C.red, marginTop: 4 },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    alignSelf: 'flex-start',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: '#FBF6EE',
  },
  retryText: { marginLeft: 4, color: C.gold, fontWeight: '700', fontSize: 13 },
  linkBtn: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  linkText: { marginLeft: 4, color: C.green, fontWeight: '700', fontSize: 13 },
  dismissBtn: { padding: 4, marginLeft: 4 },
});
