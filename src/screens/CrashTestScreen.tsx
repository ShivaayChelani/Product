import React, { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  captureMessage,
  captureNonFatal,
  flushMonitoring,
  triggerNativeCrash,
} from '../services/monitoring';
import { MONITORING_CONFIG, isMonitoringEnabled } from '../config/monitoringConfig';

/**
 * Dev-only screen that deliberately crashes the app so QA can verify Sentry intake.
 * Never registered / reachable in production builds (__DEV__ gate + route registration).
 */
export default function CrashTestScreen({ navigation }: { navigation?: { goBack: () => void } }) {
  const insets = useSafeAreaInsets();
  const dsnReady = isMonitoringEnabled();

  const afterSend = useCallback(async (label: string) => {
    await flushMonitoring();
    Alert.alert(
      'Crash triggered',
      `${label}\n\nDSN configured: ${isMonitoringEnabled() ? 'yes' : 'NO — set monitoring.local.ts'}\nEnv: ${MONITORING_CONFIG.environment}\n\nCheck the Sentry Issues dashboard.`,
    );
  }, []);

  const throwJs = useCallback(() => {
    throw new Error('[PalSafar CrashTest] Intentional JavaScript exception');
  }, []);

  const rejectPromise = useCallback(() => {
    Promise.reject(new Error('[PalSafar CrashTest] Intentional unhandled promise rejection'));
    void afterSend('Unhandled promise rejection');
  }, [afterSend]);

  const nonFatal = useCallback(async () => {
    captureNonFatal(new Error('[PalSafar CrashTest] Intentional non-fatal exception'), {
      source: 'CrashTestScreen',
    });
    await afterSend('Non-fatal exception');
  }, [afterSend]);

  const message = useCallback(async () => {
    captureMessage('[PalSafar CrashTest] Intentional message', 'error');
    await afterSend('captureMessage');
  }, [afterSend]);

  const nativeCrash = useCallback(() => {
    Alert.alert(
      'Native crash',
      dsnReady
        ? 'This will immediately terminate the process. Re-open the app and confirm the event in Sentry.'
        : 'Configure monitoring.local.ts first — native crash will still kill the app but will not upload.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Crash now',
          style: 'destructive',
          onPress: () => triggerNativeCrash(),
        },
      ],
    );
  }, [dsnReady]);

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }]}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation?.goBack()} hitSlop={12}>
          <Text style={styles.back}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Crash reporting QA</Text>
        <Text style={styles.sub}>
          Dev only · {MONITORING_CONFIG.environment} · release {MONITORING_CONFIG.release}
        </Text>
        {!dsnReady ? (
          <View style={styles.dsnBanner}>
            <Text style={styles.dsnBannerTitle}>Sentry DSN not configured</Text>
            <Text style={styles.dsnBannerText}>
              Copy src/config/monitoring.local.example.ts → monitoring.local.ts and paste your project DSN.
              Until then, crash events will not upload (JS/native crashes still reproduce locally).
            </Text>
          </View>
        ) : (
          <View style={[styles.dsnBanner, styles.dsnBannerOk]}>
            <Text style={[styles.dsnBannerTitle, styles.dsnBannerTitleOk]}>Sentry connected</Text>
            <Text style={styles.dsnBannerText}>Events will upload to your Sentry project.</Text>
          </View>
        )}
      </View>
      <ScrollView contentContainerStyle={styles.body}>
        {[
          { label: 'Render error (ErrorBoundary)', onPress: () => {
            setTimeout(() => {
              throw new Error('[PalSafar CrashTest] Intentional render-phase exception');
            }, 0);
          }, danger: true, needsDsn: false },
          { label: 'Throw JS exception', onPress: throwJs, danger: true, needsDsn: false },
          { label: 'Unhandled promise rejection', onPress: rejectPromise, needsDsn: false },
          { label: 'Capture non-fatal', onPress: nonFatal, needsDsn: true },
          { label: 'Capture message', onPress: message, needsDsn: true },
          { label: 'Native crash (Android / iOS)', onPress: nativeCrash, danger: true, needsDsn: true },
        ].map((item) => {
          const disabled = item.needsDsn && !dsnReady;
          return (
          <TouchableOpacity
            key={item.label}
            style={[styles.btn, item.danger && styles.btnDanger, disabled && styles.btnDisabled]}
            onPress={disabled ? () => Alert.alert('DSN required', 'Add monitoring.local.ts with your Sentry DSN first.') : item.onPress}
            activeOpacity={0.85}
            disabled={false}
          >
            <Text style={[styles.btnText, item.danger && styles.btnTextDanger, disabled && styles.btnTextDisabled]}>
              {item.label}{disabled ? ' (needs DSN)' : ''}
            </Text>
          </TouchableOpacity>
        );})}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F7F6F1' },
  header: { paddingHorizontal: 16, marginBottom: 12 },
  back: { color: '#1F4D3A', fontWeight: '700', marginBottom: 8 },
  title: { fontSize: 22, fontWeight: '800', color: '#1D2420' },
  sub: { marginTop: 4, fontSize: 12, color: '#68756D' },
  body: { paddingHorizontal: 16, gap: 10 },
  btn: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: 'rgba(183,121,31,0.2)',
  },
  btnDanger: { borderColor: 'rgba(220,76,76,0.35)', backgroundColor: '#FBEAEA' },
  btnText: { fontSize: 15, fontWeight: '700', color: '#1D2420' },
  btnTextDanger: { color: '#C94A4A' },
  btnDisabled: { opacity: 0.55, backgroundColor: '#F7F6F1' },
  btnTextDisabled: { color: '#68756D' },
  dsnBanner: {
    marginTop: 12,
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#FBEAEA',
    borderWidth: 1,
    borderColor: 'rgba(220,76,76,0.25)',
  },
  dsnBannerOk: {
    backgroundColor: '#EAF3ED',
    borderColor: 'rgba(5,150,105,0.25)',
  },
  dsnBannerTitle: { fontSize: 13, fontWeight: '800', color: '#C94A4A', marginBottom: 4 },
  dsnBannerTitleOk: { color: '#2E7D55' },
  dsnBannerText: { fontSize: 12, lineHeight: 17, color: '#B7791F' },
});
