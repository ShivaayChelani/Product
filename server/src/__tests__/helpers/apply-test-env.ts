/**
 * Side-effect module: resolve and apply the TEST database URLs to process.env
 * BEFORE the Prisma client is constructed.
 *
 * Vitest does not inject `test.env` into the globalSetup process, and `dotenv`
 * (loaded from vitest.shared.js) populates `.env.test`'s DATABASE_URL. Because the
 * Prisma client binds its datasource URL at construction time, importing the client
 * before applying the resolved TEST URLs would send the global setup (extensions,
 * indexes, seed) to `.env.test`'s database instead of TEST_DATABASE_URL.
 *
 * Import this module FIRST, before `config/database` or anything that imports it.
 */
import { applyTestDatabaseEnv } from '../../config/test-database';

applyTestDatabaseEnv();
