/** Thin Frappe client: whitelisted methods + REST resources, session cookie auth, CSRF token from boot. */

let csrfToken = "";

export function setCsrfToken(token: string | undefined): void {
  csrfToken = token ?? "";
}

export class FrappeError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

type Params = Record<string, string | number | boolean | null | undefined | object>;

function serialize(params: Params): URLSearchParams {
  const out = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    out.set(k, typeof v === "object" ? JSON.stringify(v) : String(v));
  }
  return out;
}

function errorMessage(body: unknown, status: number): string {
  if (body && typeof body === "object") {
    const b = body as { _server_messages?: string; exception?: string; message?: string; exc_type?: string };
    if (b._server_messages) {
      try {
        const msgs = JSON.parse(b._server_messages) as string[];
        const first = msgs[0] ? (JSON.parse(msgs[0]) as { message?: string }).message : undefined;
        if (first) return first.replace(/<[^>]+>/g, "");
      } catch {
        /* fall through */
      }
    }
    if (b.exception) return b.exception.split(":").slice(1).join(":").trim() || b.exception;
    if (typeof b.message === "string") return b.message;
  }
  return status === 403 ? "Not permitted" : `Request failed (${status})`;
}

async function handle<T>(res: Response): Promise<T> {
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) throw new FrappeError(errorMessage(body, res.status), res.status);
  return body as T;
}

/** GET a whitelisted method. */
export async function get<T>(method: string, params: Params = {}): Promise<T> {
  const res = await fetch(`/api/method/${method}?${serialize(params).toString()}`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  return (await handle<{ message: T }>(res)).message;
}

/** Fresh CSRF token from the session (after a code reload, a new login in another tab, or a session rotation). */
async function refreshCsrf(): Promise<void> {
  const b = await get<{ csrf_token?: string }>("sugarcane.api.v1.spa.boot");
  csrfToken = b.csrf_token ?? "";
}

/** POST a whitelisted method. A missing or stale CSRF token is refreshed once and the call retried. */
export async function post<T>(method: string, params: Params = {}): Promise<T> {
  if (!csrfToken) await refreshCsrf().catch(() => undefined);
  const send = () => fetch(`/api/method/${method}`, {
    method: "POST",
    credentials: "include",
    headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded", "X-Frappe-CSRF-Token": csrfToken },
    body: serialize(params),
  });
  let res = await send();
  if (res.status === 400 || res.status === 403) {
    const body = (await res.clone().json().catch(() => null)) as { exc_type?: string } | null;
    if (body?.exc_type === "CSRFTokenError") {
      await refreshCsrf();
      res = await send();
    }
  }
  return (await handle<{ message: T }>(res)).message;
}

/** POST a method that answers with a file (PDF, Excel) and save it; errors come back as JSON and are thrown. */
export async function postDownload(method: string, params: Params = {}, fallbackName = "download"): Promise<void> {
  if (!csrfToken) await refreshCsrf().catch(() => undefined);
  const send = () => fetch(`/api/method/${method}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "X-Frappe-CSRF-Token": csrfToken },
    body: serialize(params),
  });
  let res = await send();
  if (res.status === 400 || res.status === 403) {
    const body = (await res.clone().json().catch(() => null)) as { exc_type?: string } | null;
    if (body?.exc_type === "CSRFTokenError") {
      await refreshCsrf();
      res = await send();
    }
  }
  const type = res.headers.get("Content-Type") ?? "";
  if (!res.ok || type.includes("application/json")) {
    const body: unknown = await res.json().catch(() => null);
    throw new FrappeError(errorMessage(body, res.status), res.status);
  }
  const name = /filename="?([^";]+)"?/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? fallbackName;
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = decodeURIComponent(name);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export type Filter = [string, string, string | number | (string | number)[] | null];

export interface ListArgs {
  fields: string[];
  filters?: Filter[] | Record<string, string | number>;
  orFilters?: Filter[];
  orderBy?: string;
  limit?: number;
  start?: number;
}

/** List rows of a doctype through frappe.client.get_list (respects permissions). */
export function getList<T>(doctype: string, args: ListArgs): Promise<T[]> {
  return post<T[]>("frappe.client.get_list", {
    doctype,
    fields: args.fields,
    filters: args.filters ?? [],
    or_filters: args.orFilters,
    order_by: args.orderBy,
    limit_page_length: args.limit ?? 50,
    limit_start: args.start ?? 0,
  });
}

export function getCount(doctype: string, filters: Filter[] = []): Promise<number> {
  return post<number>("frappe.client.get_count", { doctype, filters });
}

export async function login(usr: string, pwd: string): Promise<void> {
  const res = await fetch("/api/method/login", {
    method: "POST",
    credentials: "include",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ usr, pwd }),
  });
  await handle<unknown>(res);
}

export async function logout(): Promise<void> {
  await fetch("/api/method/logout", { method: "POST", credentials: "include", headers: { "X-Frappe-CSRF-Token": csrfToken } });
}
