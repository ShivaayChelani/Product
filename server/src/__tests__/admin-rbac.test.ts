import { describe, expect, it, vi } from "vitest";
import { Role } from "@prisma/client";
import { requireRoles } from "../middleware/auth";
import { requireContentOps, requirePlatformOps } from "../middleware/adminCapabilities";
import { ApiError } from "../shared/utils/ApiError";

vi.mock("../shared/services/authRevalidation", () => ({
  revalidateRequestUser: vi.fn(async (req: Express.Request) => req),
  revalidateVendorCapability: vi.fn(async (req: Express.Request) => req),
}));

function mockReq(roles: Role[]) {
  return {
    user: {
      id: "u1",
      email: "t@example.com",
      name: "T",
      permission: roles[0],
      activeMode: roles[0],
      roles,
    },
  };
}

describe("requireRoles / admin capabilities", () => {
  it("returns 401-path equivalent when unauthenticated (403 ROLE_REQUIRED via missing roles)", async () => {
    const mw = requireRoles([Role.ADMIN]);
    const next = vi.fn();
    mw({ user: undefined }, {}, next);
    expect(next).toHaveBeenCalledOnce();
    const err = next.mock.calls[0][0] as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.statusCode).toBe(403);
  });

  it("blocks ANALYTICS_VIEWER from platform mutations", async () => {
    const next = vi.fn();
    requirePlatformOps(mockReq([Role.ANALYTICS_VIEWER]), {}, next);
    await vi.waitFor(() => expect(next).toHaveBeenCalled());
    const err = next.mock.calls[0][0] as ApiError;
    expect(err.statusCode).toBe(403);
  });

  it("blocks ANALYTICS_VIEWER from content mutations", async () => {
    const next = vi.fn();
    requireContentOps(mockReq([Role.ANALYTICS_VIEWER]), {}, next);
    await vi.waitFor(() => expect(next).toHaveBeenCalled());
    const err = next.mock.calls[0][0] as ApiError;
    expect(err.statusCode).toBe(403);
  });

  it("allows CONTENT_MODERATOR on content mutations", async () => {
    const next = vi.fn();
    requireContentOps(mockReq([Role.CONTENT_MODERATOR]), {}, next);
    await vi.waitFor(() => expect(next).toHaveBeenCalled());
    expect(next.mock.calls[0].length).toBe(0);
  });

  it("allows SUPER_ADMIN on platform mutations", async () => {
    const next = vi.fn();
    requirePlatformOps(mockReq([Role.SUPER_ADMIN]), {}, next);
    await vi.waitFor(() => expect(next).toHaveBeenCalled());
    expect(next.mock.calls[0].length).toBe(0);
  });
});
