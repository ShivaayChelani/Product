import { defineConfig } from 'vitest/config';
import { baseVitestConfig, UNIT_TEST_FILES } from './vitest.shared.js';

/** Pure unit tests — no DB seed, no Prisma connect, may run in parallel. */
export default defineConfig(
  baseVitestConfig({
    test: {
      include: UNIT_TEST_FILES,
      fileParallelism: true,
      maxWorkers: '50%',
      setupFiles: [],
      globalSetup: [],
      globalTeardown: [],
    },
  }),
);
