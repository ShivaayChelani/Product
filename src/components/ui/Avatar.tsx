import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity } from 'react-native';
import Pal from '../../design/DesignSystem';

import { scale, fontScale, iconScale } from '../../design/responsive';

const PRESET_AVATARS = ['👦', '👧', '👨', '👩', '👶', '👸', '🤴', '🧑', '🧒', '👱'];

export interface AvatarProps {
  source?: { uri: string } | null;
  avatarStyle?: number;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'xxl';
  shape?: 'circle' | 'rounded';
  onPress?: () => void;
  status?: 'online' | 'offline' | 'busy' | 'away';
  badge?: string | number;
  style?: any;
}

const sizeMap = {
  xs: { width: scale(28), height: scale(28), fontSize: fontScale(14), badgeSize: scale(14), badgeFont: fontScale(8) },
  sm: { width: scale(36), height: scale(36), fontSize: fontScale(18), badgeSize: scale(16), badgeFont: fontScale(9) },
  md: { width: scale(44), height: scale(44), fontSize: fontScale(22), badgeSize: scale(18), badgeFont: fontScale(10) },
  lg: { width: scale(56), height: scale(56), fontSize: fontScale(28), badgeSize: scale(20), badgeFont: fontScale(11) },
  xl: { width: scale(72), height: scale(72), fontSize: fontScale(36), badgeSize: scale(24), badgeFont: fontScale(12) },
  xxl: { width: scale(96), height: scale(96), fontSize: fontScale(48), badgeSize: scale(28), badgeFont: fontScale(14) },
};

export const Avatar = React.memo(({
  source,
  avatarStyle = 0,
  size = 'md',
  shape = 'circle',
  onPress,
  status,
  badge,
  style,
}: AvatarProps) => {
  const colors = Pal.colors.dark;
  const s = sizeMap[size];
  const radius = useMemo(() => shape === 'circle' ? s.width / 2 : 12, [shape, s.width]);
  const emoji = useMemo(() => PRESET_AVATARS[avatarStyle % PRESET_AVATARS.length] || '🧭', [avatarStyle]);

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.9} disabled={!onPress} style={[{ width: s.width, height: s.height }, style]}>
      <View style={styles.container}>
        {source?.uri ? (
          <Image source={source} style={[styles.image, { width: s.width, height: s.height, borderRadius: radius }]} resizeMode="cover" fadeDuration={0} />
        ) : (
          <View style={[styles.placeholder, { width: s.width, height: s.height, borderRadius: radius, backgroundColor: colors.primary + '15' }]}>
            <Text style={{ fontSize: s.fontSize }}>{emoji}</Text>
          </View>
        )}

        {status && (
          <View
            style={[
              styles.statusDot,
              {
                width: s.badgeSize * 0.4,
                height: s.badgeSize * 0.4,
                borderRadius: s.badgeSize * 0.2,
                borderWidth: 2,
                borderColor: colors.background,
                backgroundColor:
                  status === 'online' ? colors.success :
                  status === 'busy' ? colors.danger :
                  status === 'away' ? colors.warning :
                  colors.textMuted,
              },
            ]}
          />
        )}

        {badge !== undefined && (
          <View
            style={[
              styles.badge,
              { width: s.badgeSize, height: s.badgeSize, borderRadius: s.badgeSize / 2 },
            ]}
          >
            <Text
              style={[
                styles.badgeText,
                { fontSize: s.badgeFont, color: '#fff' },
              ]}
            >
              {typeof badge === 'number' && badge > 99 ? '99+' : badge}
            </Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  container: { position: 'relative', justifyContent: 'center', alignItems: 'center' },
  image: { borderRadius: 9999 },
  placeholder: { justifyContent: 'center', alignItems: 'center', backgroundColor: Pal.colors.dark.primary + '15' },
  statusDot: { position: 'absolute', bottom: 0, right: 0 },
  badge: { position: 'absolute', top: -4, right: -4, justifyContent: 'center', alignItems: 'center', backgroundColor: Pal.colors.dark.danger, minWidth: 18, paddingHorizontal: 4 },
  badgeText: { fontWeight: '800', textAlign: 'center' },
});

export default Avatar;