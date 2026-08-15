import { View, TouchableOpacity, type ViewStyle, type StyleProp } from 'react-native';
import { Pal, glassCardStyle } from '../../design/DesignSystem';

interface GlassCardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  blur?: boolean;
  padding?: number;
}

export function GlassCard({ children, style, onPress, padding = Pal.spacing[5] }: GlassCardProps) {
  const containerStyle: ViewStyle = {
    ...glassCardStyle,
    padding,
    ...Pal.shadows.lg,
  };

  if (onPress) {
    return (
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={onPress}
        style={[containerStyle, style as ViewStyle]}
      >
        {children}
      </TouchableOpacity>
    );
  }

  return <View style={[containerStyle, style as ViewStyle]}>{children}</View>;
}
