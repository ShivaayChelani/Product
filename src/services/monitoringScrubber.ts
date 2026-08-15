import type { Breadcrumb, ErrorEvent as SentryErrorEvent } from '@sentry/react-native';

/** Keys (case-insensitive) stripped or redacted from payloads. */
const SENSITIVE_KEY =
  /^(authorization|cookie|set-cookie|x-api-key|api[_-]?key|password|passwd|pwd|secret|token|refresh[_-]?token|access[_-]?token|id[_-]?token|session[_-]?id|otp|pin|cvv|cvc|card[_-]?number|credit[_-]?card|razorpay|payment|bearer)$/i;

const JWT_PATTERN = /^Bearer\s+eyJ[\w-]+\.[\w-]+\.[\w-]+$/i;
const JWT_INLINE = /eyJ[\w-]{10,}\.[\w-]{10,}\.[\w-]{10,}/g;
const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const PHONE_PATTERN = /(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4,}/g;
const CARD_PATTERN = /\b(?:\d[ -]*?){13,19}\b/g;

export const REDACTED = '[Filtered]';

function scrubString(value: string): string {
  let out = value;
  if (JWT_PATTERN.test(out)) return REDACTED;
  out = out.replace(JWT_INLINE, REDACTED);
  out = out.replace(EMAIL_PATTERN, REDACTED);
  out = out.replace(PHONE_PATTERN, REDACTED);
  out = out.replace(CARD_PATTERN, REDACTED);
  return out;
}

export function scrubValue(value: unknown, depth = 0): unknown {
  if (depth > 8) return REDACTED;
  if (value == null) return value;
  if (typeof value === 'string') return scrubString(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.map((v) => scrubValue(v, depth + 1));
  if (typeof value === 'object') return scrubObject(value as Record<string, unknown>, depth + 1);
  return value;
}

export function scrubObject<T extends Record<string, unknown>>(obj: T, depth = 0): T {
  if (!obj || typeof obj !== 'object') return obj;
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (SENSITIVE_KEY.test(key)) {
      out[key] = REDACTED;
    } else {
      out[key] = scrubValue(val, depth);
    }
  }
  return out as T;
}

function scrubRequestHeaders(headers: Record<string, string> | undefined) {
  if (!headers) return headers;
  const next: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    next[k] = SENSITIVE_KEY.test(k) ? REDACTED : scrubString(String(v));
  }
  return next;
}

export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb | null {
  const next: Breadcrumb = { ...breadcrumb };
  if (next.message) next.message = scrubString(next.message);
  if (next.data) next.data = scrubObject({ ...next.data }) as Breadcrumb['data'];

  if (next.category === 'http' || next.category === 'fetch' || next.category === 'xhr') {
    const data = { ...(next.data || {}) } as Record<string, unknown>;
    if (typeof data.url === 'string') {
      try {
        const u = new URL(data.url, 'https://palsafar.local');
        u.search = '';
        data.url = `${u.pathname}`;
      } catch {
        data.url = scrubString(String(data.url));
      }
    }
    if (data.headers) data.headers = scrubRequestHeaders(data.headers as Record<string, string>);
    if (data.request_body) data.request_body = scrubValue(data.request_body);
    if (data.response_body) data.response_body = scrubValue(data.response_body);
    next.data = data;
  }
  return next;
}

export function scrubEvent(event: SentryErrorEvent): SentryErrorEvent | null {
  const next: SentryErrorEvent = { ...event };

  if (next.request) {
    const req = { ...next.request };
    if (req.headers) {
      req.headers = scrubRequestHeaders(req.headers as Record<string, string>) as typeof req.headers;
    }
    if (req.cookies) {
      req.cookies = undefined;
    }
    if (req.data) {
      req.data = scrubValue(req.data) as typeof req.data;
    }
    if (typeof req.query_string === 'string') {
      req.query_string = scrubString(req.query_string);
    }
    next.request = req;
  }

  if (next.user) {
    next.user = {
      id: next.user.id,
      ip_address: undefined,
    };
  }

  if (next.breadcrumbs) {
    next.breadcrumbs = next.breadcrumbs
      .map((b) => scrubBreadcrumb(b))
      .filter((b): b is Breadcrumb => b != null);
  }

  if (next.contexts) {
    const ctx: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(next.contexts)) {
      ctx[k] = typeof v === 'object' && v != null ? scrubObject(v as Record<string, unknown>) : v;
    }
    next.contexts = ctx as SentryErrorEvent['contexts'];
  }

  if (next.extra) {
    next.extra = scrubObject({ ...next.extra }) as SentryErrorEvent['extra'];
  }

  if (next.exception?.values) {
    next.exception.values = next.exception.values.map((ex) => ({
      ...ex,
      value: ex.value ? scrubString(ex.value) : ex.value,
    }));
  }

  return next;
}
