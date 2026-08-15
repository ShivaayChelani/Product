import React from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import type { TaggedCreatorReel } from '../services/api/vendors';

type Props = {
  reel: TaggedCreatorReel;
  busy?: boolean;
  onAllow: () => void;
  onReject: () => void;
  onOpen?: () => void;
};

export default function TaggedReelReviewRow({ reel, busy, onAllow, onReject, onOpen }: Props) {
  const caption = reel.title || reel.description || 'Untitled reel';
  const thumb = reel.thumbnail || reel.videoUrl;

  return (
    <View style={styles.wrap}>
      <TouchableOpacity style={styles.media} onPress={onOpen} activeOpacity={onOpen ? 0.8 : 1} disabled={!onOpen}>
        {thumb ? (
          <Image source={{ uri: thumb }} style={styles.thumb} />
        ) : (
          <View style={[styles.thumb, styles.thumbFallback]}>
            <Icon name="videocam-outline" size={22} color="#8C7B6F" />
          </View>
        )}
      </TouchableOpacity>
      <View style={styles.body}>
        <Text style={styles.kicker}>Creator tagged your business</Text>
        <Text style={styles.handle} numberOfLines={1}>@{reel.creator.username}</Text>
        <Text style={styles.caption} numberOfLines={2}>{caption}</Text>
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.btn, styles.allow]}
            onPress={onAllow}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Allow reel on map profile"
          >
            {busy ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.allowText}>Allow</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btn, styles.reject]}
            onPress={onReject}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Reject reel from map profile"
          >
            <Text style={styles.rejectText}>Reject</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    gap: 12,
    padding: 12,
    borderRadius: 16,
    backgroundColor: '#FFF9F0',
    borderWidth: 1,
    borderColor: '#F0E4D4',
  },
  media: { width: 72, height: 96, borderRadius: 12, overflow: 'hidden', backgroundColor: '#F3EBE0' },
  thumb: { width: '100%', height: '100%' },
  thumbFallback: { alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, minWidth: 0 },
  kicker: { fontSize: 11, fontWeight: '800', color: '#B8895A', textTransform: 'uppercase', letterSpacing: 0.3 },
  handle: { fontSize: 13, fontWeight: '700', color: '#3D2A1D', marginTop: 2 },
  caption: { fontSize: 12, color: '#8C7B6F', marginTop: 2, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  btn: {
    flex: 1,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  allow: { backgroundColor: '#2E7D4F' },
  allowText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  reject: { backgroundColor: '#F3EBE0' },
  rejectText: { color: '#8C3B32', fontSize: 13, fontWeight: '800' },
});
