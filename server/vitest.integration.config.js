import { defineConfig } from 'vitest/config';
import { baseVitestConfig, UNIT_TEST_FILES, E2E_TEST_GLOB, SERIAL_DB_TEST_OPTIONS } from './vitest.shared.js';

/** HTTP + DB integration tests (excludes *.integration.test.ts e2e flows). */
export default defineConfig(
  baseVitestConfig({
    test: {
      setupFiles: ['./src/__tests__/helpers/setup.ts'],
      globalSetup: ['./src/__tests__/helpers/global-setup.ts'],
      globalTeardown: ['./src/__tests__/helpers/global-setup.ts'],
      ...SERIAL_DB_TEST_OPTIONS,
      include: ['src/__tests__/**/*.test.ts'],
      exclude: [...UNIT_TEST_FILES, E2E_TEST_GLOB, '**/dist/**', '**/node_modules/**'],
    },
  }),
);
