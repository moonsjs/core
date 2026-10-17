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
  "trailingSlash",
  "requestTimeoutMs",
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
 * Batas waktu respons transport (Addendum R; review G1). Handler yang
 * melewati batas ini dijawab 504 `E_REQUEST_TIMEOUT` oleh transport;
 * `0` menonaktifkan.
 */
export const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

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
    fail(null, "config must be an object", "The default export of moons.config.ts must be a config object.", [
      "Make sure the default export is an object, not another value",
    ]);
  }

  const config = raw as Record<string, unknown>;

  for (const key of Object.keys(config)) {
    if (!ROOT_KEYS.includes(key as (typeof ROOT_KEYS)[number])) {
      fail(
        key,
        `unknown key \`${key}\``,
        `Valid keys: ${ROOT_KEYS.join(", ")}.`,
        [`Remove key \`${key}\`, or fix its spelling`],
      );
    }
  }

  if (typeof config["context"] !== "function") {
    fail(
      "context",
      "`context` is missing or not a function",
      "`context` must be a function `(req) => Ctx`.",
      ["Add `context: async (req) => ({ ... })` to moons.config.ts"],
    );
  }

  const routesDir = config["routesDir"] ?? DEFAULT_ROUTES_DIR;
  if (typeof routesDir !== "string" || routesDir.length === 0) {
    fail("routesDir", "`routesDir` must be a non-empty string", "Default: \"src/routes\".", [
      "Remove `routesDir` to use the default, or set it to the routes directory path",
    ]);
  }

  if (
    options.projectRoot !== undefined &&
    !existsSync(resolve(options.projectRoot, routesDir))
  ) {
    fail(
      "routesDir",
      `routes directory \`${routesDir}\` not found`,
      `No \`${routesDir}\` directory at ${options.projectRoot}.`,
      ["Create that directory with at least one route file", "Or change `routesDir`"],
    );
  }

  const apiDir = config["apiDir"] ?? DEFAULT_API_DIR;
  if (typeof apiDir !== "string" || apiDir.length === 0) {
    fail("apiDir", "`apiDir` must be a non-empty string", "Default: \"src/api\".", [
      "Remove `apiDir` to use the default, or set it to the API directory path",
    ]);
  }

  const middleware = config["middleware"] ?? [];
  if (!Array.isArray(middleware) || middleware.some((mw) => typeof mw !== "function")) {
    fail("middleware", "`middleware` must be an array of functions", "Each middleware item is a `Middleware` function.", [
      "Fix the `middleware` array, or remove the key",
    ]);
  }

  const plugins = config["plugins"] ?? [];
  if (
    !Array.isArray(plugins) ||
    plugins.some(
      (plugin) => typeof plugin !== "object" || plugin === null || typeof (plugin as MoonsPlugin).name !== "string",
    )
  ) {
    fail("plugins", "`plugins` must be an array of plugins with a string `name` property", "Plugin shape follows ", [
      "Fix the `plugins` array, or remove the key",
    ]);
  }

  // §14.4: "Lebih dari itu = ditolak" — key plugin di luar kontrak menggagalkan config.
  for (const plugin of plugins as MoonsPlugin[]) {
    for (const key of Object.keys(plugin)) {
      if (!PLUGIN_KEYS.includes(key as (typeof PLUGIN_KEYS)[number])) {
        fail(
          "plugins",
          `plugin \`${plugin.name}\` uses unknown key \`${key}\``,
          `Valid plugin keys: ${PLUGIN_KEYS.join(", ")}.`,
          [`Remove key \`${key}\` from plugin \`${plugin.name}\``],
        );
      }
      const value = (plugin as unknown as Record<string, unknown>)[key];
      if (key !== "name" && value !== undefined && typeof value !== "function") {
        fail(
          "plugins",
          `hook \`${key}\` on plugin \`${plugin.name}\` must be a function`,
          "Plugin hooks follow the shape ",
          [`Fix the \`${key}\` shape, or remove it`],
        );
      }
    }
  }

  const security = validateSecurity(config["security"], fail);
  const context = config["context"] as MoonsConfig["context"];

  // Addendum H: headers / redirects / sitemap / robots / hooks.
  const headers = config["headers"] ?? {};
  if (typeof headers !== "object" || headers === null || Array.isArray(headers)) {
    fail("headers", "`headers` must be an object of name→value", "Example: { \"x-frame-options\": \"DENY\" }.", [
      "Fix the `headers` shape, or remove the key",
    ]);
  }
  for (const [name, value] of Object.entries(headers as Record<string, unknown>)) {
    if (typeof value !== "string" || name.trim().length === 0) {
      fail("headers", `header \`${name}\` must be a string`, "Header names and values must not be empty.", [
        "Fix that header value, or remove it",
      ]);
    }
  }

  const redirects = config["redirects"] ?? [];
  if (!Array.isArray(redirects)) {
    fail("redirects", "`redirects` must be an array", "Each item: { from, to, status? }.", [
      "Fix the `redirects` shape, or remove the key",
    ]);
  }
  for (const item of redirects as unknown[]) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      fail("redirects", "each `redirects` item must be an object { from, to }", "Status is optional: 301/302/307/308.", [
        "Fix that item, or remove it",
      ]);
    }
    const record = item as Record<string, unknown>;
    if (typeof record["from"] !== "string" || !record["from"].startsWith("/")) {
      fail("redirects", "`from` must be a path starting with `/`", "Example: from: \"/old\".", [
        "Fix the `from` value",
      ]);
    }
    if (typeof record["to"] !== "string" || record["to"].length === 0) {
      fail("redirects", "`to` must be a non-empty destination string", "Example: to: \"/new\" or a full URL.", [
        "Fix the `to` value",
      ]);
    }
    const status = record["status"];
    if (status !== undefined && status !== 301 && status !== 302 && status !== 307 && status !== 308) {
      fail("redirects", "`status` must be 301, 302, 307, or 308", "Defaults to 301.", [
        "Fix the `status` value, or remove it (defaults to 301)",
      ]);
    }
  }

  const sitemap = config["sitemap"];
  if (sitemap !== undefined) {
    if (typeof sitemap !== "object" || sitemap === null || Array.isArray(sitemap)) {
      fail("sitemap", "`sitemap` must be an object { site, exclude? }", "Used during static build.", [
        "Fix the `sitemap` shape, or remove the key",
      ]);
    }
    const record = sitemap as Record<string, unknown>;
    for (const key of Object.keys(record)) {
      if (key !== "site" && key !== "exclude") {
        fail("sitemap", `unknown key \`${key}\` in \`sitemap\``, "Valid keys: site, exclude.", [
          `Remove key \`${key}\``,
        ]);
      }
    }
    if (typeof record["site"] !== "string" || !/^https?:\/\//.test(record["site"])) {
      fail("sitemap", "`sitemap.site` must be an http(s) URL", "Example: site: \"https://example.com\".", [
        "Fix the `site` value",
      ]);
    }
    const exclude = record["exclude"];
    if (exclude !== undefined && (!Array.isArray(exclude) || exclude.some((x) => typeof x !== "string"))) {
      fail("sitemap", "`sitemap.exclude` must be an array of strings", "Fill it with path prefixes, e.g. [\"/404\"].", [
        "Fix the `exclude` value, or remove it",
      ]);
    }
  }

  const robots = config["robots"];
  if (robots !== undefined) {
    if (typeof robots !== "object" || robots === null || Array.isArray(robots)) {
      fail("robots", "`robots` must be an object { sitemap?, disallow? }", "Used during static build.", [
        "Fix the `robots` shape, or remove the key",
      ]);
    }
    const record = robots as Record<string, unknown>;
    for (const key of Object.keys(record)) {
      if (key !== "sitemap" && key !== "disallow") {
        fail("robots", `unknown key \`${key}\` in \`robots\``, "Valid keys: sitemap, disallow.", [
          `Remove key \`${key}\``,
        ]);
      }
    }
    if (record["sitemap"] !== undefined && typeof record["sitemap"] !== "boolean") {
      fail("robots", "`robots.sitemap` must be a boolean", "Defaults to true when sitemap is configured.", [
        "Fix the `sitemap` value, or remove it",
      ]);
    }
    const disallow = record["disallow"];
    if (disallow !== undefined && (!Array.isArray(disallow) || disallow.some((x) => typeof x !== "string"))) {
      fail("robots", "`robots.disallow` must be an array of strings", "Fill it with path prefixes, e.g. [\"/internal\"].", [
        "Fix the `disallow` value, or remove it",
      ]);
    }
  }

  const hooks = config["hooks"];
  if (hooks !== undefined) {
    if (typeof hooks !== "object" || hooks === null || Array.isArray(hooks)) {
      fail("hooks", "`hooks` must be an object { onRequest?, onResponse?, onError? }", "All hooks receive a Request.", [
        "Fix the `hooks` shape, or remove the key",
      ]);
    }
    for (const [name, value] of Object.entries(hooks as Record<string, unknown>)) {
      if (name !== "onRequest" && name !== "onResponse" && name !== "onError") {
        fail("hooks", `unknown hook \`${name}\``, "Valid hooks: onRequest, onResponse, onError.", [
          `Remove hook \`${name}\``,
        ]);
      }
      if (typeof value !== "function") {
        fail("hooks", `hook \`${name}\` must be a function`, "Example: onResponse: async (res, req) => { ... }.", [
          `Fix hook \`${name}\`, or remove it`,
        ]);
      }
    }
  }

  const trailingSlash = config["trailingSlash"];
  if (trailingSlash !== undefined && trailingSlash !== "never" && trailingSlash !== "always") {
    fail(
      "trailingSlash",
      '`trailingSlash` must be "never" or "always"',
      "Addendum M: page URL policy (308 redirect).",
      ['Use `trailingSlash: "never"` or `"always"`, or remove the key'],
    );
  }

  const requestTimeoutMs = config["requestTimeoutMs"];
  if (
    requestTimeoutMs !== undefined &&
    (typeof requestTimeoutMs !== "number" ||
      !Number.isFinite(requestTimeoutMs) ||
      !Number.isInteger(requestTimeoutMs) ||
      requestTimeoutMs < 0)
  ) {
    fail(
      "requestTimeoutMs",
      "`requestTimeoutMs` must be a non-negative integer (milliseconds)",
      "Addendum R: 0 disables the response timeout; default 30000.",
      ["Use an integer >= 0 (for example 30000), or remove the key"],
    );
  }

  const logging = config["logging"];
  if (logging !== undefined) {
    if (typeof logging !== "object" || logging === null || Array.isArray(logging)) {
      fail("logging", "`logging` must be an object { accessLog?, json?, redact? }", "Addendum L.3.", [
        "Fix the `logging` shape, or remove the key",
      ]);
    }
    const loggingRecord = logging as Record<string, unknown>;
    for (const key of Object.keys(loggingRecord)) {
      if (key !== "accessLog" && key !== "json" && key !== "redact") {
        fail("logging", `unknown key \`${key}\` in \`logging\``, "Valid keys: accessLog, json, redact.", [
          `Remove key \`${key}\``,
        ]);
      }
    }
    for (const key of ["accessLog", "json"] as const) {
      const value = loggingRecord[key];
      if (value !== undefined && typeof value !== "boolean") {
        fail(`logging.${key}`, `\`logging.${key}\` must be a boolean`, "Addendum L.3.", [`Fix the \`${key}\` value`]);
      }
    }
    const redact = loggingRecord["redact"];
    if (
      redact !== undefined &&
      (!Array.isArray(redact) || redact.some((name) => typeof name !== "string" || name.length === 0))
    ) {
      fail("logging.redact", "`logging.redact` must be an array of query-param names (non-empty strings)", "Addendum L.3.", [
        "Fix the `redact` contents, or remove the key",
      ]);
    }
  }

  const isr = config["isr"];
  if (isr !== undefined) {
    if (typeof isr !== "object" || isr === null || Array.isArray(isr)) {
      fail("isr", "`isr` must be an object { storage? }", "Used by ISR/`revalidate` (Addendum I).", [
        "Fix the `isr` shape, or remove the key",
      ]);
    }
    for (const key of Object.keys(isr as Record<string, unknown>)) {
      if (key !== "storage") {
        fail("isr", `unknown key \`${key}\` in \`isr\``, "Valid keys: storage.", [
          `Remove key \`${key}\``,
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
        "`isr.storage` must be an object with `read` and `write` methods",
        "The shape follows `PrerenderStorage` (Addendum I).",
        ["Use `createFileStorage()` from `@moonsjs/vite/server`, or implement your own"],
      );
    }
  }

  return {
    routesDir,
    apiDir,
    context,
    middleware: middleware as Middleware[],
    security,
    requestTimeoutMs: requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
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
    ...(trailingSlash === undefined
      ? {}
      : { trailingSlash: trailingSlash as "never" | "always" }),
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
    fail("security", "`security` must be an object", "See the shape at ", [
      "Fix the `security` contents, or remove the key",
    ]);
  }

  const security = raw as Record<string, unknown>;

  for (const key of Object.keys(security)) {
    if (!SECURITY_KEYS.includes(key as (typeof SECURITY_KEYS)[number])) {
      fail(
        key,
        `unknown key \`${key}\` in \`security\``,
        `Valid keys: ${SECURITY_KEYS.join(", ")}.`,
        [`Remove key \`${key}\`, or fix its spelling`],
      );
    }
  }

  const originWhitelist = security["originWhitelist"];
  if (
    originWhitelist !== undefined &&
    (!Array.isArray(originWhitelist) || originWhitelist.some((origin) => typeof origin !== "string"))
  ) {
    fail("originWhitelist", "`originWhitelist` must be an array of strings", "Each item is a full origin.", [
      "Fix the `originWhitelist` contents, or remove the key",
    ]);
  }

  const bodyLimitBytes = security["bodyLimitBytes"];
  if (
    bodyLimitBytes !== undefined &&
    (typeof bodyLimitBytes !== "number" || !Number.isFinite(bodyLimitBytes) || bodyLimitBytes <= 0)
  ) {
    fail("bodyLimitBytes", "`bodyLimitBytes` must be a positive number", "Default: 1_000_000 bytes.", [
      "Fix the `bodyLimitBytes` value, or remove the key",
    ]);
  }

  const trustProxy = security["trustProxy"];
  if (trustProxy !== undefined && typeof trustProxy !== "boolean") {
    fail(
      "trustProxy",
      "`security.trustProxy` must be a boolean",
      "Enable only when all traffic goes through a reverse proxy that overwrites `x-forwarded-*` (Addendum J.1).",
      ["Set `trustProxy: true`, `false`, or remove the key"],
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
      "`security.serverOnlyPackages` must be an array of package names (non-empty strings)",
      "The server-only package gate matches resolved npm package names.",
      ["Fill it with npm package names, e.g. [\"pg\", \"drizzle-orm\"], or remove the key"],
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
