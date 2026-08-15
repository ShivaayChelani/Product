import { PlaceEmbeddingStatus } from '@prisma/client';
import { env } from '../../../config/env';
import { prisma } from '../../../config/database';

const DEFAULT_MODEL = 'text-embedding-3-small';

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export const embeddingService = {
  isConfigured(): boolean {
    return env.hybridSearchEnabled && !!env.openaiApiKey;
  },

  model(): string {
    return env.embeddingModel || DEFAULT_MODEL;
  },

  async embedText(text: string): Promise<number[] | null> {
    if (!this.isConfigured()) return null;
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model(),
        input: text.slice(0, 8000),
      }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: { embedding: number[] }[] };
    return json.data?.[0]?.embedding ?? null;
  },

  async upsertPlaceEmbedding(placeId: string): Promise<boolean> {
    const place = await prisma.place.findUnique({
      where: { id: placeId },
      select: {
        id: true,
        name: true,
        description: true,
        city: true,
        state: true,
        aliases: { select: { alias: true } },
      },
    });
    if (!place) return false;

    if (!this.isConfigured()) {
      await prisma.place.update({
        where: { id: placeId },
        data: { embeddingStatus: PlaceEmbeddingStatus.SKIPPED },
      });
      return false;
    }

    const text = [
      place.name,
      place.description,
      `${place.city} ${place.state}`,
      ...place.aliases.map((a) => a.alias),
    ]
      .filter(Boolean)
      .join('\n');

    const embedding = await this.embedText(text);
    if (!embedding) {
      await prisma.place.update({
        where: { id: placeId },
        data: { embeddingStatus: PlaceEmbeddingStatus.FAILED },
      });
      return false;
    }

    const model = this.model();
    const now = new Date();
    await prisma.$transaction([
      prisma.placeSearchEmbedding.upsert({
        where: { placeId },
        create: { placeId, model, embedding },
        update: { model, embedding },
      }),
      prisma.place.update({
        where: { id: placeId },
        data: {
          embeddingStatus: PlaceEmbeddingStatus.INDEXED,
          embeddingVersion: model,
          embeddingUpdatedAt: now,
        },
      }),
    ]);
    return true;
  },
};

export function rankByEmbedding(
  queryEmbedding: number[],
  rows: { placeId: string; embedding: number[] }[],
): Map<string, number> {
  const scores = new Map<string, number>();
  for (const row of rows) {
    scores.set(row.placeId, cosineSimilarity(queryEmbedding, row.embedding));
  }
  return scores;
}
