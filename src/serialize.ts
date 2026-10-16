import { parse, stringify } from "devalue";

/** Payload SSR yang di-embed ke HTML dan dibaca ulang di client (PRD §8.2, §17, Addendum A.3). */
export interface SsrPayload {
  /** Key route gaya §13, mis. "/users/[id]". */
  key: string;
  params: Record<string, string>;
  /** Query string request (Addendum A.3) — nilai identik server & client. */
  searchParams?: Record<string, string>;
  /** Meta route hasil eksekusi `meta()` (Addendum B.1) — dipakai client untuk
   * memperbarui `<title>`/description pada navigasi client-side. */
  meta?: Record<string, unknown>;
  /** Data loader per file route; key = key route file (relatif routesDir tanpa ekstensi). */
  data: Record<string, unknown>;
  /** Error untuk halaman `_error` (dev saja; production tidak mengirim — §16.6). */
  error?: unknown;
}

const ESCAPES: Record<string, string> = {
  "<": "\\u003c",
  ">": "\\u003e",
  "&": "\\u0026",
  "\u2028": "\\u2028",
  "\u2029": "\\u2029",
};

/**
 * Serialize payload: devalue (§17) → string JSON → escape karakter yang
 * berbahaya di dalam `<script>`. Escape memakai escape sequence JSON, sehingga
 * `JSON.parse` di client mengembalikan string devalue secara utuh (tanpa
 * unescape manual — round-trip selalu aman).
 */
export function encodeSsrPayload(payload: SsrPayload): string {
  const inner = stringify(payload);
  return JSON.stringify(inner).replace(
    /[<>&\u2028\u2029]/g,
    (char) => ESCAPES[char] ?? char,
  );
}

export function decodeSsrPayload(text: string): SsrPayload {
  return parse(JSON.parse(text)) as SsrPayload;
}

/** Bentuk error yang aman di-devalue (devalue tidak mendukung instance `Error`). */
export interface SerializedError {
  __moons_error: true;
  name: string;
  message: string;
  stack?: string;
}

export function serializeError(error: unknown): SerializedError {
  if (error instanceof Error) {
    return {
      __moons_error: true,
      name: error.name,
      message: error.message,
      ...(error.stack === undefined ? {} : { stack: error.stack }),
    };
  }
  return {
    __moons_error: true,
    name: "Thrown",
    message: typeof error === "string" ? error : String(error),
  };
}

export function reviveError(data: SerializedError): Error {
  const error = new Error(data.message);
  error.name = data.name;
  if (data.stack !== undefined) {
    error.stack = data.stack;
  }
  return error;
}
