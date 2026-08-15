import React, { forwardRef } from 'react';
import RNWebView, { WebViewProps } from 'react-native-webview';

export type SafeWebViewRef = InstanceType<typeof RNWebView>;

export const SafeWebView = forwardRef<SafeWebViewRef, WebViewProps>(function SafeWebView(props, ref) {
  return <RNWebView ref={ref} {...props} />;
});

export type { WebViewProps };
