import React, { useState } from 'react';
import {
  ScrollView,
  View,
  StyleSheet,
  Text,
  TextInput,
  Alert,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { SettingsTheme as T, SERIF, SANS, SANS_SEMI } from '../../features/settings/theme';
import { SettingsHeroHeader } from '../../features/settings/components/SettingsHeroHeader';
import { appConfigApi, userAppApi } from '../../services/api/userApp';
import { settingsKeys } from '../../features/settings/queryKeys';
import { useBottomSafePadding } from '../../design/responsive';
import { PressableScale } from '../../components/home/PressableScale';

export function LicensesScreen() {
  const nav = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const pad = useBottomSafePadding(24);
  const licensesQuery = useQuery({
    queryKey: settingsKeys.licenses(),
    queryFn: () => appConfigApi.getLicenses(),
  });

  return (
    <ScrollView style={styles.root} contentContainerStyle={{ paddingBottom: pad }}>
      <SettingsHeroHeader title="Licenses" subtitle="Open source libraries" onBack={() => nav.goBack()} topInset={insets.top} compact />
      <View style={styles.card}>
        {licensesQuery.isLoading ? (
          <ActivityIndicator color={T.primary} />
        ) : (
          licensesQuery.data?.packages.map(pkg => (
            <View key={pkg.name} style={styles.licenseRow}>
              <Text style={styles.licenseName}>{pkg.name}</Text>
              <Text style={styles.licenseType}>{pkg.license}</Text>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

type FeedbackRoute = { category?: 'bug' | 'feature' | 'support' | 'rating_fallback' | 'general'; title?: string };

export function FeedbackScreen() {
  const nav = useNavigation<any>();
  const route = useRoute<any>();
  const params = (route.params || {}) as FeedbackRoute;
  const insets = useSafeAreaInsets();
  const pad = useBottomSafePadding(24);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const category = params.category || 'general';
  const title = params.title || 'Feedback';

  const submit = async () => {
    if (message.trim().length < 3) {
      Alert.alert('Message required', 'Please describe your feedback.');
      return;
    }
    setSending(true);
    try {
      await userAppApi.submitFeedback(category, message.trim());
      Alert.alert('Thank you', 'Your feedback was sent to the PalSafar team.', [
        { text: 'OK', onPress: () => nav.goBack() },
      ]);
    } catch (err: any) {
      Alert.alert('Could not send', err?.message || 'Try again when online.');
    } finally {
      setSending(false);
    }
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={{ paddingBottom: pad }} keyboardShouldPersistTaps="handled">
      <SettingsHeroHeader title={title} subtitle="We read every message" onBack={() => nav.goBack()} topInset={insets.top} compact />
      <View style={styles.form}>
        <Text style={styles.label}>Message</Text>
        <TextInput
          value={message}
          onChangeText={setMessage}
          multiline
          placeholder="Tell us what happened or what you'd like to see…"
          placeholderTextColor={T.textMuted}
          style={styles.input}
        />
        <PressableScale onPress={submit} disabled={sending}>
          <View style={styles.btn}>
            {sending ? <ActivityIndicator color="#FFF" /> : <Text style={styles.btnText}>Submit</Text>}
          </View>
        </PressableScale>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.bg },
  card: {
    margin: 20,
    backgroundColor: T.card,
    borderRadius: T.radius,
    borderWidth: 1,
    borderColor: T.border,
    padding: 16,
    gap: 12,
  },
  licenseRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: T.border,
  },
  licenseName: { fontFamily: SANS_SEMI, fontSize: 14, color: T.primary, flex: 1 },
  licenseType: { fontFamily: SANS, fontSize: 13, color: T.textSecondary },
  form: { paddingHorizontal: 20, gap: 12 },
  label: { fontFamily: SANS_SEMI, fontSize: 14, color: T.primary },
  input: {
    minHeight: 140,
    backgroundColor: T.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: T.border,
    padding: 16,
    fontFamily: SANS,
    fontSize: 15,
    color: T.text,
    textAlignVertical: 'top',
  },
  btn: {
    marginTop: 8,
    backgroundColor: T.primary,
    borderRadius: T.radius,
    paddingVertical: 16,
    alignItems: 'center',
  },
  btnText: { fontFamily: SANS_SEMI, fontSize: 16, color: '#FFF' },
});
