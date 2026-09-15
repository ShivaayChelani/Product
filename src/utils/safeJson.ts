export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseJsonSafe<T>(raw: string, fallback: T, isValid?: (value: unknown) => value is T): T {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (isValid && !isValid(parsed)) return fallback;
    return parsed as T;
  } catch {
    return fallback;
  }
}

export function parseJsonObject(raw: string): Record<string, unknown> | null {
  return parseJsonSafe(raw, null, (value): value is Record<string, unknown> => isPlainObject(value));
}

export function parseJsonStringArray(raw: string): string[] {
  const parsed = parseJsonSafe<unknown>(raw, []);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((item): item is string => typeof item === 'string');
}

export function parseJsonArray(raw: string): unknown[] | null {
  const parsed = parseJsonSafe<unknown>(raw, null);
  return Array.isArray(parsed) ? parsed : null;
}
