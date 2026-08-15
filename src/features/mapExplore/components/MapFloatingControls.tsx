import React, { memo } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { MapExploreTheme as T } from '../theme';

type Props = {
  bottom: number;
  topOffset: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onLocate: () => void;
};

function MapFloatingControlsComponent({
  bottom,
  topOffset,
  onZoomIn,
  onZoomOut,
  onLocate,
}: Props) {
  return (
    <>
      <View style={[styles.zoomCol, { bottom }]}>
        <View style={[styles.pill, T.shadow]}>
          <TouchableOpacity style={styles.pillBtn} onPress={onZoomIn} accessibilityLabel="Zoom in">
            <Icon name="add" size={22} color={T.text} />
          </TouchableOpacity>
          <View style={styles.divider} />
          <TouchableOpacity style={styles.pillBtn} onPress={onZoomOut} accessibilityLabel="Zoom out">
            <Icon name="remove" size={22} color={T.text} />
          </TouchableOpacity>
        </View>
      </View>

      <TouchableOpacity
        style={[styles.locateBtn, T.shadow, { bottom }]}
        onPress={onLocate}
        accessibilityLabel="Current location"
      >
        <Icon name="locate" size={22} color={T.primary} />
      </TouchableOpacity>
    </>
  );
}

const styles = StyleSheet.create({
  zoomCol: {
    position: 'absolute',
    left: 14,
    zIndex: 12,
  },
  pill: {
    backgroundColor: T.card,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: T.border,
    overflow: 'hidden',
  },
  pillBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  divider: {
    height: 1,
    backgroundColor: T.border,
  },
  locateBtn: {
    position: 'absolute',
    right: 14,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: T.card,
    borderWidth: 1,
    borderColor: T.border,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 12,
  },
});

export const MapFloatingControls = memo(MapFloatingControlsComponent);
