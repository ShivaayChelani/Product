import React, { useEffect } from 'react';

import { Platform, UIManager } from 'react-native';

import { SafeAreaProvider } from 'react-native-safe-area-context';



const isNewArch = (global as any).nativeFabricUILibrary !== undefined || (global as any).RN$Bridgeless !== undefined;

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental && !isNewArch) {

  UIManager.setLayoutAnimationEnabledExperimental(true);

}

import { QueryClientProvider } from '@tanstack/react-query';
import { travelSocialQueryClient } from './src/features/travelSocial/api/queryClient';

import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { ThemeProvider } from './src/context/ThemeContext';

import { UserProvider } from './src/context/UserContext';

import { DataProvider } from './src/context/DataContext';

import { LocationProvider } from './src/context/LocationContext';

import { EntitlementProvider } from './src/context/EntitlementContext';

import { RootNavigator } from './src/navigation';

import ErrorBoundary from './src/components/ErrorBoundary';

import NotificationBannerHost from './src/components/notifications/NotificationBannerHost';

import { ToastProvider } from './src/context/ToastContext';

import { apiClient } from './src/services/api/client';

import { notificationService } from './src/services/notificationService';

import { syncService } from './src/services/syncService';

import { DEV_FLAGS } from './src/config/devFlags';

import { adsService } from './src/services/adsService';

import { captureNonFatal, Sentry, isMonitoringEnabled } from './src/services/monitoring';



function AppInitializer({ children }: { children: React.ReactNode }) {

  useEffect(() => {

    let notificationCleanup: (() => void) | null = null;



    (async () => {

      try {

        if (DEV_FLAGS.USE_SERVER_API) {

          await apiClient.init();

          await syncService.init();

          syncService.sync();

        }

      } catch (err) {

        console.warn('[AppInitializer] API client/sync init failed:', err);

        captureNonFatal(err, { source: 'AppInitializer', step: 'api_sync' });

      }



      try {

        await adsService.refreshConfig();

        if (adsService.getConfig().showAds && !adsService.getConfig().killSwitch) {

          await adsService.init();

        }

      } catch (err) {

        console.warn('[AppInitializer] Ads init skipped:', err);

        captureNonFatal(err, { source: 'AppInitializer', step: 'ads' });

      }



      try {

        notificationCleanup = await notificationService.initHandlers();

        await notificationService.refreshUnreadBadgeCount();

      } catch (err) {

        console.warn('[AppInitializer] Notification handlers failed:', err);

        captureNonFatal(err, { source: 'AppInitializer', step: 'notifications' });

      }

    })();



    return () => {

      notificationCleanup?.();

    };

  }, []);



  return <>{children}</>;

}



function MonitoringTouchBoundary({ children }: { children: React.ReactNode }) {
  if (!isMonitoringEnabled()) return <>{children}</>;
  return <Sentry.TouchEventBoundary>{children}</Sentry.TouchEventBoundary>;
}

export default function AppWrapper() {

  return (

    <ErrorBoundary>

      <MonitoringTouchBoundary>

        <GestureHandlerRootView style={{ flex: 1 }}>

          <QueryClientProvider client={travelSocialQueryClient}>

          <SafeAreaProvider>

            <NotificationBannerHost>

              <ThemeProvider>

                <UserProvider>

                  <DataProvider>

                    <LocationProvider>

                      <EntitlementProvider>

                        <ToastProvider>

                          <AppInitializer>

                            <RootNavigator />

                          </AppInitializer>

                        </ToastProvider>

                      </EntitlementProvider>

                    </LocationProvider>

                  </DataProvider>

                </UserProvider>

              </ThemeProvider>

            </NotificationBannerHost>

          </SafeAreaProvider>

          </QueryClientProvider>

        </GestureHandlerRootView>

      </MonitoringTouchBoundary>

    </ErrorBoundary>

  );

}


