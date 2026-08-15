import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import type { BudgetTier, TravelPace, Travelers } from '../../services/api/trips';
import { AI_PLANNER_DRAFT_KEY, DEFAULT_DAYS, INTERESTS, MAX_INTERESTS, PROMPT_MAX } from './constants';

export type AiPlannerDraft = {
  destination: string;
  customPrompt: string;
  selectedInterests: string[];
  selectedPace: TravelPace;
  selectedCompanions: Travelers;
  selectedBudget: BudgetTier;
  selectedTransportation: string[];
  days: number;
};

export type FieldErrors = {
  destination?: string;
  interests?: string;
  pace?: string;
  travelers?: string;
  budget?: string;
};

const defaultDraft = (): AiPlannerDraft => ({
  destination: '',
  customPrompt: '',
  selectedInterests: [],
  selectedPace: 'BALANCED',
  selectedCompanions: 'FAMILY',
  selectedBudget: 'MEDIUM',
  selectedTransportation: ['CAR'],
  days: DEFAULT_DAYS,
});

const activeInterestValues = new Set<string>(INTERESTS.map(interest => interest.value));

function sanitizeInterests(interests?: string[]): string[] {
  return Array.isArray(interests)
    ? interests.filter(interest => activeInterestValues.has(interest))
    : [];
}

type Store = AiPlannerDraft & {
  errors: FieldErrors;
  isDirty: boolean;
  hydrate: (partial: Partial<AiPlannerDraft>) => void;
  setDestination: (v: string) => void;
  setCustomPrompt: (v: string) => void;
  toggleInterest: (value: string) => void;
  setPace: (v: TravelPace) => void;
  setCompanions: (v: Travelers) => void;
  setBudget: (v: BudgetTier) => void;
  toggleTransportation: (mode: string) => void;
  setDays: (n: number) => void;
  validate: () => boolean;
  clearErrors: () => void;
  markClean: () => void;
  reset: () => void;
  persistDraft: () => Promise<void>;
  loadDraft: () => Promise<void>;
};

export const useAiPlannerStore = create<Store>((set, get) => ({
  ...defaultDraft(),
  errors: {},
  isDirty: false,

  hydrate: partial => set(s => ({
    ...s,
    ...partial,
    selectedInterests: sanitizeInterests(partial.selectedInterests ?? s.selectedInterests),
    isDirty: true,
  })),

  setDestination: destination => set({ destination, isDirty: true, errors: { ...get().errors, destination: undefined } }),
  setCustomPrompt: text => {
    const customPrompt = text.slice(0, PROMPT_MAX);
    set({ customPrompt, isDirty: true });
  },
  toggleInterest: value =>
    set(s => {
      if (s.selectedInterests.includes(value)) {
        return {
          selectedInterests: s.selectedInterests.filter(i => i !== value),
          isDirty: true,
          errors: { ...s.errors, interests: undefined },
        };
      }
      if (s.selectedInterests.length >= MAX_INTERESTS) {
        return s;
      }
      return {
        selectedInterests: [...s.selectedInterests, value],
        isDirty: true,
        errors: { ...s.errors, interests: undefined },
      };
    }),
  setPace: selectedPace => set({ selectedPace, isDirty: true }),
  setCompanions: selectedCompanions => set({ selectedCompanions, isDirty: true }),
  setBudget: selectedBudget => set({ selectedBudget, isDirty: true }),
  toggleTransportation: mode =>
    set(s => {
      const has = s.selectedTransportation.includes(mode);
      const selectedTransportation = has
        ? s.selectedTransportation.filter(m => m !== mode)
        : [...s.selectedTransportation, mode];
      return {
        selectedTransportation: selectedTransportation.length ? selectedTransportation : ['CAR'],
        isDirty: true,
      };
    }),
  setDays: days => set({ days, isDirty: true }),

  validate: () => {
    const s = get();
    const errors: FieldErrors = {};
    if (!s.destination.trim()) errors.destination = 'Choose a destination';
    if (s.selectedInterests.length < 1) errors.interests = 'Pick at least one interest';
    if (!s.selectedPace) errors.pace = 'Select travel pace';
    if (!s.selectedCompanions) errors.travelers = 'Select traveller type';
    if (!s.selectedBudget) errors.budget = 'Select budget';
    set({ errors });
    return Object.keys(errors).length === 0;
  },

  clearErrors: () => set({ errors: {} }),
  markClean: () => set({ isDirty: false }),
  reset: () => set({ ...defaultDraft(), errors: {}, isDirty: false }),

  persistDraft: async () => {
    const s = get();
    const draft: AiPlannerDraft = {
      destination: s.destination,
      customPrompt: s.customPrompt,
      selectedInterests: sanitizeInterests(s.selectedInterests),
      selectedPace: s.selectedPace,
      selectedCompanions: s.selectedCompanions,
      selectedBudget: s.selectedBudget,
      selectedTransportation: s.selectedTransportation,
      days: s.days,
    };
    await AsyncStorage.setItem(AI_PLANNER_DRAFT_KEY, JSON.stringify(draft));
    set({ isDirty: false });
  },

  loadDraft: async () => {
    try {
      const raw = await AsyncStorage.getItem(AI_PLANNER_DRAFT_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<AiPlannerDraft>;
      set({
        ...defaultDraft(),
        ...parsed,
        selectedInterests: sanitizeInterests(parsed.selectedInterests),
        isDirty: false,
        errors: {},
      });
    } catch {
      /* ignore */
    }
  },
}));
