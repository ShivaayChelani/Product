import React, { memo } from 'react';
import { Text, StyleSheet, TouchableOpacity } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { REEL_COMMENT_BAR_H } from './reelLayout';

type Props = {
  onPress: () => void;
  onEmojiPress?: () => void;
};

function ReelCommentBarComponent({ onPress, onEmojiPress }: Props) {
  return (
    <TouchableOpacity style={styles.bar} onPress={onPress} activeOpacity={0.88}>
      <Text style={styles.placeholder}>Add a comment...</Text>
      <TouchableOpacity
        onPress={onEmojiPress ?? onPress}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        activeOpacity={0.7}
      >
        <Icon name="happy-outline" size={22} color="rgba(255,255,255,0.8)" />
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

export const ReelCommentBar = memo(ReelCommentBarComponent);

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: REEL_COMMENT_BAR_H,
    paddingHorizontal: 16,
    borderRadius: 28,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  placeholder: {
    flex: 1,
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
    fontWeight: '500',
  },
});
