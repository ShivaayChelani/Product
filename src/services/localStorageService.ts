import AsyncStorage from '@react-native-async-storage/async-storage';
import { UserProfile, VendorBusiness, VendorOffer, VendorOfferRedemption, Reel, HiddenGemSubmission } from '../types';

const KEYS = {
  USER_PROGRESS: 'PALSAFAR_USER_PROGRESS',
  APP_PREFERENCES: 'PALSAFAR_APP_PREFERENCES',
  VENDORS: 'PALSAFAR_VENDORS',
  VENDOR_OFFERS: 'PALSAFAR_VENDOR_OFFERS',
  REDEMPTIONS: 'PALSAFAR_REDEMPTIONS',
  CURRENT_VENDOR: 'PALSAFAR_CURRENT_VENDOR',
  REELS: 'PALSAFAR_REELS',
  HIDDEN_GEM_SUBMISSIONS: 'PALSAFAR_HIDDEN_GEM_SUBMISSIONS',
  ONBOARDING_COMPLETED: 'PALSAFAR_ONBOARDING_COMPLETED',
};

export interface AppPreferences {
  selectedCity?: string;
  budget?: number;
  interests?: string[];
  travelPace?: 'relaxed' | 'moderate' | 'fast';
}

const DEFAULT_USER: UserProfile = {
  uid: 'guest-user',
  email: '',
  phoneNumber: '',
  displayName: 'Guest User',
  avatarStyle: 0,
  role: 'tourist',
  totalPoints: 0,
  visitedSpots: [],
  currentItinerary: [],
  completedItineraryStops: [],
  completedActivities: [],
  redemptions: [],
  createdAt: Date.now(),
  lastActive: Date.now(),
};

function ensureDefaults(data: Partial<UserProfile>): UserProfile {
  return {
    ...DEFAULT_USER,
    ...data,
    uid: data.uid || DEFAULT_USER.uid,
    phoneNumber: data.phoneNumber || '',
    displayName: data.displayName || DEFAULT_USER.displayName,
    avatarStyle: data.avatarStyle ?? 0,
    totalPoints: data.totalPoints ?? 0,
    visitedSpots: Array.isArray(data.visitedSpots) ? data.visitedSpots : [],
    currentItinerary: Array.isArray(data.currentItinerary) ? data.currentItinerary : [],
    completedItineraryStops: Array.isArray(data.completedItineraryStops) ? data.completedItineraryStops : [],
    completedActivities: Array.isArray(data.completedActivities) ? data.completedActivities : [],
    redemptions: Array.isArray(data.redemptions) ? data.redemptions : [],
    createdAt: data.createdAt || Date.now(),
    lastActive: Date.now(),
  };
}

export async function saveUserProgress(user: UserProfile): Promise<void> {
  try {
    const data = JSON.stringify({ ...user, lastActive: Date.now() });
    await AsyncStorage.setItem(KEYS.USER_PROGRESS, data);
  } catch (error) {
  }
}

export async function loadUserProgress(): Promise<UserProfile | null> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.USER_PROGRESS);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<UserProfile>;
    if (!parsed || typeof parsed !== 'object') return null;
    return ensureDefaults(parsed);
  } catch (error) {
    return null;
  }
}

export async function clearUserProgress(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEYS.USER_PROGRESS);
  } catch (error) {
  }
}

export async function saveAppPreferences(prefs: AppPreferences): Promise<void> {
  try {
    await AsyncStorage.setItem(KEYS.APP_PREFERENCES, JSON.stringify(prefs));
  } catch (error) {
  }
}

export async function loadAppPreferences(): Promise<AppPreferences | null> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.APP_PREFERENCES);
    if (!raw) return null;
    return JSON.parse(raw) as AppPreferences;
  } catch (error) {
    return null;
  }
}

export async function saveVendors(vendors: VendorBusiness[]): Promise<void> {
  try {
    await AsyncStorage.setItem(KEYS.VENDORS, JSON.stringify(vendors));
  } catch (error) {
  }
}

export async function loadVendors(): Promise<VendorBusiness[] | null> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.VENDORS);
    if (!raw) return null;
    return JSON.parse(raw) as VendorBusiness[];
  } catch (error) {
    return null;
  }
}

export async function saveVendorOffers(offers: VendorOffer[]): Promise<void> {
  try {
    await AsyncStorage.setItem(KEYS.VENDOR_OFFERS, JSON.stringify(offers));
  } catch (error) {
  }
}

export async function loadVendorOffers(): Promise<VendorOffer[] | null> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.VENDOR_OFFERS);
    if (!raw) return null;
    return JSON.parse(raw) as VendorOffer[];
  } catch (error) {
    return null;
  }
}

export async function saveRedemptions(redemptions: VendorOfferRedemption[]): Promise<void> {
  try {
    await AsyncStorage.setItem(KEYS.REDEMPTIONS, JSON.stringify(redemptions));
  } catch (error) {
  }
}

export async function loadRedemptions(): Promise<VendorOfferRedemption[] | null> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.REDEMPTIONS);
    if (!raw) return null;
    return JSON.parse(raw) as VendorOfferRedemption[];
  } catch (error) {
    return null;
  }
}

export async function saveCurrentVendor(vendor: VendorBusiness): Promise<void> {
  try {
    await AsyncStorage.setItem(KEYS.CURRENT_VENDOR, JSON.stringify(vendor));
  } catch (error) {
  }
}

export async function loadCurrentVendor(): Promise<VendorBusiness | null> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.CURRENT_VENDOR);
    if (!raw) return null;
    return JSON.parse(raw) as VendorBusiness;
  } catch (error) {
    return null;
  }
}

export async function clearCurrentVendor(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEYS.CURRENT_VENDOR);
  } catch (error) {
  }
}

export async function saveReels(reels: Reel[]): Promise<void> {
  try {
    await AsyncStorage.setItem(KEYS.REELS, JSON.stringify(reels));
  } catch (error) {
  }
}

export async function loadReels(): Promise<Reel[] | null> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.REELS);
    if (!raw) return null;
    return JSON.parse(raw) as Reel[];
  } catch (error) {
    return null;
  }
}

export async function saveHiddenGemSubmissions(submissions: HiddenGemSubmission[]): Promise<void> {
  try {
    await AsyncStorage.setItem(KEYS.HIDDEN_GEM_SUBMISSIONS, JSON.stringify(submissions));
  } catch (error) {
  }
}

export async function loadHiddenGemSubmissions(): Promise<HiddenGemSubmission[] | null> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.HIDDEN_GEM_SUBMISSIONS);
    if (!raw) return null;
    return JSON.parse(raw) as HiddenGemSubmission[];
  } catch (error) {
    return null;
  }
}

const SPOT_COORDS_KEY = 'PALSAFAR_SPOT_COORDINATES';

export interface SpotCoordinate {
  id: string;
  name: string;
  city: string;
  state: string;
  latitude: number;
  longitude: number;
  category: string;
}

export async function saveSpotCoordinates(spots: SpotCoordinate[]): Promise<void> {
  try {
    await AsyncStorage.setItem(SPOT_COORDS_KEY, JSON.stringify(spots));
  } catch (error) {
  }
}

export async function loadSpotCoordinates(): Promise<SpotCoordinate[] | null> {
  try {
    const raw = await AsyncStorage.getItem(SPOT_COORDS_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SpotCoordinate[];
  } catch (error) {
    return null;
  }
}

export async function setOnboardingCompleted(): Promise<void> {
  try {
    await AsyncStorage.setItem(KEYS.ONBOARDING_COMPLETED, 'true');
  } catch (error) {
  }
}

export async function resetOnboardingCompleted(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEYS.ONBOARDING_COMPLETED);
  } catch (error) {
  }
}

export async function isOnboardingCompleted(): Promise<boolean> {
  try {
    const val = await AsyncStorage.getItem(KEYS.ONBOARDING_COMPLETED);
    return val === 'true';
  } catch (error) {
    return false;
  }
}
