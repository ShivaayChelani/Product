import React from 'react';
import { View, Text } from 'react-native';

function ScreenLoadError({ name }: { name?: string }) {
  return React.createElement(
    View,
    { style: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 } },
    React.createElement(Text, { style: { fontSize: 40 } }, '⚠️'),
    React.createElement(
      Text,
      { style: { fontSize: 16, textAlign: 'center', marginTop: 12 } },
      name ? `Could not load "${name}"` : 'Could not load this screen.',
    ),
    React.createElement(
      Text,
      { style: { fontSize: 13, textAlign: 'center', marginTop: 8, color: '#888' } },
      'Please restart the app or contact support.',
    ),
  );
}

export function useLazyScreen(
  load: () => any,
  key?: string
): React.ComponentType<any> {
  return React.useMemo(() => {
    try {
      const res = load();
      return res && typeof res === 'object' && 'default' in res ? res.default : res;
    } catch (err) {
      return () => React.createElement(ScreenLoadError, { name: key });
    }
  }, [key, load]);
}
