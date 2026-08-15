import { z } from 'zod';

export const syncBatchSchema = z.object({
  operations: z.array(z.object({
    action: z.enum(['create', 'update', 'delete']),
    entityType: z.string().min(1),
    entityId: z.string().optional(),
    payload: z.record(z.any()),
    clientTimestamp: z.string().optional(),
  })).min(1).max(100),
});

export type SyncBatchInput = z.infer<typeof syncBatchSchema>;
