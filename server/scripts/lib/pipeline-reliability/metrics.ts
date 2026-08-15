import type { PipelineMetrics } from './types';

export class PipelineMetricsTracker {
  private readonly startedAt = Date.now();
  private durations: number[] = [];
  private successes = 0;
  private failures = 0;
  private retries = 0;

  recordSuccess(durationMs: number) {
    this.successes += 1;
    this.durations.push(durationMs);
    if (this.durations.length > 500) this.durations.shift();
  }

  recordFailure() {
    this.failures += 1;
  }

  recordRetry() {
    this.retries += 1;
  }

  snapshot(input: {
    processed: number;
    enriched: number;
    errors: number;
    remaining: number;
    queueSize: number;
    checkpointAgeMs: number;
    memoryRssMb: number;
    memoryHeapUsedMb: number;
    memoryHeapTotalMb: number;
    memoryExternalMb: number;
    eventLoopDelayMs: number;
    currentBatchSize: number;
  }): PipelineMetrics {
    const elapsedMin = Math.max(0.01, (Date.now() - this.startedAt) / 60_000);
    const totalOutcomes = this.successes + this.failures;
    const avgMs = this.durations.length
      ? Math.round(this.durations.reduce((a, b) => a + b, 0) / this.durations.length)
      : 0;
    const ppm = Math.round((input.processed / elapsedMin) * 10) / 10;
    const estMin = ppm > 0 ? Math.round((input.remaining / ppm) * 10) / 10 : null;

    return {
      startedAt: new Date(this.startedAt).toISOString(),
      placesPerMinute: ppm,
      avgProcessingMs: avgMs,
      successRate: totalOutcomes ? Math.round((this.successes / totalOutcomes) * 1000) / 10 : 100,
      failureRate: totalOutcomes ? Math.round((this.failures / totalOutcomes) * 1000) / 10 : 0,
      retryRate: input.processed ? Math.round((this.retries / input.processed) * 1000) / 10 : 0,
      queueSize: input.queueSize,
      checkpointAgeMs: input.checkpointAgeMs,
      memoryRssMb: input.memoryRssMb,
      memoryHeapUsedMb: input.memoryHeapUsedMb,
      memoryHeapTotalMb: input.memoryHeapTotalMb,
      memoryExternalMb: input.memoryExternalMb,
      eventLoopDelayMs: input.eventLoopDelayMs,
      currentBatchSize: input.currentBatchSize,
      processed: input.processed,
      enriched: input.enriched,
      errors: input.errors,
      remaining: input.remaining,
      estimatedCompletionMinutes: estMin,
    };
  }
}
