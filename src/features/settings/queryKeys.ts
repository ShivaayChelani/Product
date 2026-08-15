export const settingsKeys = {
  all: ['settings'] as const,
  appSettings: () => [...settingsKeys.all, 'app'] as const,
  mobileConfig: () => [...settingsKeys.all, 'mobile-config'] as const,
  blocks: () => [...settingsKeys.all, 'blocks'] as const,
  sessions: () => [...settingsKeys.all, 'sessions'] as const,
  licenses: () => [...settingsKeys.all, 'licenses'] as const,
  wallet: () => [...settingsKeys.all, 'wallet'] as const,
};
