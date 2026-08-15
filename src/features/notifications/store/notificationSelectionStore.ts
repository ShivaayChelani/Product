import { create } from 'zustand';

type SelectionState = {
  enabled: boolean;
  selectedIds: Set<string>;
  toggleSelectionMode: (on?: boolean) => void;
  toggleId: (id: string) => void;
  clear: () => void;
  selectAll: (ids: string[]) => void;
};

export const useNotificationSelectionStore = create<SelectionState>((set, get) => ({
  enabled: false,
  selectedIds: new Set(),
  toggleSelectionMode: on => {
    const next = on ?? !get().enabled;
    set({ enabled: next, selectedIds: next ? get().selectedIds : new Set() });
  },
  toggleId: id =>
    set(state => {
      const next = new Set(state.selectedIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { selectedIds: next };
    }),
  clear: () => set({ enabled: false, selectedIds: new Set() }),
  selectAll: ids => set({ selectedIds: new Set(ids) }),
}));
