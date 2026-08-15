import client from "./client";
import type { SingleResponse } from "@/types";
import type { DatabaseQualityReport } from "@/services/canonical";

export type DatabaseOverview = {
  generatedAt: string;
  status: "healthy" | "degraded" | "down";
  connection: {
    pooled: ConnectionInfo | null;
    direct: ConnectionInfo | null;
    ping: PingResult;
    directPing: PingResult | null;
  };
  postgres: {
    version: string;
    sizeBytes: number;
    connections: { active: number; idle: number; total: number };
  };
  extensions: {
    postgis: string | null;
    pgTrgm: string | null;
    searchIndex: boolean;
    allRequired: boolean;
  };
  migrations: {
    totalApplied: number;
    pending: number;
    recent: { name: string; finishedAt: string | null; steps: number }[];
  };
  envChecks: { key: string; status: "ok" | "warn" | "missing" | "info"; message: string }[];
  nodeEnv: string;
};

export type ConnectionInfo = {
  provider: "render" | "local" | "postgresql" | "unknown";
  host: string;
  port: string;
  database: string;
  sslMode: string;
  pooled: boolean;
  region: string | null;
  connectionLimit: string | null;
  poolTimeout: string | null;
};

export type PingResult = {
  ok: boolean;
  latencyMs: number;
  error?: string;
};

export type TableStat = {
  table: string;
  rowEstimate: number;
  sizeBytes: number;
};

export async function getDatabaseOverview(): Promise<DatabaseOverview> {
  const res = await client.get<SingleResponse<DatabaseOverview>>("/admin/database/overview");
  return res.data.data;
}

export async function getTableStats(): Promise<{ generatedAt: string; tables: TableStat[] }> {
  const res = await client.get<SingleResponse<{ generatedAt: string; tables: TableStat[] }>>(
    "/admin/database/tables",
  );
  return res.data.data;
}

export async function getDatabaseQualityReport(): Promise<DatabaseQualityReport> {
  const res = await client.get<SingleResponse<DatabaseQualityReport>>("/admin/database/quality-report");
  return res.data.data;
}

export async function ensureDatabaseExtensions(): Promise<DatabaseOverview["extensions"]> {
  const res = await client.post<SingleResponse<DatabaseOverview["extensions"]>>(
    "/admin/database/ops/ensure-extensions",
  );
  return res.data.data;
}

export async function runStartupSeed(): Promise<{ seeded: boolean; at: string }> {
  const res = await client.post<SingleResponse<{ seeded: boolean; at: string }>>(
    "/admin/database/ops/startup-seed",
  );
  return res.data.data;
}

export async function runSettingsSeed(): Promise<{ seeded: boolean; at: string }> {
  const res = await client.post<SingleResponse<{ seeded: boolean; at: string }>>(
    "/admin/database/ops/settings-seed",
  );
  return res.data.data;
}

export async function runDuplicateScan(body?: {
  precision?: number;
  prefixBatch?: number;
  prefixOffset?: number;
}): Promise<unknown> {
  const res = await client.post<SingleResponse<unknown>>("/admin/database/ops/duplicate-scan", body ?? {});
  return res.data.data;
}

export async function runAutoMerge(body?: { minConfidence?: number; limit?: number }): Promise<unknown> {
  const res = await client.post<SingleResponse<unknown>>("/admin/database/ops/auto-merge", body ?? {});
  return res.data.data;
}

export type DataIntegrityStatus = {
  generatedAt: string;
  dataSources: string[];
  noGoogleApiRequired: boolean;
  places: { total: number; verified: number; draft: number };
  gaps: {
    missingCoordinates: number;
    missingGeohash: number;
    missingExternalId: number;
    missingDescription: number;
    duplicateCandidatesOpen: number;
    syntheticRatings: number;
  };
  recommendedPhases: { phase: string; label: string }[];
};

export async function getDataIntegrityStatus(): Promise<DataIntegrityStatus> {
  const res = await client.get<SingleResponse<DataIntegrityStatus>>("/admin/database/data-integrity");
  return res.data.data;
}

export async function runDataIntegrityPhase(phase: string, limit = 500): Promise<unknown> {
  const res = await client.post<SingleResponse<unknown>>("/admin/database/ops/data-integrity", {
    phase,
    limit,
  });
  return res.data.data;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function providerLabel(provider: ConnectionInfo["provider"]): string {
  const map: Record<ConnectionInfo["provider"], string> = {
    render: "Render PostgreSQL",
    local: "Local PostgreSQL",
    postgresql: "PostgreSQL",
    unknown: "Unknown",
  };
  return map[provider] ?? provider;
}

export type ExplorerTable = {
  table: string;
  rowEstimate: number;
  sizeBytes: number;
};

export async function getExplorerTables(): Promise<{ tables: ExplorerTable[] }> {
  const res = await client.get<SingleResponse<{ tables: ExplorerTable[] }>>('/admin/database/explorer/tables');
  return res.data.data;
}

export type ExplorerColumn = {
  name: string;
  type: string;
  nullable: boolean;
  defaultValue: string | null;
};

export async function getExplorerTableSchema(tableName: string): Promise<{ table: string; columns: ExplorerColumn[] }> {
  const res = await client.get<SingleResponse<{ table: string; columns: ExplorerColumn[] }>>(`/admin/database/explorer/tables/${tableName}/schema`);
  return res.data.data;
}

export type ExplorerPagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export async function getExplorerTableRecords(tableName: string, page: number, pageSize: number, search?: string): Promise<{ table: string; pagination: ExplorerPagination; records: any[] }> {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  });
  if (search) params.set('search', search);

  const res = await client.get<SingleResponse<{ table: string; pagination: ExplorerPagination; records: any[] }>>(`/admin/database/explorer/tables/${tableName}/records?${params.toString()}`);
  return res.data.data;
}
