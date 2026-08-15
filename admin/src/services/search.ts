import client from './client';

export type AdminGlobalSearchResult = {
  places: Array<{
    id: string;
    name: string;
    city?: string | null;
    state?: string | null;
    publicPlaceId?: string | null;
    status?: string;
  }>;
  users: Array<{
    id: string;
    name?: string | null;
    email: string;
    permission?: string;
  }>;
  vendors: Array<{
    id: string;
    businessName: string;
    city?: string | null;
    status?: string;
  }>;
};

export async function adminGlobalSearch(q: string): Promise<AdminGlobalSearchResult> {
  const res = await client.get<{ data: AdminGlobalSearchResult }>('/search/admin/global', {
    params: { q },
  });
  return res.data?.data ?? { places: [], users: [], vendors: [] };
}
