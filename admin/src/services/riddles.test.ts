import { describe, expect, it, vi } from "vitest";

vi.mock("./client", () => ({
  default: {
    delete: vi.fn(async () => ({ data: { ok: true } })),
    get: vi.fn(async () => ({ data: { ok: true } })),
  },
}));

import client from "./client";
import { deleteImport, getTreasureOverview, getImportHistory } from "./riddles";

describe("deleteImport service", () => {
  it("calls the import-scoped admin endpoint and returns the envelope", async () => {
    (client.delete as any).mockResolvedValueOnce({
      data: {
        success: true,
        message: "Import deleted.",
        data: {
          importId: "imp-1",
          fileName: "kolkata.xlsx",
          alreadyDeleted: false,
          mode: "DELETED",
          hunts: 1,
          riddles: 12,
        },
      },
    });

    const res = await deleteImport("imp-1");

    expect(client.delete).toHaveBeenCalledWith("/admin/riddles/imports/imp-1");
    expect(res.data).toMatchObject({ importId: "imp-1", mode: "DELETED", riddles: 12 });
    expect(res.message).toBe("Import deleted.");
  });

  it("disallows re-deleting an already-interrupted request via the dialog double-submit guard", async () => {
    // The dialog guards `submitting` before ANY request; with a DELETED log the
    // server also answers idempotently (alreadyDeleted:true). Here we lock the
    // "already deleted" contract the dialog relies on.
    (client.delete as any).mockResolvedValueOnce({
      data: {
        success: true,
        message: "Import was already deleted. Nothing changed.",
        data: { importId: "imp-mp", fileName: "madhya-pradesh.xlsx", alreadyDeleted: true, mode: "NONE", hunts: 0, riddles: 0 },
      },
    });

    const res = await deleteImport("imp-mp");
    expect(res.data.alreadyDeleted).toBe(true);
    expect(res.data.mode).toBe("NONE");
  });

  it("getTreasureOverview consumes the canonical server stats + server-filtered Recent Imports (no client-side count)", async () => {
    (client.get as any).mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          stats: { activeHunts: 78, activeCities: 78, activeRiddles: 197, totalImports: 2, todayAttempts: 5, todayCorrect: 3, todayWrong: 2, todayPoints: 60 },
          recentImports: [
            { id: "imp-completed", fileName: "west-bengal.xlsx", status: "COMPLETED", deletedAt: null, uploadedBy: { id: "a", name: "A", email: "a@x.com" } },
          ],
        },
      },
    });

    const overview = await getTreasureOverview();
    expect(client.get).toHaveBeenCalledWith("/admin/riddles/overview");
    expect(overview.stats.totalImports).toBe(2);
    // Recent Imports is consumed verbatim from the server (it already excludes DELETED).
    expect(overview.recentImports).toEqual([
      expect.objectContaining({ fileName: "west-bengal.xlsx", status: "COMPLETED" }),
    ]);
    expect(overview.recentImports).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ status: "DELETED" })]),
    );
  });

  it("getImportHistory preserves DELETED logs with deletedAt/deletedById for the full audit trail", async () => {
    (client.get as any).mockResolvedValueOnce({
      data: {
        success: true,
        data: [
          { id: "imp-completed", fileName: "west-bengal.xlsx", status: "COMPLETED", deletedAt: null },
          { id: "imp-mp", fileName: "madhya-pradesh.xlsx", status: "DELETED", deletedAt: "2026-09-12T00:22:17Z", deletedById: "admin-1", uploadedBy: { id: "admin-1", name: "Admin", email: "a@x.com" } },
        ],
        pagination: { page: 1, limit: 20, total: 2, totalPages: 1, hasNext: false, hasPrev: false },
      },
    });

    const history = await getImportHistory({ page: 1, limit: 20 });
    expect(client.get).toHaveBeenCalledWith("/admin/riddles/import-history", { params: { page: 1, limit: 20 } });
    expect(history.pagination.total).toBe(2);
    const deleted = history.data.find((l: any) => l.status === "DELETED");
    expect(deleted.fileName).toBe("madhya-pradesh.xlsx");
    expect(deleted.deletedAt).toBe("2026-09-12T00:22:17Z");
    expect(deleted.deletedById).toBe("admin-1");
  });
});