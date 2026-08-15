import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import { notificationService } from '../services/notificationService';
import { navigateFromPayload } from '../services/notifications/notificationNavigation';
import { normalizeNotificationData } from '../services/notifications/notificationPayload';
import {
  clearBadge,
  getUnreadBadgeCount,
  setUnreadBadgeCount,
} from '../services/notifications/notificationBadgeStore';
import { trackNotificationEvent } from '../services/notifications/notificationAnalytics';

type TestCase = {
  label: string;
  type: string;
  screen?: string;
  entityId?: string;
};

const DEEP_LINK_CASES: TestCase[] = [
  { label: 'Reward', type: 'points_earned', screen: 'Rewards' },
  { label: 'Offer', type: 'offer_nearby', screen: 'Rewards', entityId: 'offer-demo' },
  { label: 'Comment → Reel', type: 'reel_comment', screen: 'ReelDetail', entityId: 'reel-demo' },
  { label: 'Vendor Dashboard', type: 'vendor_redemption', screen: 'VendorTabs' },
  { label: 'Creator Dashboard', type: 'creator_update', screen: 'CreatorTabs' },
  { label: 'Trip Detail', type: 'trip_ready', screen: 'TripDetail', entityId: 'trip-demo' },
  { label: 'AI Planner', type: 'ai_planner', screen: 'AITripPlanner' },
  { label: 'Notification Center', type: 'system', screen: 'Notifications' },
];

export default function DevNotificationTestScreen({
  navigation,
}: {
  navigation?: { goBack: () => void };
}) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const [permission, setPermission] = useState<boolean | null>(null);
  const [tokenPreview, setTokenPreview] = useState<string>('—');
  const [badge, setBadge] = useState(0);

  const refreshStatus = useCallback(async () => {
    const granted = await notificationService.isPermissionGranted();
    setPermission(granted);
    const token = await notificationService.getFCMToken();
    setTokenPreview(token ? `${token.slice(0, 12)}…${token.slice(-6)}` : 'unavailable');
    setBadge(getUnreadBadgeCount());
  }, []);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  const runBanner = (title: string, body: string, data?: Record<string, string>) => {
    trackNotificationEvent('sent', { source: 'dev_qa', kind: 'foreground_banner' });
    notificationService.showLocalTestBanner(title, body, data);
  };

  const runDeepLink = (tc: TestCase) => {
    const payload = normalizeNotificationData({
      type: tc.type,
      screen: tc.screen,
      entityId: tc.entityId,
    });
    navigateFromPayload(payload, 'in_app');
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.background }}
      contentContainerStyle={{ padding: 20, paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24 }}
    >
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => navigation?.goBack()} style={styles.backBtn}>
          <Text style={{ color: theme.text, fontSize: 20 }}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: theme.text }]}>Notification QA</Text>
      </View>
      <Text style={[styles.sub, { color: theme.textSecondary }]}>
        Local tests — no Firebase Console required. Foreground uses in-app banner; deep links use the same router as push.
      </Text>

      <Section title="Status" theme={theme}>
        <InfoRow label="Platform" value={Platform.OS} theme={theme} />
        <InfoRow label="Permission" value={permission == null ? '…' : permission ? 'granted' : 'denied'} theme={theme} />
        <InfoRow label="FCM token" value={tokenPreview} theme={theme} />
        <InfoRow label="Badge (store)" value={String(badge)} theme={theme} />
        <Row>
          <Btn label="Refresh status" onPress={() => void refreshStatus()} theme={theme} />
          <Btn label="Request permission" onPress={() => notificationService.requestPermission(true)} theme={theme} />
        </Row>
      </Section>

      <Section title="Foreground banner" theme={theme}>
        <Btn
          label="Show sample banner"
          onPress={() => runBanner('PalSafar', 'Your trip itinerary is ready to view.', { type: 'trip_ready', screen: 'TripDetail', entityId: 'trip-demo' })}
          theme={theme}
        />
        <Btn
          label="Banner + Open action"
          onPress={() => runBanner('Reward unlocked', '+50 Pal Points added', { type: 'points_earned', screen: 'Rewards' })}
          theme={theme}
        />
      </Section>

      <Section title="Deep link routing" theme={theme}>
        {DEEP_LINK_CASES.map((tc) => (
          <Btn key={tc.label} label={tc.label} onPress={() => runDeepLink(tc)} theme={theme} />
        ))}
      </Section>

      <Section title="Badge sync" theme={theme}>
        <Row>
          <Btn label="Set badge 3" onPress={() => setUnreadBadgeCount(3)} theme={theme} />
          <Btn label="Clear badge" onPress={() => clearBadge()} theme={theme} />
        </Row>
        <Btn
          label="Refresh from server"
          onPress={() => notificationService.refreshUnreadBadgeCount().then(setBadge)}
          theme={theme}
        />
      </Section>

      <Section title="Token lifecycle" theme={theme}>
        <Btn label="Register / sync token" onPress={() => notificationService.registerDeviceToken({ force: true })} theme={theme} />
        <Btn
          label="Unregister token"
          onPress={() =>
            Alert.alert('Unregister token?', 'Simulates logout cleanup.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Unregister', style: 'destructive', onPress: () => notificationService.unregisterDeviceToken() },
            ])
          }
          theme={theme}
        />
      </Section>
    </ScrollView>
  );
}

function Section({ title, children, theme }: { title: string; children: React.ReactNode; theme: { text: string } }) {
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: theme.text }]}>{title}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function InfoRow({ label, value, theme }: { label: string; value: string; theme: { text: string; textSecondary?: string } }) {
  return (
    <View style={styles.infoRow}>
      <Text style={{ color: theme.textSecondary || '#888', fontSize: 13 }}>{label}</Text>
      <Text style={{ color: theme.text, fontSize: 13, fontFamily: 'Inter-SemiBold' }}>{value}</Text>
    </View>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <View style={styles.row}>{children}</View>;
}

function Btn({ label, onPress, theme }: { label: string; onPress: () => void; theme: { primary: string; glass?: string } }) {
  return (
    <TouchableOpacity onPress={onPress} style={[styles.btn, { backgroundColor: theme.glass || 'rgba(185,131,75,0.15)' }]}>
      <Text style={{ color: theme.primary, fontFamily: 'Inter-SemiBold', fontSize: 13 }}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  backBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: 'Inter-Bold', fontSize: 22 },
  sub: { fontSize: 13, lineHeight: 19, marginBottom: 20 },
  section: { marginBottom: 22 },
  sectionTitle: { fontFamily: 'Inter-Bold', fontSize: 15, marginBottom: 10 },
  sectionBody: { gap: 8 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  btn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12 },
});
