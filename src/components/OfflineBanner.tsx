import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import Icon from 'react-native-vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { syncService } from '../services/syncService';

/**
 * Global offline / sync status strip — single queue via syncService.
 */
export default function OfflineBanner() {
  const insets = useSafeAreaInsets();
  const [offline, setOffline] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [pending, setPending] = useState(syncService.pendingCount());

  useEffect(() => {
    const unsubNet = NetInfo.addEventListener((state) => {
      const connected = !!(state.isConnected && state.isInternetReachable !== false);
      setOffline(!connected);
      if (connected) {
        syncService.sync().catch(() => undefined);
      }
    });
    const unsubQ = syncService.subscribe(() => setPending(syncService.pendingCount()));
    setPending(syncService.pendingCount());
    return () => {
      unsubNet();
      unsubQ();
    };
  }, []);

  if (!offline && pending === 0) return null;

  const retry = async () => {
    setSyncing(true);
    try {
      await syncService.sync();
      setPending(syncService.pendingCount());
    } finally {
      setSyncing(false);
    }
  };

  return (
    <View style={[styles.wrap, { paddingTop: Math.max(insets.top, 4) }]}>
      <Icon name={offline ? 'cloud-offline-outline' : 'sync-outline'} size={16} color="#FFFFFF" />
      <Text style={styles.text}>
        {offline
          ? 'You are offline — actions will queue'
          : syncing
            ? 'Syncing pending actions…'
            : `${pending} pending · tap to retry`}
      </Text>
      {!offline && pending > 0 ? (
        <TouchableOpacity onPress={retry} hitSlop={8}>
          <Text style={styles.retry}>{syncing ? '…' : 'Retry'}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: '#63300E',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingBottom: 8,
    zIndex: 50,
  },
  text: { flex: 1, color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  retry: { color: '#FFFFFF', fontWeight: '900', fontSize: 12 },
});
