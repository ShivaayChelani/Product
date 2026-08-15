import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { SANS_BOLD } from '../theme';

type Props = {
  bottomInset: number;
  saving: boolean;
  onSaveDraft: () => void;
  onSaveTrip: () => void;
  onDownload?: () => void;
};

export function PreviewFooter({ bottomInset, saving, onSaveDraft, onSaveTrip, onDownload }: Props) {
  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(bottomInset, 16) }]}>
      <View style={styles.bar}>
        <TouchableOpacity style={styles.halfBtn} onPress={onSaveTrip} disabled={saving} activeOpacity={0.85}>
          {saving ? (
            <ActivityIndicator color="#FFF" size="small" />
          ) : (
            <>
              <Icon name="heart-outline" size={17} color="#FFF" />
              <Text style={styles.btnText}>Save Trip</Text>
            </>
          )}
        </TouchableOpacity>
        <View style={styles.divider} />
        <TouchableOpacity style={styles.halfBtn} onPress={onDownload ?? onSaveDraft} activeOpacity={0.85}>
          <Icon name="download-outline" size={17} color="#FFF" />
          <Text style={styles.btnText}>Download Itinerary</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: '#FAF8F4',
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  bar: {
    flexDirection: 'row',
    backgroundColor: '#3E2005',
    borderRadius: 18,
    overflow: 'hidden',
    height: 54,
  },
  halfBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  divider: {
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginVertical: 12,
  },
  btnText: {
    fontFamily: SANS_BOLD,
    fontSize: 14,
    color: '#FFFFFF',
  },
});



