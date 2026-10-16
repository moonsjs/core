/** Tipe publik `@moonsjs/core` sesuai PRD §6.1 dan §6.2. */

export interface MoonsSecurityConfig {
  originWhitelist?: string[];
  bodyLimitBytes?: number;
  /**
   * Addendum J.1: percayai `x-forwarded-proto`/`x-forwarded-host` dari reverse
   * proxy di depan server (default `false`). Hanya aktifkan bila SEMUA trafik
   * memang lewat proxy yang menimpanya — tanpa itu header bisa dipalsukan.
   */
  trustProxy?: boolean;
  /**
   * Tambahan paket server-only untuk gate build (PRD Addendum C) — digabung
   * dengan daftar bawaan; default `[]`. Entri bawaan tidak dapat dihapus.
   */
  serverOnlyPackages?: string[];
}

export interface MiddlewareArgs {
  req: Request;
  ctx: Ctx;
  next: () => Promise<Response>;
}

export type Middleware = (args: MiddlewareArgs) => Promise<Response>;

export interface RouteDefinition {
  /** "/users/:id" (bentuk PRD §6.1). Catch-all direpresentasikan sebagai "*". */
  path: string;
  /** Absolute posix path. */
  file: string;
  kind: "page" | "layout" | "error" | "404" | "middleware";
  /** Nama param berurutan, termasuk param catch-all di akhir. */
  params: string[];
}

export interface App {
  readonly ready: boolean;
  readonly version: string;
}

export interface MoonsPlugin {
  name: string;
  addRoute?: (route: RouteDefinition) => void;
  addMiddleware?: (mw: Middleware) => void;
  extendContext?: <T>(fn: (ctx: Ctx) => T) => void;
  onStart?: (app: App) => void | Promise<void>;
  onReady?: (app: App) => void | Promise<void>;
  onShutdown?: (app: App) => void | Promise<void>;
}

/**
 * Addendum H: header HTTP statis — dipasang ke semua respons (runtime) dan
 * ditulis ke `_headers` saat build statis.
 */
export type MoonsHeaders = Record<string, string>;

/** Addendum H: redirect — berlaku runtime dan ditulis ke `_redirects`. */
export interface MoonsRedirect {
  /** Path sumber, diawali `/` (mis. "/lama"). */
  from: string;
  /** Tujuan (`/path` atau URL http(s)). */
  to: string;
  /** Default 301. */
  status?: 301 | 302 | 307 | 308;
}

/** Addendum H: `sitemap.xml` saat build (hanya path ter-prerender). */
export interface MoonsSitemapConfig {
  /** Origin situs, mis. "https://example.com" (tanpa slash akhir). */
  site: string;
  /** Prefix path yang dikecualikan. */
  exclude?: string[];
}

/** Addendum H: `robots.txt` saat build. */
export interface MoonsRobotsConfig {
  /** Tautkan `sitemap.xml` bila sitemap juga dikonfigurasi. Default true. */
  sitemap?: boolean;
  /** Daftar `Disallow:` untuk `User-agent: *`. */
  disallow?: string[];
}

/**
 * Addendum I: entri file prerender dari storage (ISR).
 * `mtimeMs` dipakai untuk kebijakan `revalidate`.
 */
export interface PrerenderStorageEntry {
  body: Uint8Array;
  mtimeMs: number;
}

/**
 * Addendum I: storage file prerender (baca + tulis). Default: file sistem
 * lokal; implementasi bersama (Redis/S3/DB) membuka ISR multi-instance.
 * `pathname` adalah path URL ternormalisasi (mis. "/blog/hello").
 */
export interface PrerenderStorage {
  read(pathname: string): Promise<PrerenderStorageEntry | null>;
  write(pathname: string, body: Uint8Array): Promise<void>;
}

/** Addendum I: konfigurasi ISR. */
export interface MoonsIsrConfig {
  /** Storage bersama untuk file prerender (opsional; default file lokal). */
  storage?: PrerenderStorage;
}

/** Addendum H: hook lifecycle request (runtime server). */
export interface MoonsHooks {
  /** Sebelum context/middleware; error di sini → 500. */
  onRequest?: (request: Request) => Promise<void> | void;
  /** Setelah respons jadi; boleh mengembalikan Response pengganti. */
  onResponse?: (
    response: Response,
    request: Request,
  ) => Promise<Response | void> | Response | void;
  /** Untuk error yang tidak tertangani pipeline (di luar 404/validasi). */
  onError?: (error: unknown, request: Request) => Promise<void> | void;
}

export interface MoonsConfig {
  /** Default: "src/routes". */
  routesDir: string;
  /** Direktori endpoint HTTP mentah (PRD Addendum D.1). Default: "src/api". */
  apiDir?: string;
  /**
   * Catatan: RFC §6.1 menulis `=> Promise<Ctx> | Ctx`, tetapi §13 menurunkan
   * global `Ctx` dari return type fungsi ini — memakai `Ctx` di sini membuat
   * referensi sirkular. Karena itu return type-nya `unknown`.
   */
  context: (req: Request) => Promise<unknown> | unknown;
  middleware?: Middleware[];
  security?: MoonsSecurityConfig;
  plugins?: MoonsPlugin[];
  /** Header HTTP statis (dipasang bila belum ada; ditulis ke `_headers`). */
  headers?: MoonsHeaders;
  /** Redirect runtime + `_redirects` saat build statis. */
  redirects?: MoonsRedirect[];
  /** `sitemap.xml` saat build (static export). */
  sitemap?: MoonsSitemapConfig;
  /** `robots.txt` saat build. */
  robots?: MoonsRobotsConfig;
  /** Hook lifecycle request. */
  hooks?: MoonsHooks;
  /** ISR: storage bersama untuk file prerender (Addendum I). */
  isr?: MoonsIsrConfig;
}

/** Method HTTP yang legal sebagai handler `src/api` (PRD Addendum D.1). */
export type ApiMethod = "GET" | "HEAD" | "POST" | "PUT" | "PATCH" | "DELETE" | "OPTIONS";

/** Definisi endpoint API hasil scan `src/api` (URL = `/ <prefix> / <rel>`). */
export interface ApiRouteDefinition {
  /** URL penuh, mis. "/api/webhooks/:provider". */
  path: string;
  /** Absolute posix path file. */
  file: string;
  /** Nama param berurutan (dynamic/catch-all). */
  params: string[];
}

/** Argumen handler `src/api` (PRD Addendum D.1). */
export interface ApiHandlerArgs {
  req: Request;
  params: Record<string, string>;
  ctx: Ctx;
}

export interface ResolvedRoute {
  route: RouteDefinition;
  /** Dari root ke leaf, tidak termasuk route. */
  layouts: RouteDefinition[];
  params: Record<string, string>;
}
