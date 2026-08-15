import React, { memo } from 'react';
import { View, TextInput, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { NotificationTheme as T, SANS } from '../theme';

type Props = {
  value: string;
  onChangeText: (t: string) => void;
};

function NotificationSearchBarComponent({ value, onChangeText }: Props) {
  return (
    <View style={styles.wrap}>
      <Icon name="search" size={18} color={T.textMuted} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder="Search notifications"
        placeholderTextColor={T.textMuted}
        style={styles.input}
        returnKeyType="search"
        clearButtonMode="while-editing"
      />
    </View>
  );
}

export const NotificationSearchBar = memo(NotificationSearchBarComponent);

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: T.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: T.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  input: {
    flex: 1,
    fontFamily: SANS,
    fontSize: 15,
    color: T.text,
    padding: 0,
  },
});
