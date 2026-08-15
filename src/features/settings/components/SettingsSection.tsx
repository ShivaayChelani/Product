import React, { memo } from 'react';
import { View, Text, StyleSheet, Switch, Platform } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { PressableScale } from '../../../components/home/PressableScale';
import { SettingsTheme as T, SettingsFonts } from '../theme';

export type SettingsRowModel = {
  key: string;
  icon: string;
  iconColor?: string;
  iconBg?: string;
  title: string;
  subtitle?: string;
  danger?: boolean;
  rightText?: string;
  onPress?: () => void;
  switchValue?: boolean;
  onSwitch?: (v: boolean) => void;
  loading?: boolean;
};

function SettingsRowInner({ item, isLast }: { item: SettingsRowModel; isLast: boolean }) {
  const pressable = !!item.onPress && !item.onSwitch;
  const iconColor = item.iconColor ?? T.primary;
  const iconBg = item.iconBg ?? 'rgba(184,137,90,0.14)';

  const body = (
    <View style={[styles.row, !isLast && styles.rowBorder]}>
      <View style={[styles.iconCircle, { backgroundColor: iconBg }]}>
        <Icon name={item.icon as any} size={20} color={iconColor} />
      </View>
      <View style={styles.textCol}>
        <Text style={[SettingsFonts.rowTitle, item.danger && styles.titleDanger]} numberOfLines={2}>
          {item.title}
        </Text>
        {item.subtitle ? (
          <Text style={SettingsFonts.rowSubtitle} numberOfLines={2}>
            {item.subtitle}
          </Text>
        ) : null}
      </View>
      {item.onSwitch != null ? (
        <Switch
          value={item.switchValue}
          onValueChange={item.onSwitch}
          trackColor={{ false: '#E8DFD4', true: T.secondary }}
          thumbColor={Platform.OS === 'android' ? T.card : undefined}
          disabled={item.loading}
        />
      ) : item.rightText ? (
        <Text style={SettingsFonts.rowMeta}>{item.rightText}</Text>
      ) : pressable ? (
        <Icon name="chevron-forward" size={18} color={T.textMuted} />
      ) : null}
    </View>
  );

  if (pressable) {
    return (
      <PressableScale onPress={item.onPress} disabled={item.loading}>
        {body}
      </PressableScale>
    );
  }
  return body;
}

export function SettingsSection({
  title,
  items,
}: {
  title?: string;
  items: SettingsRowModel[];
}) {
  return (
    <View style={styles.section}>
      {title ? <Text style={[SettingsFonts.sectionLabel, styles.sectionLabel]}>{title}</Text> : null}
      <View style={[styles.card, T.cardShadow]}>
        {items.map((item, i) => (
          <SettingsRowInner key={item.key} item={item} isLast={i === items.length - 1} />
        ))}
      </View>
    </View>
  );
}

export const SettingsRow = memo(SettingsRowInner);

const styles = StyleSheet.create({
  section: {
    paddingHorizontal: 20,
    gap: 10,
    marginBottom: 22,
  },
  sectionLabel: {
    paddingLeft: 4,
  },
  card: {
    backgroundColor: T.card,
    borderRadius: T.radius,
    borderWidth: 1,
    borderColor: T.border,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 14,
    minHeight: 56,
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: T.border,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  textCol: { flex: 1, minWidth: 0, gap: 3 },
  titleDanger: { color: T.danger },
});
