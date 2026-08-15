import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { monetizationApi, type Entitlements } from '../services/api/monetization';
import { useUserContext } from './UserContext';
import { DEV_FLAGS } from '../config/devFlags';
import { adsService } from '../services/adsService';

type EntitlementContextValue = {
  entitlements: Entitlements | null;
  loading: boolean;
  error: string | null;
  isPremium: boolean;
  showAds: boolean;
  refreshEntitlements: () => Promise<void>;
};

const defaultEntitlements: Entitlements = {
  isPremium: false,
  showAds: true,
  premiumBadge: null,
  premiumTheme: false,
  premiumExpiresAt: null,
  premiumPlan: null,
  premiumExpired: false,
  vendorSubscription: null,
  vendorListing: null,
  creatorMembership: null,
  subscriptions: [],
};

const EntitlementContext = createContext<EntitlementContextValue>({
  entitlements: defaultEntitlements,
  loading: false,
  error: null,
  isPremium: false,
  showAds: true,
  refreshEntitlements: async () => {},
});

export function EntitlementProvider({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, isGuest } = useUserContext();
  const [entitlements, setEntitlements] = useState<Entitlements | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshEntitlements = useCallback(async () => {
    if (!DEV_FLAGS.USE_SERVER_API || !isAuthenticated || isGuest) {
      setEntitlements(defaultEntitlements);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await monetizationApi.getEntitlements();
      setEntitlements(data || defaultEntitlements);
    } catch (e: any) {
      setError(e?.message || 'Could not load entitlements');
      setEntitlements(defaultEntitlements);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, isGuest]);

  useEffect(() => {
    refreshEntitlements();
  }, [refreshEntitlements, user?.uid, user?.activeMode]);

  useEffect(() => {
    const isPremium = !!entitlements?.isPremium;
    const showAds = entitlements ? !!entitlements.showAds : true;
    adsService.setEntitlementState(isPremium, showAds);
  }, [entitlements]);

  const value = useMemo<EntitlementContextValue>(() => ({
    entitlements,
    loading,
    error,
    isPremium: !!entitlements?.isPremium,
    showAds: entitlements ? !!entitlements.showAds : true,
    refreshEntitlements,
  }), [entitlements, loading, error, refreshEntitlements]);

  return (
    <EntitlementContext.Provider value={value}>
      {children}
    </EntitlementContext.Provider>
  );
}

export function useEntitlements() {
  return useContext(EntitlementContext);
}
