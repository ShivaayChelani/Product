import { describe, expect, it } from "vitest";
import { eventDurationDays, eventLifecycle } from "./eventModeration";

describe("event moderation lifecycle helpers", () => {
  it("calculates inclusive multi-day durations and rejects invalid ranges", () => {
    expect(eventDurationDays("2026-10-10T00:00:00.000Z", "2026-10-12T00:00:00.000Z")).toBe(3);
    expect(eventDurationDays("invalid", "2026-10-12T00:00:00.000Z")).toBeNull();
    expect(eventDurationDays("2026-10-12T00:00:00.000Z", "2026-10-10T00:00:00.000Z")).toBeNull();
  });

  it("derives approved event lifecycle using UTC start and exclusive end boundaries", () => {
    const event = {
      status: "APPROVED" as const,
      startDate: "2026-10-10T00:00:00.000Z",
      endDate: "2026-10-12T00:00:00.000Z",
      startTime: "09:30",
      endTime: "18:00",
    };
    expect(eventLifecycle(event, new Date("2026-10-10T09:29:00.000Z"))).toBe("UPCOMING");
    expect(eventLifecycle(event, new Date("2026-10-10T09:30:00.000Z"))).toBe("LIVE");
    expect(eventLifecycle(event, new Date("2026-10-12T18:00:00.000Z"))).toBe("ENDED");
    expect(eventLifecycle({ ...event, status: "PENDING" }, new Date("2026-10-10T12:00:00.000Z"))).toBeNull();
  });
});
