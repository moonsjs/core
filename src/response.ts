import { MoonsError } from "./errors";

/**
 * Helper respons request-scoped (PRD Addendum D.2) — **client-safe**.
 * Aman di-import dari route file (`@moonsjs/react` re-export): tanpa `node:*`.
 *
 * Kolektor per request di-*register* oleh runtime `@moonsjs/server`
 * (`runWithResponseCollector`); di luar request → `E_RESPONSE_OUTSIDE_REQUEST`.
 */

export interface CookieOptions {
  maxAge?: number;
  expires?: Date;
  path?: string;
  domain?: string;
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: "lax" | "strict" | "none";
}

export type ResponseMutation =
  | { kind: "header"; name: string; value: string; append: boolean }
  | { kind: "cookie"; value: string };

interface ResponseCollector {
  push(mutation: ResponseMutation): void;
}

type CollectorAccess = () => ResponseCollector | null;

const ACCESS_KEY = Symbol.for("moons.responseCollectorAccess");

/** Dipakai runtime (`@moonsjs/server`); bukan API publik. */
export function __moons_registerResponseCollectorAccess(access: CollectorAccess): void {
  (globalThis as Record<PropertyKey, unknown>)[ACCESS_KEY] = access;
}

function collector(): ResponseCollector | null {
  const access = (globalThis as Record<PropertyKey, unknown>)[ACCESS_KEY];
  if (typeof access !== "function") {
    return null;
  }
  return (access as CollectorAccess)();
}

function outsideRequest(fn: string): MoonsError {
  return new MoonsError({
    code: "E_RESPONSE_OUTSIDE_REQUEST",
    message: `\`${fn}()\` was called outside a request`,
    details:
      "Response helpers only live inside a request (loader, serverFn, API endpoint). " +
      "During build/prerender or in client components there is no response to mutate.",
    suggestions: [
      "Move the call into a loader or a `*.server.ts` handler",
      "For public values use `import.meta.env`",
    ],
  });
}

const HEADER_NAME = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
const FORBIDDEN_HEADERS = new Set([
  "content-length",
  "transfer-encoding",
  "connection",
  "keep-alive",
  "upgrade",
  "te",
  "trailer",
]);

function validateHeader(name: string, value: string): void {
  if (!HEADER_NAME.test(name)) {
    throw new MoonsError({
      code: "E_RESPONSE_HEADER_INVALID",
      message: `invalid header name \`${name}\``,
      details: "Header names must be HTTP tokens (no spaces, `:`, or control characters).",
      suggestions: ["Use a name like `cache-control` or `x-request-id`"],
    });
  }
  if (FORBIDDEN_HEADERS.has(name.toLowerCase())) {
    throw new MoonsError({
      code: "E_RESPONSE_HEADER_INVALID",
      message: `header \`${name}\` cannot be set from a helper`,
      details: "Framing/hop-by-hop headers are managed by the runtime; overriding them breaks the protocol.",
      suggestions: ["Remove this call", "Use another header (e.g. `cache-control`)"],
    });
  }
  if (/[\u0000-\u0008\u000A-\u001F\u007F]/.test(value) || value.includes("\r") || value.includes("\n")) {
    throw new MoonsError({
      code: "E_RESPONSE_HEADER_INVALID",
      message: `header \`${name}\` value contains control characters`,
      details: "CRLF/control characters can be used for HTTP response splitting.",
      suggestions: ["Remove newlines from the value", "Encode the value if needed"],
    });
  }
}

const COOKIE_NAME = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

function serializeCookie(name: string, value: string, options: CookieOptions | undefined): string {
  if (!COOKIE_NAME.test(name)) {
    throw new MoonsError({
      code: "E_RESPONSE_HEADER_INVALID",
      message: `invalid cookie name \`${name}\``,
      details: "Cookie names must be HTTP tokens.",
      suggestions: ["Use letters/digits/`-`/`_` (e.g. `session_id`)"],
    });
  }
  const parts = [`${name}=${encodeURIComponent(value)}`];
  const path = options?.path ?? "/";
  parts.push(`Path=${path}`);
  if (options?.domain !== undefined) {
    parts.push(`Domain=${options.domain}`);
  }
  if (options?.maxAge !== undefined) {
    if (!Number.isFinite(options.maxAge) || options.maxAge < 0) {
      throw new MoonsError({
        code: "E_RESPONSE_HEADER_INVALID",
        message: "cookie `maxAge` must be a number >= 0 (seconds)",
        details: "Max-Age follows the cookie spec (seconds, not milliseconds).",
        suggestions: ["Use e.g. `maxAge: 60 * 60 * 24` for one day"],
      });
    }
    parts.push(`Max-Age=${Math.floor(options.maxAge)}`);
  }
  if (options?.expires !== undefined) {
    parts.push(`Expires=${options.expires.toUTCString()}`);
  }
  if (options?.secure === true) {
    parts.push("Secure");
  }
  if (options?.httpOnly === true) {
    parts.push("HttpOnly");
  }
  if (options?.sameSite !== undefined) {
    const value = { lax: "Lax", strict: "Strict", none: "None" }[options.sameSite];
    parts.push(`SameSite=${value}`);
    if (options.sameSite === "none" && options.secure !== true) {
      // Bukan error: hanya catatan di docs. Browser modern menolak None tanpa Secure.
    }
  }
  const serialized = parts.join("; ");
  if (serialized.includes("\r") || serialized.includes("\n")) {
    throw new MoonsError({
      code: "E_RESPONSE_HEADER_INVALID",
      message: "cookie value contains CRLF",
      details: "CRLF in cookies is forbidden.",
      suggestions: ["Remove newlines from the cookie value"],
    });
  }
  return serialized;
}

/** Overwrite header respons (diterapkan setelah runtime menulis header dasar). */
export function setHeader(name: string, value: string): void {
  const active = collector();
  if (active === null) {
    throw outsideRequest("setHeader");
  }
  validateHeader(name, value);
  active.push({ kind: "header", name, value, append: false });
}

/** Tambahkan header respons (tidak menimpa nilai sebelumnya). */
export function appendHeader(name: string, value: string): void {
  const active = collector();
  if (active === null) {
    throw outsideRequest("appendHeader");
  }
  validateHeader(name, value);
  active.push({ kind: "header", name, value, append: true });
}

/** Set cookie (boleh dipanggil berkali-kali; tiap panggilan = satu `Set-Cookie`). */
export function setCookie(name: string, value: string, options?: CookieOptions): void {
  const active = collector();
  if (active === null) {
    throw outsideRequest("setCookie");
  }
  active.push({ kind: "cookie", value: serializeCookie(name, value, options) });
}

/** Hapus cookie (`Max-Age=0` + `Expires` epoch). */
export function deleteCookie(
  name: string,
  options?: Pick<CookieOptions, "path" | "domain">,
): void {
  const active = collector();
  if (active === null) {
    throw outsideRequest("deleteCookie");
  }
  active.push({
    kind: "cookie",
    value: serializeCookie(name, "", {
      ...options,
      maxAge: 0,
      expires: new Date(0),
    }),
  });
}
