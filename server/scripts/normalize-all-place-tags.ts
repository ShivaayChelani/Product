/**
 * Re-normalize tags on all tourist places in DB.
 *   ts-node scripts/normalize-all-place-tags.ts
 *   ts-node scripts/normalize-all-place-tags.ts --after=<placeId>
 */
import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { buildPlaceTags, normalizeCategory } from '../src/shared/utils/placeTags';
import { isTouristWorthyPlace } from '../src/shared/utils/touristPlaceFilter';

const prisma = new PrismaClient();
const DRY = process.argv.includes('--dry-run');
const BATCH = 400;
const CHECKPOINT = path.join(__dirname, '..', 'reports', 'ops', 'normalize-tags-checkpoint.json');

function isConnectionError(err: any): boolean {
  const code = err?.code;
  if (['P1017', 'P1001', 'P1008', 'P2024'].includes(code)) return true;
  const msg = String(err?.message || '');
  return /closed the connection|Can't reach database server|Connection terminated/i.test(msg);
}

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      if (err?.code === 'P2025') throw err;
      if (!isConnectionError(err) || attempt >= 5) throw err;
      await prisma.$disconnect();
      await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
    }
  }
  throw new Error('retries exhausted');
}

function parseAfter(): string | undefined {
  const arg = process.argv.find((a) => a.startsWith('--after='));
  if (arg) return arg.split('=')[1];
  if (fs.existsSync(CHECKPOINT)) {
    try {
      const cp = JSON.parse(fs.readFileSync(CHECKPOINT, 'utf8'));
      if (cp?.cursor) {
        console.log(`Resuming from checkpoint cursor ${cp.cursor} (scanned ${cp.scanned})`);
        return cp.cursor as string;
      }
    } catch {
      /* ignore */
    }
  }
  return undefined;
}

function saveCheckpoint(cursor: string, scanned: number, updated: number) {
  fs.mkdirSync(path.dirname(CHECKPOINT), { recursive: true });
  fs.writeFileSync(
    CHECKPOINT,
    JSON.stringify({ cursor, scanned, updated, savedAt: new Date().toISOString() }, null, 2),
  );
}

async function main() {
  let cursor: string | undefined = parseAfter();
  let updated = 0;
  let scanned = 0;

  for (;;) {
    const rows = await withRetry(() =>
      prisma.place.findMany({
        where: { mergedIntoId: null },
        select: {
          id: true,
          name: true,
          category: true,
          state: true,
          city: true,
          tags: true,
          source: true,
          editorialPriority: true,
          description: true,
          externalId: true,
        },
        take: BATCH,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        orderBy: { id: 'asc' },
      }),
    );
    if (rows.length === 0) break;

    for (const r of rows) {
      scanned++;
      if (!isTouristWorthyPlace(r)) continue;

      const wikidataId = r.externalId?.match(/wikidata:(Q\d+)/i)?.[1];
      const tags = buildPlaceTags({
        category: normalizeCategory(r.category),
        state: r.state,
        city: r.city,
        extraTags: r.tags,
        wikidataId,
      });

      const sortedA = [...tags].sort().join('|');
      const sortedB = [...(r.tags || [])].sort().join('|');
      if (sortedA === sortedB) continue;

      if (!DRY) {
        try {
          await withRetry(() =>
            prisma.place.update({
              where: { id: r.id },
              data: { tags, category: normalizeCategory(r.category) },
            }),
          );
        } catch (err: any) {
          if (err?.code === 'P2025') continue;
          throw err;
        }
      }
      updated++;
    }

    cursor = rows[rows.length - 1].id;
    saveCheckpoint(cursor, scanned, updated);
    console.log(`Scanned ${scanned}, updated ${updated}${DRY ? ' (dry-run)' : ''}`);
    if (rows.length < BATCH) break;
  }

  if (fs.existsSync(CHECKPOINT)) fs.unlinkSync(CHECKPOINT);
  console.log(`Tag normalization complete: ${updated} / ${scanned}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
