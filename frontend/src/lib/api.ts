/**
 * Typed API client. Same-origin requests to /api/v1 (proxied to FastAPI by Next rewrites).
 * - Sends the CSRF double-submit header on unsafe methods.
 * - On 401 tries a single silent refresh, then retries the request once.
 * - Normalises errors into ApiError with a human readable message.
 */
export class ApiError extends Error {
  status: number;
  errors?: { field: string; message: string }[];
  constructor(status: number, message: string, errors?: { field: string; message: string }[]) {
    super(message);
    this.status = status;
    this.errors = errors;
  }
}

const BASE = "/api/v1";

function csrf(): string | undefined {
  if (typeof document === "undefined") return undefined;
  const m = document.cookie.match(/(?:^|; )lifeos_csrf=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : undefined;
}

let refreshing: Promise<boolean> | null = null;
async function refresh(): Promise<boolean> {
  if (!refreshing) {
    refreshing = fetch(`${BASE}/auth/refresh`, { method: "POST", credentials: "same-origin" })
      .then((r) => r.ok)
      .catch(() => false)
      .finally(() => setTimeout(() => (refreshing = null), 0));
  }
  return refreshing;
}

type Opts = { method?: string; body?: unknown; form?: FormData; raw?: boolean; signal?: AbortSignal };

export async function api<T = unknown>(path: string, opts: Opts = {}, retried = false): Promise<T> {
  const method = opts.method || (opts.body !== undefined || opts.form ? "POST" : "GET");
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (method !== "GET") {
    const t = csrf();
    if (t) headers["X-CSRF-Token"] = t;
  }
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      credentials: "same-origin",
      body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
      signal: opts.signal,
    });
  } catch {
    throw new ApiError(0, "Нет соединения с сервером");
  }
  if (res.status === 401 && !retried && !path.startsWith("/auth/")) {
    if (await refresh()) return api<T>(path, opts, true);
    if (typeof window !== "undefined" && !location.pathname.startsWith("/login")) {
      location.href = `/login?next=${encodeURIComponent(location.pathname)}`;
    }
  }
  if (!res.ok) {
    let msg = res.statusText || "Ошибка";
    let errors;
    try {
      const j = await res.json();
      msg = typeof j.detail === "string" ? j.detail : msg;
      errors = j.errors;
      if (errors?.length) msg = `${msg}: ${errors.map((e: { field: string; message: string }) => `${e.field} — ${e.message}`).join("; ")}`;
    } catch {
      /* non-JSON error */
    }
    throw new ApiError(res.status, msg, errors);
  }
  if (opts.raw) return res as unknown as T;
  if (res.status === 204) return undefined as T;
  const ct = res.headers.get("content-type") || "";
  return (ct.includes("json") ? res.json() : res.text()) as Promise<T>;
}

export const get = <T,>(p: string) => api<T>(p);
export const post = <T,>(p: string, body?: unknown) => api<T>(p, { method: "POST", body: body ?? {} });
export const patch = <T,>(p: string, body: unknown) => api<T>(p, { method: "PATCH", body });
export const put = <T,>(p: string, body: unknown) => api<T>(p, { method: "PUT", body });
export const del = (p: string) => api<void>(p, { method: "DELETE" });

export async function download(path: string, filename: string) {
  const res = await api<Response>(path, { raw: true });
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function qs(params: Record<string, string | number | boolean | undefined | null>) {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") s.set(k, String(v));
  const str = s.toString();
  return str ? `?${str}` : "";
}
