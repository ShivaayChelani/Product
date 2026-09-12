import { describe, expect, it, vi } from "vitest";

vi.mock("./client", () => ({
  default: { delete: vi.fn(async () => ({ data: { ok: true } })) },
}));

import client from "./client";
import { deleteImport } from "./riddles";

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
});