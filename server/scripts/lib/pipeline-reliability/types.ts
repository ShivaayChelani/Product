export type PipelineSource = 'wikidata' | 'osm' | 'all' | 'external-ids';

export type PipelineCheckpointV2 = {
  version: 2;
  source: PipelineSource;
  offset: number;
  lastPlaceId: string | null;
  lastExternalId: string | null;
  batchNumber: number;
  retryCount: number;
  processed: number;
  enriched: number;
  errors: number;
  skipped: number;
  failedQueueSize: number;
  updatedAt: string;
};

export type PlaceAttemptState = {
  placeId: string;
  attempts: number;
  lastError?: string;
  lastAttemptAt?: string;
};

export type FailedEnrichmentRecord = {
  placeId: string;
  externalId: string | null;
  name: string;
  source: string;
  error: string;
  stackTrace: string;
  attemptCount: number;
  timestamp: string;
  exitCode?: number;
  request?: string;
  response?: string;
};

export type PlaceWorkerResult = {
  ok: boolean;
  placeId: string;
  name: string;
  externalId: string | null;
  source: string;
  enriched: boolean;
  errorCount: number;
  errors: string[];
  manualReviewReasons: string[];
  durationMs: number;
  filledFields: string[];
  exitCode?: number;
  crashed?: boolean;
};

export type BatchWorkerResult = {
  ok: boolean;
  workerId: string;
  crashed: boolean;
  exitCode?: number | null;
  durationMs: number;
  results: PlaceWorkerResult[];
  placesProcessed: number;
  placesRequested: number;
  stoppedEarly: boolean;
  stopReason?: string;
  memory: {
    peakRssMb?: number;
    peakHeapMb?: number;
    maxEventLoopLagMs?: number;
  };
};

export type PipelineMetrics = {
  startedAt: string;
  placesPerMinute: number;
  avgProcessingMs: number;
  successRate: number;
  failureRate: number;
  retryRate: number;
  queueSize: number;
  checkpointAgeMs: number;
  memoryRssMb: number;
  memoryHeapUsedMb: number;
  memoryHeapTotalMb: number;
  memoryExternalMb: number;
  eventLoopDelayMs: number;
  currentBatchSize: number;
  processed: number;
  enriched: number;
  errors: number;
  remaining: number;
  estimatedCompletionMinutes: number | null;
};
