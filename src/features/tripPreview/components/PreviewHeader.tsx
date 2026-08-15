import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { SANS_SEMI } from '../theme';

type Props = {
  topInset: number;
  onBack: () => void;
  onShare?: () => void;
  onMapView?: () => void;
};

export function PreviewHeader({ topInset, onBack, onShare, onMapView }: Props) {
  return (
    <View style={[styles.wrap, { paddingTop: topInset + 10 }]}>
      <TouchableOpacity style={styles.backBtn} onPress={onBack} hitSlop={8}>
        <Icon name="arrow-back" size={20} color="#1C1108" />
      </TouchableOpacity>
      <View style={styles.rightRow}>
        <TouchableOpacity style={styles.pillBtn} onPress={onShare} activeOpacity={0.8}>
          <Icon name="share-outline" size={15} color="#1C1108" />
          <Text style={styles.pillText}>Share</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.pillBtn} onPress={onMapView} activeOpacity={0.8}>
          <Icon name="map-outline" size={15} color="#1C1108" />
          <Text style={styles.pillText}>Map View</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 10,
    backgroundColor: '#FAF8F4',
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1, borderColor: '#E8D5B7',
    alignItems: 'center', justifyContent: 'center',
  },
  rightRow: { flexDirection: 'row', gap: 10 },
  pillBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1, borderColor: '#E8D5B7', borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 8,
    backgroundColor: '#FFFFFF',
  },
  pillText: { fontFamily: SANS_SEMI, fontSize: 13, color: '#1C1108' },
});


