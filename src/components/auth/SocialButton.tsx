import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ViewStyle } from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import Icon from 'react-native-vector-icons/Ionicons';

const COLORS = {
  border: '#ECE3D7',
  text: '#202020',
  white: '#FFFFFF',
};

interface SocialButtonProps {
  title: string;
  onPress: () => void;
  type: 'google' | 'guest';
  style?: ViewStyle;
}

export const SocialButton: React.FC<SocialButtonProps> = ({ title, onPress, type, style }) => {
  return (
    <TouchableOpacity style={[styles.button, style]} onPress={onPress} activeOpacity={0.7}>
      {type === 'google' ? (
        <MaterialCommunityIcons name="google" size={20} color="#EA4335" style={styles.icon} />
      ) : (
        <Icon name="person-outline" size={20} color={COLORS.text} style={styles.icon} />
      )}
      <Text style={styles.text}>{title}</Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    height: 56,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    width: '100%',
  },
  icon: {
    marginRight: 12,
  },
  text: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
  },
});
