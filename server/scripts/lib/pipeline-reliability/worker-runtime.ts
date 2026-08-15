import { destroyHttpAgents } from './http-agent';

let handlersInstalled = false;

export function installWorkerRuntime(opts?: { workerId?: string }) {
  if (handlersInstalled) return;
  handlersInstalled = true;

  process.on('unhandledRejection', (reason) => {
    console.error(JSON.stringify({
      event: 'worker_unhandled_rejection',
      workerId: opts?.workerId,
      error: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
    }));
    process.exit(134);
  });

  process.on('uncaughtException', (err) => {
    console.error(JSON.stringify({
      event: 'worker_uncaught_exception',
      workerId: opts?.workerId,
      error: err.message,
      stack: err.stack,
    }));
    process.exit(134);
  });
}

export async function cleanupWorkerResources(disconnect?: () => Promise<void>) {
  destroyHttpAgents();
  if (disconnect) {
    await disconnect().catch(() => undefined);
  }
  if (typeof global.gc === 'function') {
    global.gc();
  }
}
