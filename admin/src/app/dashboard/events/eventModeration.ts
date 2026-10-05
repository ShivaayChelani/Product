import type { AdminEvent, EventLifecycle } from "@/services/events";

export const EVENT_LIFECYCLES: EventLifecycle[] = ["LIVE", "UPCOMING", "ENDED"];

function datePart(value: string): [number, number, number] | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return [date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()];
}

function eventInstant(day: [number, number, number], time: string | null, endOfDay = false) {
  if (!time) {
    return endOfDay
      ? Date.UTC(day[0], day[1], day[2] + 1)
      : Date.UTC(day[0], day[1], day[2]);
  }
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!match) return null;
  return Date.UTC(day[0], day[1], day[2], Number(match[1]), Number(match[2]));
}

export function eventLifecycle(
  event: Pick<AdminEvent, "status" | "startDate" | "endDate" | "startTime" | "endTime">,
  now = new Date(),
): EventLifecycle | null {
  if (event.status !== "APPROVED") return null;
  const startDay = datePart(event.startDate);
  const endDay = datePart(event.endDate);
  if (!startDay || !endDay) return null;
  const start = eventInstant(startDay, event.startTime);
  const end = eventInstant(endDay, event.endTime, true);
  if (start === null || end === null) return null;
  if (now.getTime() < start) return "UPCOMING";
  if (now.getTime() < end) return "LIVE";
  return "ENDED";
}

export function eventDurationDays(startDate: string, endDate: string): number | null {
  const start = datePart(startDate);
  const end = datePart(endDate);
  if (!start || !end) return null;
  const startMs = Date.UTC(...start);
  const endMs = Date.UTC(...end);
  if (endMs < startMs) return null;
  return Math.floor((endMs - startMs) / 86_400_000) + 1;
}

export function formatEventDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "UTC" }).format(date);
}

export function eventTypeLabel(type: string): string {
  return type.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}
