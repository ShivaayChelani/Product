import type { Prisma } from '@prisma/client';

type TxClient = Prisma.TransactionClient;

/**
 * Generates sequential receipt numbers: RCP-2026-000001
 * Must be called inside a transaction for atomicity.
 */
export async function generateReceiptNumber(tx: TxClient): Promise<string> {
  const year = new Date().getFullYear();

  const rows = await tx.$queryRaw<{ last_number: number }[]>`
    INSERT INTO receipt_sequences (year, last_number)
    VALUES (${year}, 1)
    ON CONFLICT (year) DO UPDATE
      SET last_number = receipt_sequences.last_number + 1
    RETURNING last_number
  `;

  const seq = rows[0]?.last_number ?? 1;
  return `RCP-${year}-${String(seq).padStart(6, '0')}`;
}
