import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { MoonsError } from "./errors";
import type {
  Middleware,
  MoonsConfig,
  MoonsHeaders,
  MoonsHooks,
  MoonsIsrConfig,
  MoonsLoggingConfig,
  MoonsPlugin,
  MoonsRedirect,
  MoonsRobotsConfig,
  MoonsSecurityConfig,
  MoonsSitemapConfig,
  PrerenderStorage,
} from "./types";

const ROOT_KEYS = [
  "routesDir",
  "apiDir",
  "context",
  "middleware",
  "security",
  "plugins",
  "headers",
  "redirects",
  "sitemap",
  "robots",
  "hooks",
  "isr",
  "logging",
] as const;
const SECURITY_KEYS = ["originWhitelist", "bodyLimitBytes", "serverOnlyPackages", "trustProxy"] as const;
const PLUGIN_KEYS = [
  "name",
  "addRoute",
  "addMiddleware",
  "extendContext",
  "onStart",
  "onReady",
  "onShutdown",
] as const;

const DEFAULT_ROUTES_DIR = "src/routes";
const DEFAULT_API_DIR = "src/api";
/**
 * Batas body RPC default (byte). Dipakai juga transport `@moonsjs/vite` untuk
 * pratinjau awal `content-length` (Addendum J.2) — satu sumber kebenaran.
 */
export const DEFAULT_BODY_LIMIT_BYTES = 1_000_000;

/**
 * Identity helper yang **mempertahankan tipe literal** config pengguna.
 * Penting untuk typegen §13: `Ctx` dihitung dari `typeof config.context`,
 * sehingga return type `context` tidak boleh ter-widen menjadi `unknown`.
 */
export function defineConfig<T extends MoonsConfig>(config: T): T {
  return config;
}

export interface ValidateConfigOptions {
  /** Path file config, untuk pesan error (`file:line`). */
  file?: string;
  /** Jika diisi, `routesDir` diperiksa keberadaannya relatif root ini. */
  projectRoot?: string;
}

/**
 * Validasi config sesuai PRD §14.3. Melempar `E_CONFIG_INVALID` bila invalid
 * dan mengembalikan config yang sudah dinormalisasi (default diterapkan).
 */
export function validateConfig(raw: unknown, options: ValidateConfigOptions = {}): MoonsConfig {
  const file = options.file ?? "moons.config.ts";
  const rawText = readIfExists(file);

  function fail(
    key: string | null,
    message: string,
    details: string,
    suggestions: string[],
  ): never {
    throw new MoonsError({
      code: "E_CONFIG_INVALID",
      file,
      line: key === null ? 1 : findKeyLine(rawText, key),
      message,
      details,
      suggestions,
    });
  }

  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    fail(null, "konfigurasi harus berupa objek", "Export default moons.config.ts harus objek config.", [
      "Pastikan export default berisi objek, bukan nilai lain",
    ]);
  }

  const config = raw as Record<string, unknown>;

  for (const key of Object.keys(config)) {
    if (!ROOT_KEYS.includes(key as (typeof ROOT_KEYS)[number])) {
      fail(
        key,
        `key \`${key}\` tidak dikenal`,
        `Key yang valid: ${ROOT_KEYS.join(", ")}.`,
        [`Hapus key \`${key}\`, atau perbaiki ejaannya`],
      );
    }
  }

  if (typeof config["context"] !== "function") {
    fail(
      "context",
      "`context` tidak ada atau bukan fungsi",
      "`context` wajib berupa fungsi `(req) => Ctx`.",
      ["Tambahkan `context: async (req) => ({ ... })` di moons.config.ts"],
    );
  }

  const routesDir = config["routesDir"] ?? DEFAULT_ROUTES_DIR;
  if (typeof routesDir !== "string" || routesDir.length === 0) {
    fail("routesDir", "`routesDir` harus string non-kosong", "Default-nya \"src/routes\".", [
      "Hapus `routesDir` untuk memakai default, atau isi dengan path direktori route",
    ]);
  }

  if (
    options.projectRoot !== undefined &&
    !existsSync(resolve(options.projectRoot, routesDir))
  ) {
    fail(
      "routesDir",
      `direktori route \`${routesDir}\` tidak ditemukan`,
      `Tidak ada direktori \`${routesDir}\` di ${options.projectRoot}.`,
      ["Buat direktori tersebut dan isi minimal satu file route", "Atau ubah `routesDir`"],
    );
  }

  const apiDir = config["apiDir"] ?? DEFAULT_API_DIR;
  if (typeof apiDir !== "string" || apiDir.length === 0) {
    fail("apiDir", "`apiDir` harus string non-kosong", "Default-nya \"src/api\".", [
      "Hapus `apiDir` untuk memakai default, atau isi dengan path direktorinya",
    ]);
  }

  const middleware = config["middleware"] ?? [];
  if (!Array.isArray(middleware) || middleware.some((mw) => typeof mw !== "function")) {
    fail("middleware", "`middleware` harus array fungsi", "Setiap item middleware adalah fungsi `Middleware`.", [
      "Perbaiki isi array `middleware`, atau hapus key tersebut",
    ]);
  }

  const plugins = config["plugins"] ?? [];
  if (
    !Array.isArray(plugins) ||
    plugins.some(
      (plugin) => typeof plugin !== "object" || plugin === null || typeof (plugin as MoonsPlugin).name !== "string",
    )
  ) {
    fail("plugins", "`plugins` harus array plugin dengan properti `name` string", "Plugin mengikuti bentuk ", [
      "Perbaiki isi array `plugins`, atau hapus key tersebut",
    ]);
  }

  // §14.4: "Lebih dari itu = ditolak" — key plugin di luar kontrak menggagalkan config.
  for (const plugin of plugins as MoonsPlugin[]) {
    for (const key of Object.keys(plugin)) {
      if (!PLUGIN_KEYS.includes(key as (typeof PLUGIN_KEYS)[number])) {
        fail(
          "plugins",
          `plugin \`${plugin.name}\` memakai key \`${key}\` yang tidak dikenal`,
          `Key plugin yang valid: ${PLUGIN_KEYS.join(", ")}.`,
          [`Hapus key \`${key}\` dari plugin \`${plugin.name}\``],
        );
      }
      const value = (plugin as unknown as Record<string, unknown>)[key];
      if (key !== "name" && value !== undefined && typeof value !== "function") {
        fail(
          "plugins",
          `hook \`${key}\` pada plugin \`${plugin.name}\` harus fungsi`,
          "Hook plugin mengikuti bentuk ",
          [`Perbaiki bentuk \`${key}\`, atau hapus`],
        );
      }
    }
  }

  const security = validateSecurity(config["security"], fail);
  const context = config["context"] as MoonsConfig["context"];

  // Addendum H: headers / redirects / sitemap / robots / hooks.
  const headers = config["headers"] ?? {};
  if (typeof headers !== "object" || headers === null || Array.isArray(headers)) {
    fail("headers", "`headers` harus objek nama→nilai", "Contoh: { \"x-frame-options\": \"DENY\" }.", [
      "Perbaiki bentuk `headers`, atau hapus key tersebut",
    ]);
  }
  for (const [name, value] of Object.entries(headers as Record<string, unknown>)) {
    if (typeof value !== "string" || name.trim().length === 0) {
      fail("headers", `header \`${name}\` harus bernilai string`, "Nama dan nilai header tidak boleh kosong.", [
        "Perbaiki nilai header tersebut, atau hapus",
      ]);
    }
  }

  const redirects = config["redirects"] ?? [];
  if (!Array.isArray(redirects)) {
    fail("redirects", "`redirects` harus array", "Setiap item: { from, to, status? }.", [
      "Perbaiki bentuk `redirects`, atau hapus key tersebut",
    ]);
  }
  for (const item of redirects as unknown[]) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      fail("redirects", "item `redirects` harus objek { from, to }", "Status opsional: 301/302/307/308.", [
        "Perbaiki item tersebut, atau hapus",
      ]);
    }
    const record = item as Record<string, unknown>;
    if (typeof record["from"] !== "string" || !record["from"].startsWith("/")) {
      fail("redirects", "`from` harus path diawali `/`", "Contoh: from: \"/lama\".", [
        "Perbaiki nilai `from`",
      ]);
    }
    if (typeof record["to"] !== "string" || record["to"].length === 0) {
      fail("redirects", "`to` harus string tujuan non-kosong", "Contoh: to: \"/baru\" atau URL penuh.", [
        "Perbaiki nilai `to`",
      ]);
    }
    const status = record["status"];
    if (status !== undefined && status !== 301 && status !== 302 && status !== 307 && status !== 308) {
      fail("redirects", "`status` harus 301, 302, 307, atau 308", "Default 301.", [
        "Perbaiki nilai `status`, atau hapus (memakai 301)",
      ]);
    }
  }

  const sitemap = config["sitemap"];
  if (sitemap !== undefined) {
    if (typeof sitemap !== "object" || sitemap === null || Array.isArray(sitemap)) {
      fail("sitemap", "`sitemap` harus objek { site, exclude? }", "Dipakai saat build statis.", [
        "Perbaiki bentuk `sitemap`, atau hapus key tersebut",
      ]);
    }
    const record = sitemap as Record<string, unknown>;
    for (const key of Object.keys(record)) {
      if (key !== "site" && key !== "exclude") {
        fail("sitemap", `key \`${key}\` tidak dikenal di \`sitemap\``, "Key yang valid: site, exclude.", [
          `Hapus key \`${key}\``,
        ]);
      }
    }
    if (typeof record["site"] !== "string" || !/^https?:\/\//.test(record["site"])) {
      fail("sitemap", "`sitemap.site` harus URL http(s)", "Contoh: site: \"https://example.com\".", [
        "Perbaiki nilai `site`",
      ]);
    }
    const exclude = record["exclude"];
    if (exclude !== undefined && (!Array.isArray(exclude) || exclude.some((x) => typeof x !== "string"))) {
      fail("sitemap", "`sitemap.exclude` harus array string", "Isi dengan prefix path, mis. [\"/404\"].", [
        "Perbaiki nilai `exclude`, atau hapus",
      ]);
    }
  }

  const robots = config["robots"];
  if (robots !== undefined) {
    if (typeof robots !== "object" || robots === null || Array.isArray(robots)) {
      fail("robots", "`robots` harus objek { sitemap?, disallow? }", "Dipakai saat build statis.", [
        "Perbaiki bentuk `robots`, atau hapus key tersebut",
      ]);
    }
    const record = robots as Record<string, unknown>;
    for (const key of Object.keys(record)) {
      if (key !== "sitemap" && key !== "disallow") {
        fail("robots", `key \`${key}\` tidak dikenal di \`robots\``, "Key yang valid: sitemap, disallow.", [
          `Hapus key \`${key}\``,
        ]);
      }
    }
    if (record["sitemap"] !== undefined && typeof record["sitemap"] !== "boolean") {
      fail("robots", "`robots.sitemap` harus boolean", "Default true bila sitemap dikonfigurasi.", [
        "Perbaiki nilai `sitemap`, atau hapus",
      ]);
    }
    const disallow = record["disallow"];
    if (disallow !== undefined && (!Array.isArray(disallow) || disallow.some((x) => typeof x !== "string"))) {
      fail("robots", "`robots.disallow` harus array string", "Isi dengan prefix path, mis. [\"/internal\"].", [
        "Perbaiki nilai `disallow`, atau hapus",
      ]);
    }
  }

  const hooks = config["hooks"];
  if (hooks !== undefined) {
    if (typeof hooks !== "object" || hooks === null || Array.isArray(hooks)) {
      fail("hooks", "`hooks` harus objek { onRequest?, onResponse?, onError? }", "Semua hook menerima Request.", [
        "Perbaiki bentuk `hooks`, atau hapus key tersebut",
      ]);
    }
    for (const [name, value] of Object.entries(hooks as Record<string, unknown>)) {
      if (name !== "onRequest" && name !== "onResponse" && name !== "onError") {
        fail("hooks", `hook \`${name}\` tidak dikenal`, "Hook yang valid: onRequest, onResponse, onError.", [
          `Hapus hook \`${name}\``,
        ]);
      }
      if (typeof value !== "function") {
        fail("hooks", `hook \`${name}\` harus fungsi`, "Contoh: onResponse: async (res, req) => { ... }.", [
          `Perbaiki hook \`${name}\`, atau hapus`,
        ]);
      }
    }
  }

  const logging = config["logging"];
  if (logging !== undefined) {
    if (typeof logging !== "object" || logging === null || Array.isArray(logging)) {
      fail("logging", "`logging` harus objek { accessLog?, json?, redact? }", "Addendum L.3.", [
        "Perbaiki bentuk `logging`, atau hapus key tersebut",
      ]);
    }
    const loggingRecord = logging as Record<string, unknown>;
    for (const key of Object.keys(loggingRecord)) {
      if (key !== "accessLog" && key !== "json" && key !== "redact") {
        fail("logging", `key \`${key}\` tidak dikenal di \`logging\``, "Key yang valid: accessLog, json, redact.", [
          `Hapus key \`${key}\``,
        ]);
      }
    }
    for (const key of ["accessLog", "json"] as const) {
      const value = loggingRecord[key];
      if (value !== undefined && typeof value !== "boolean") {
        fail(`logging.${key}`, `\`logging.${key}\` harus boolean`, "Addendum L.3.", [`Perbaiki nilai \`${key}\``]);
      }
    }
    const redact = loggingRecord["redact"];
    if (
      redact !== undefined &&
      (!Array.isArray(redact) || redact.some((name) => typeof name !== "string" || name.length === 0))
    ) {
      fail("logging.redact", "`logging.redact` harus array nama query-param (string non-kosong)", "Addendum L.3.", [
        "Perbaiki isi `redact`, atau hapus key tersebut",
      ]);
    }
  }

  const isr = config["isr"];
  if (isr !== undefined) {
    if (typeof isr !== "object" || isr === null || Array.isArray(isr)) {
      fail("isr", "`isr` harus objek { storage? }", "Dipakai ISR/`revalidate` (Addendum I).", [
        "Perbaiki bentuk `isr`, atau hapus key tersebut",
      ]);
    }
    for (const key of Object.keys(isr as Record<string, unknown>)) {
      if (key !== "storage") {
        fail("isr", `key \`${key}\` tidak dikenal di \`isr\``, "Key yang valid: storage.", [
          `Hapus key \`${key}\``,
        ]);
      }
    }
    const storage = (isr as Record<string, unknown>)["storage"];
    if (
      storage !== undefined &&
      (typeof storage !== "object" ||
        storage === null ||
        typeof (storage as PrerenderStorage).read !== "function" ||
        typeof (storage as PrerenderStorage).write !== "function")
    ) {
      fail(
        "isr",
        "`isr.storage` harus objek dengan method `read` dan `write`",
        "Bentuk mengikuti `PrerenderStorage` (Addendum I).",
        ["Pakai `createFileStorage()` dari `@moonsjs/vite/server`, atau implementasi sendiri"],
      );
    }
  }

  return {
    routesDir,
    apiDir,
    context,
    middleware: middleware as Middleware[],
    security,
    plugins: plugins as MoonsPlugin[],
    ...(Object.keys(headers as Record<string, unknown>).length === 0
      ? {}
      : { headers: headers as MoonsHeaders }),
    ...((redirects as unknown[]).length === 0 ? {} : { redirects: redirects as MoonsRedirect[] }),
    ...(sitemap === undefined ? {} : { sitemap: sitemap as MoonsSitemapConfig }),
    ...(robots === undefined ? {} : { robots: robots as MoonsRobotsConfig }),
    ...(hooks === undefined ? {} : { hooks: hooks as MoonsHooks }),
    ...(isr === undefined ? {} : { isr: isr as MoonsIsrConfig }),
    ...(logging === undefined ? {} : { logging: logging as MoonsLoggingConfig }),
  };
}

function validateSecurity(
  raw: unknown,
  fail: (key: string | null, message: string, details: string, suggestions: string[]) => never,
): Required<MoonsSecurityConfig> {
  const defaults: Required<MoonsSecurityConfig> = {
    originWhitelist: [],
    bodyLimitBytes: DEFAULT_BODY_LIMIT_BYTES,
    serverOnlyPackages: [],
    trustProxy: false,
  };

  if (raw === undefined) {
    return defaults;
  }

  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    fail("security", "`security` harus objek", "Lihat bentuknya ", [
      "Perbaiki isi `security`, atau hapus key tersebut",
    ]);
  }

  const security = raw as Record<string, unknown>;

  for (const key of Object.keys(security)) {
    if (!SECURITY_KEYS.includes(key as (typeof SECURITY_KEYS)[number])) {
      fail(
        key,
        `key \`${key}\` tidak dikenal di \`security\``,
        `Key yang valid: ${SECURITY_KEYS.join(", ")}.`,
        [`Hapus key \`${key}\`, atau perbaiki ejaannya`],
      );
    }
  }

  const originWhitelist = security["originWhitelist"];
  if (
    originWhitelist !== undefined &&
    (!Array.isArray(originWhitelist) || originWhitelist.some((origin) => typeof origin !== "string"))
  ) {
    fail("originWhitelist", "`originWhitelist` harus array string", "Setiap item adalah origin lengkap.", [
      "Perbaiki isi `originWhitelist`, atau hapus key tersebut",
    ]);
  }

  const bodyLimitBytes = security["bodyLimitBytes"];
  if (
    bodyLimitBytes !== undefined &&
    (typeof bodyLimitBytes !== "number" || !Number.isFinite(bodyLimitBytes) || bodyLimitBytes <= 0)
  ) {
    fail("bodyLimitBytes", "`bodyLimitBytes` harus number positif", "Default: 1_000_000 byte.", [
      "Perbaiki nilai `bodyLimitBytes`, atau hapus key tersebut",
    ]);
  }

  const trustProxy = security["trustProxy"];
  if (trustProxy !== undefined && typeof trustProxy !== "boolean") {
    fail(
      "trustProxy",
      "`security.trustProxy` harus boolean",
      "Aktifkan hanya bila seluruh trafik lewat reverse proxy yang menimpa `x-forwarded-*` (Addendum J.1).",
      ["Set `trustProxy: true`, `false`, atau hapus key tersebut"],
    );
  }

  const serverOnlyPackages = security["serverOnlyPackages"];
  if (
    serverOnlyPackages !== undefined &&
    (!Array.isArray(serverOnlyPackages) ||
      serverOnlyPackages.some((name) => typeof name !== "string" || name.length === 0))
  ) {
    fail(
      "security",
      "`security.serverOnlyPackages` harus array nama paket (string non-kosong)",
      "Gate paket server-only mencocokkan nama paket npm hasil resolve.",
      ["Isi dengan nama paket npm, mis. [\"pg\", \"drizzle-orm\"], atau hapus key tersebut"],
    );
  }

  return {
    originWhitelist: (originWhitelist as string[] | undefined) ?? defaults.originWhitelist,
    bodyLimitBytes: (bodyLimitBytes as number | undefined) ?? defaults.bodyLimitBytes,
    serverOnlyPackages:
      (serverOnlyPackages as string[] | undefined) ?? defaults.serverOnlyPackages,
    trustProxy: (trustProxy as boolean | undefined) ?? defaults.trustProxy,
  };
}

function readIfExists(file: string): string {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

function findKeyLine(text: string, key: string): number {
  const index = text.indexOf(key);
  if (index === -1) {
    return 1;
  }
  return text.slice(0, index).split("\n").length;
}
