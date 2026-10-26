import { API_URL } from "./constants";
import type { APIResponse } from "@/types/api";

export class HttpError extends Error {
  status: number;
  errors?: Record<string, string[]>;
  constructor(
    message: string,
    status: number,
    errors?: Record<string, string[]>
  ) {
    super(message);
    this.status = status;
    this.errors = errors;
  }
}

// `.`/`..` path segments, plain or percent-encoded, with `/` or `\` separators
// (the URL parser normalizes all of them).
const DOT_SEGMENT = /(^|[/\\])(\.|%2e){1,2}([/\\]|$)/i;

export async function apiFetch<T = unknown>(
  path: string,
  init: RequestInit = {}
): Promise<APIResponse<T>> {
  // Callers (e.g. useCustom) often pass `${API_URL}/...`; with a relative
  // API_URL ("/api/v1") that must not be prefixed a second time.
  const url = path.startsWith("http") || path.startsWith(`${API_URL}/`)
    ? path
    : `${API_URL}${path.startsWith("/") ? "" : "/"}${path}`;

  // IDs from routes/localStorage are interpolated raw into paths; refuse dot
  // segments so a crafted id can't retarget the request to another endpoint.
  if (DOT_SEGMENT.test(url.split(/[?#]/, 1)[0])) {
    throw new HttpError("Invalid request path", 400);
  }

  // Spread init first so caller headers merge with (not replace) the defaults.
  const res = await fetch(url, {
    credentials: "include",
    ...init,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init.headers ?? {}),
    },
  });

  let body: APIResponse<T> | null = null;
  const text = await res.text();
  if (text) {
    try {
      body = JSON.parse(text) as APIResponse<T>;
    } catch {
      body = null;
    }
  }

  if (!res.ok) {
    throw new HttpError(
      body?.message ?? `Request failed with status ${res.status}`,
      res.status,
      body?.errors
    );
  }

  return body ?? {};
}
