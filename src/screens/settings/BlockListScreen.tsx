import React from 'react';
import { ScrollView, View, StyleSheet, Alert, RefreshControl, TextInput, TouchableOpacity, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SettingsTheme as T, SANS } from '../../features/settings/theme';
import { SettingsHeroHeader } from '../../features/settings/components/SettingsHeroHeader';
import { SettingsSection, type SettingsRowModel } from '../../features/settings/components/SettingsSection';
import { userAppApi } from '../../services/api/userApp';
import { settingsKeys } from '../../features/settings/queryKeys';
import { useBottomSafePadding } from '../../design/responsive';
import { useState } from 'react';

export function BlockListScreen() {
  const nav = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const pad = useBottomSafePadding(24);
  const qc = useQueryClient();
  const [userId, setUserId] = useState('');

  const blocksQuery = useQuery({
    queryKey: settingsKeys.blocks(),
    queryFn: () => userAppApi.listBlocks(),
  });

  const unblock = useMutation({
    mutationFn: (id: string) => userAppApi.unblockUser(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: settingsKeys.blocks() }),
  });

  const block = useMutation({
    mutationFn: () => userAppApi.blockUser(userId.trim()),
    onSuccess: () => {
      setUserId('');
      qc.invalidateQueries({ queryKey: settingsKeys.blocks() });
    },
    onError: (err: any) => Alert.alert('Could not block user', err?.message || 'Try again.'),
  });

  const rows: SettingsRowModel[] =
    blocksQuery.data?.map(b => ({
      key: b.id,
      icon: 'person-remove-outline',
      title: b.blockedUser.name,
      subtitle: b.blockedUser.email,
      onPress: () => {
        Alert.alert('Unblock user', `Allow ${b.blockedUser.name} again?`, [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Unblock', onPress: () => unblock.mutate(b.id) },
        ]);
      },
    })) ?? [];

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={{ paddingBottom: pad }}
      refreshControl={<RefreshControl refreshing={blocksQuery.isFetching} onRefresh={() => blocksQuery.refetch()} />}
    >
      <SettingsHeroHeader title="Block List" subtitle="Manage blocked users" onBack={() => nav.goBack()} topInset={insets.top} compact />
      <View style={styles.blockAdd}>
        <TextInput
          value={userId}
          onChangeText={setUserId}
          placeholder="User ID to block"
          placeholderTextColor={T.textMuted}
          style={styles.input}
          autoCapitalize="none"
        />
        <TouchableOpacity style={styles.addBtn} onPress={() => block.mutate()} disabled={!userId.trim()}>
          <Text style={styles.addBtnText}>Block</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.body}>
        <SettingsSection title="Blocked" items={rows.length ? rows : [{ key: 'empty', icon: 'checkmark-circle-outline', title: 'No blocked users' }]} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.bg },
  body: { paddingTop: 8 },
  blockAdd: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, marginTop: 12 },
  input: {
    flex: 1,
    backgroundColor: T.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: T.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: SANS,
    color: T.text,
  },
  addBtn: {
    backgroundColor: T.primary,
    borderRadius: 16,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  addBtnText: { fontFamily: SANS, color: '#FFF' },
});
