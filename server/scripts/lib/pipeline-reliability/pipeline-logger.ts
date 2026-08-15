import fs from 'fs';
import path from 'path';

export type LogEvent =
  | 'place_start'
  | 'place_success'
  | 'place_failure'
  | 'place_crash'
  | 'place_skip'
  | 'checkpoint_saved'
  | 'dlq_enqueue'
  | 'retry'
  | 'memory_pressure'
  | 'rate_limit'
  | 'progress_report'
  | 'worker_lifecycle';

export class PipelineLogger {
  private readonly logPath: string;

  constructor(baseDir: string) {
    fs.mkdirSync(baseDir, { recursive: true });
    this.logPath = path.join(baseDir, 'pipeline-run.log');
  }

  log(event: LogEvent, data: Record<string, unknown>) {
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      event,
      pid: process.pid,
      ...data,
    });
    console.log(line);
    fs.appendFileSync(this.logPath, `${line}\n`, 'utf8');
  }

  path(): string {
    return this.logPath;
  }
}
