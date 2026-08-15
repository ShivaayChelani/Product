export const travellerProfileKeys = {
  wallet: ['traveller-profile', 'wallet'] as const,
  stats: (userId: string) => ['traveller-profile', 'stats', userId] as const,
  milestone: (balance: number) => ['traveller-profile', 'milestone', balance] as const,
};
