import { defineConfig } from 'vitest/config';
import { baseVitestConfig, E2E_TEST_GLOB, SERIAL_DB_TEST_OPTIONS } from './vitest.shared.js';

/** End-to-end payment / ride flows — serial, dedicated test DB. */
export default defineConfig(
  baseVitestConfig({
    test: {
      setupFiles: ['./src/__tests__/helpers/setup.ts'],
      globalSetup: ['./src/__tests__/helpers/global-setup.ts'],
      globalTeardown: ['./src/__tests__/helpers/global-setup.ts'],
      ...SERIAL_DB_TEST_OPTIONS,
      include: [E2E_TEST_GLOB],
    },
  }),
);
