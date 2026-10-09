import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ViewStyle, TextStyle, ActivityIndicator } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { DISABLED_BUTTON_BG, DISABLED_BUTTON_FG, ON_DARK } from '../../design/contrast';

const COLORS = {
  brown: '#000000',
  white: ON_DARK,
};

interface PrimaryButtonProps {
  title: string;
  onPress: () => void;
  style?: ViewStyle;
  textStyle?: TextStyle;
  disabled?: boolean;
  loading?: boolean;
  iconName?: string;
  iconColor?: string;
}

export const PrimaryButton: React.FC<PrimaryButtonProps> = ({
  title,
  onPress,
  style,
  textStyle,
  disabled,
  loading,
  iconName,
  iconColor = COLORS.white,
}) => {
  const inactive = !!disabled;
  const foreground = inactive ? DISABLED_BUTTON_FG : iconColor;

  return (
    <TouchableOpacity
      style={[styles.button, inactive && styles.disabled, style]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.8}
    >
      {loading ? (
        <ActivityIndicator color={inactive ? DISABLED_BUTTON_FG : COLORS.white} />
      ) : (
        <>
          {iconName ? <Icon name={iconName} size={20} color={foreground} style={styles.icon} /> : null}
          <Text style={[styles.text, inactive && styles.textDisabled, textStyle]}>{title}</Text>
        </>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    backgroundColor: COLORS.brown,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  disabled: {
    backgroundColor: DISABLED_BUTTON_BG,
  },
  text: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  textDisabled: {
    color: DISABLED_BUTTON_FG,
  },
  icon: {
    marginRight: 8,
  },
});
