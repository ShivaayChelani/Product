import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Platform } from 'react-native';
import { Sentry } from '../services/monitoring';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  eventId: string | null;
  componentStack: string | null;
}

/**
 * Root error boundary — single capture path for React render errors.
 * Global Sentry handler is suppressed for the same error via _sentryBoundaryReported.
 */
export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, eventId: null, componentStack: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    (error as Error & { _sentryBoundaryReported?: boolean })._sentryBoundaryReported = true;

    const eventId = Sentry.captureException(error, {
      level: 'fatal',
      contexts: {
        react: {
          componentStack: errorInfo.componentStack,
        },
      },
      tags: {
        error_boundary: 'root',
      },
      fingerprint: ['react-error-boundary', error.name, error.message],
    });
    this.setState({
      eventId: typeof eventId === 'string' ? eventId : null,
      componentStack: errorInfo.componentStack ?? null,
    });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, eventId: null, componentStack: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.message}>
            {this.state.error?.message || 'An unexpected error occurred'}
          </Text>
          {this.state.eventId ? (
            <Text style={styles.eventId}>Report ID: {this.state.eventId}</Text>
          ) : null}
          <ScrollView style={styles.stackBox}>
            <Text style={styles.stack} selectable>
              {this.state.error?.stack}
              {this.state.componentStack ? `\n\nComponent stack:\n${this.state.componentStack}` : ''}
            </Text>
          </ScrollView>
          <TouchableOpacity
            style={styles.button}
            onPress={this.handleReset}
            accessibilityRole="button"
            accessibilityLabel="Try again"
          >
            <Text style={styles.buttonText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0a0e21',
    padding: 24,
  },
  title: { fontSize: 22, fontWeight: '700', color: '#fff', marginBottom: 8 },
  message: { fontSize: 14, color: '#888', textAlign: 'center', marginBottom: 12, lineHeight: 20 },
  eventId: { fontSize: 11, color: '#666', marginBottom: 12 },
  stackBox: { maxHeight: 180, width: '100%', marginBottom: 16 },
  stack: {
    fontSize: 10,
    color: '#555',
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
  },
  button: {
    backgroundColor: '#6C63FF',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
