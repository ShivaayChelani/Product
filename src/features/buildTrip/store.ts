import { create } from 'zustand';

type BuildTripUiStore = {
  optimizing: boolean;
  setOptimizing: (v: boolean) => void;
};

export const useBuildTripUiStore = create<BuildTripUiStore>(set => ({
  optimizing: false,
  setOptimizing: optimizing => set({ optimizing }),
}));
