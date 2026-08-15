import client from "./client";
import type { SingleResponse } from "@/types";

export type CanonicalPlatformStatus = {
  places: { total: number; verified: number; draft: number; withPublicId: number };
  duplicateCandidatesOpen: number;
  boundaryValidation: string;
  semanticSearch: string;
};

export type DuplicateCandidate = {
  id: string;
  placeAId: string;
  placeBId: string;
  confidenceScore: number;
  status: string;
  signals?: Record<string, unknown>;
  placeA: { id: string; name: string; state: string; city: string; publicPlaceId: string | null; dataQuality: string };
  placeB: { id: string; name: string; state: string; city: string; publicPlaceId: string | null; dataQuality: string };
};

export type VerificationQueueItem = {
  id: string;
  name: string;
  state: string;
  city: string;
  dataQuality: string;
  publicPlaceId: string | null;
  createdAt: string;
};

export async function getCanonicalStatus(): Promise<CanonicalPlatformStatus> {
  const res = await client.get<SingleResponse<CanonicalPlatformStatus>>("/admin/canonical/status");
  return res.data.data;
}

export async function getDuplicateCandidates(status = "OPEN"): Promise<DuplicateCandidate[]> {
  const res = await client.get<SingleResponse<DuplicateCandidate[]>>("/admin/canonical/duplicates", {
    params: { status },
  });
  return res.data.data;
}

export async function dismissDuplicate(id: string): Promise<void> {
  await client.post(`/admin/canonical/duplicates/${id}/dismiss`);
}

export async function mergePlaces(body: {
  canonicalPlaceId: string;
  duplicatePlaceIds: string[];
  reason?: string;
}): Promise<{ canonicalPlaceId: string; merged: string[] }> {
  const res = await client.post<SingleResponse<{ canonicalPlaceId: string; merged: string[] }>>(
    "/admin/canonical/merge",
    body,
  );
  return res.data.data;
}

export async function verifyPlace(id: string, notes?: string): Promise<unknown> {
  const res = await client.post<SingleResponse<unknown>>(`/admin/canonical/places/${id}/verify`, { notes });
  return res.data.data;
}

export async function getVerificationQueue(): Promise<VerificationQueueItem[]> {
  const res = await client.get<SingleResponse<VerificationQueueItem[]>>("/admin/canonical/verification-queue");
  return res.data.data;
}

export async function resolvePlaceQuery(q: string): Promise<unknown[]> {
  const res = await client.get<SingleResponse<unknown[]>>("/admin/canonical/resolve", { params: { q } });
  return res.data.data;
}

export async function getMergeLogs(placeId?: string): Promise<unknown[]> {
  const res = await client.get<SingleResponse<unknown[]>>("/admin/canonical/merge-logs", {
    params: placeId ? { placeId } : undefined,
  });
  return res.data.data;
}

export type DashboardMetrics = {
  duplicates: { openCandidates: number; mergedCandidates: number; mergeOperations: number };
  verification: { total: number; verified: number; draft: number; pendingReview: number; coveragePercent: number };
  images: { total: number; rejected: number; licenseVerified: number; compliancePercent: number };
  search: { queriesLast7Days: number; hybridSearchEnabled: boolean; embeddingsIndexed: number; embeddingProviderConfigured: boolean };
  boundaries: { dataset: Record<string, unknown>; validationsTotal: number; failureRatePercent: number };
};

export async function getDashboardMetrics(): Promise<DashboardMetrics> {
  const res = await client.get<SingleResponse<DashboardMetrics>>("/admin/canonical/metrics/dashboard");
  return res.data.data;
}

export type HybridSearchHit = {
  placeId?: string;
  name?: string;
  score?: number;
  source?: string;
  [key: string]: unknown;
};

export async function hybridSearchInspect(q: string, limit = 20): Promise<HybridSearchHit[]> {
  const res = await client.get<SingleResponse<HybridSearchHit[]>>("/admin/canonical/search/hybrid", {
    params: { q, limit, inspect: "true" },
  });
  return res.data.data ?? [];
}

export type DatabaseQualityReport = {
  generatedAt: string;
  summary: {
    canonicalActive: number;
    mergedRecords: number;
    mergeLogs: number;
    aliasCount: number;
    verified: number;
    draft: number;
    pendingReview: number;
    duplicateCandidatesOpen: number;
    duplicateCandidatesMerged: number;
    duplicateCandidatesDismissed: number;
    manualReviewBandCount: number;
    missingGeohash: number;
    missingCoordinates: number;
    geohashCellsPrecision6: number;
  };
  coverageByState: { state: string; count: number }[];
  coverageByCategory: { category: string; count: number }[];
  manualReviewSamples: {
    confidenceScore: number;
    placeA: { id: string; name: string; state: string; publicPlaceId: string | null } | null;
    placeB: { id: string; name: string; state: string; publicPlaceId: string | null } | null;
  }[];
};

export async function getQualityReport(): Promise<DatabaseQualityReport> {
  const res = await client.get<SingleResponse<DatabaseQualityReport>>("/admin/canonical/quality-report");
  return res.data.data;
}

export async function bulkVerifyPlaces(placeIds: string[], notes?: string): Promise<{
  attempted: number;
  verified: number;
  failed: number;
}> {
  const res = await client.post<SingleResponse<{ attempted: number; verified: number; failed: number }>>(
    "/admin/canonical/places/bulk-verify",
    { placeIds, notes },
  );
  return res.data.data;
}
