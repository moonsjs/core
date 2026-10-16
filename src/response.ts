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
    message: `\`${fn}()\` dipanggil di luar request`,
    details:
      "Helper respons hanya hidup di dalam request (loader, serverFn, endpoint API). " +
      "Saat build/prerender atau di komponen client tidak ada respons untuk diubah.",
    suggestions: [
      "Pindahkan pemanggilan ke loader atau handler `*.server.ts`",
      "Untuk nilai publik, gunakan `import.meta.env`",
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
      message: `nama header \`${name}\` tidak valid`,
      details: "Nama header harus token HTTP (tanpa spasi, `:`, atau karakter kontrol).",
      suggestions: ["Gunakan nama seperti `cache-control` atau `x-request-id`"],
    });
  }
  if (FORBIDDEN_HEADERS.has(name.toLowerCase())) {
    throw new MoonsError({
      code: "E_RESPONSE_HEADER_INVALID",
      message: `header \`${name}\` tidak boleh di-set dari helper`,
      details: "Header framing/hop-by-hop dikelola runtime; menimpanya merusak protokol.",
      suggestions: ["Hapus pemanggilan ini", "Gunakan header lain (mis. `cache-control`)"],
    });
  }
  if (/[\u0000-\u0008\u000A-\u001F\u007F]/.test(value) || value.includes("\r") || value.includes("\n")) {
    throw new MoonsError({
      code: "E_RESPONSE_HEADER_INVALID",
      message: `nilai header \`${name}\` memuat karakter kontrol`,
      details: "CRLF/karakter kontrol bisa dipakai untuk HTTP response splitting.",
      suggestions: ["Hapus baris baru dari nilai", "Encode nilai bila perlu"],
    });
  }
}

const COOKIE_NAME = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

function serializeCookie(name: string, value: string, options: CookieOptions | undefined): string {
  if (!COOKIE_NAME.test(name)) {
    throw new MoonsError({
      code: "E_RESPONSE_HEADER_INVALID",
      message: `nama cookie \`${name}\` tidak valid`,
      details: "Nama cookie harus token HTTP.",
      suggestions: ["Gunakan huruf/angka/`-`/`_` (mis. `session_id`)"],
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
        message: "`maxAge` cookie harus number >= 0 (detik)",
        details: "Max-Age mengikuti spesifikasi cookie (detik, bukan milidetik).",
        suggestions: ["Gunakan mis. `maxAge: 60 * 60 * 24` untuk sehari"],
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
      message: "nilai cookie memuat CRLF",
      details: "CRLF pada cookie dilarang.",
      suggestions: ["Hapus baris baru dari nilai cookie"],
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
