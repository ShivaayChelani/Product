import { defineConfig } from 'vitest/config';
import { baseVitestConfig, SERIAL_DB_TEST_OPTIONS } from './vitest.shared.js';

/** Full suite — unit + integration + e2e (serial DB tests). */
export default defineConfig(
  baseVitestConfig({
    test: {
      setupFiles: ['./src/__tests__/helpers/setup.ts'],
      globalSetup: ['./src/__tests__/helpers/global-setup.ts'],
      globalTeardown: ['./src/__tests__/helpers/global-setup.ts'],
      ...SERIAL_DB_TEST_OPTIONS,
      include: ['src/__tests__/**/*.test.ts'],
    },
  }),
);
