import { readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { MoonsError } from "./errors";
import type { ApiMethod, ApiRouteDefinition } from "./types";

type SegmentKind = "static" | "dynamic" | "catchall";

interface ParsedSegment {
  kind: SegmentKind;
  value: string;
  param: string | null;
}

function toPosix(path: string): string {
  return path.split("\\").join("/");
}

/**
 * Scan `src/api/**` (PRD Addendum D.1).
 * - Ekstensi `.ts` saja; `_*.ts` (mis. `_middleware.ts`) diabaikan di sini.
 * - Segmen: statis, `[param]`, `[...rest]` (wajib terakhir), `(group)` diabaikan.
 * - `index.ts` = direktori. URL = `/<basename(apiDir)>/<rel>`.
 * - Konflik path → `E_API_ROUTE_CONFLICT`.
 */
export function scanApiRoutes(apiDir: string, options: { prefix?: string } = {}): ApiRouteDefinition[] {
  const prefix = options.prefix ?? apiDir.split(/[\\/]/).filter((s) => s.length > 0).pop() ?? "api";
  const files = collectTsFiles(apiDir);
  const routes: ApiRouteDefinition[] = [];

  for (const file of files) {
    const relativePath = toPosix(relative(apiDir, file)).replace(/\.ts$/, "");
    const segments = relativePath.split("/");
    const fileName = segments.pop();
    if (fileName === undefined || fileName.startsWith("_")) {
      continue;
    }
    if (fileName.endsWith(".d")) {
      continue; // *.d.ts
    }

    const parsedDirSegments = segments.map(parseSegment).filter((s): s is ParsedSegment => s !== null);
    const parsedSegments =
      fileName === "index"
        ? parsedDirSegments
        : [...parsedDirSegments, parseSegment(fileName)].filter((s): s is ParsedSegment => s !== null);

    const path = toApiPath(prefix, parsedSegments);
    routes.push({
      path,
      file: toPosix(file),
      params: parsedSegments.filter((s) => s.param !== null).map((s) => s.param as string),
    });
  }

  assertNoApiConflicts(routes);
  routes.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return routes;
}

/** Resolve URL ke API route (precedence static > dynamic > catch-all). */
export function resolveApiRoute(
  url: string,
  routes: ReadonlyArray<ApiRouteDefinition>,
): { route: ApiRouteDefinition; params: Record<string, string> } | null {
  let pathname = url;
  try {
    pathname = new URL(url, "http://moons.local").pathname;
  } catch {
    // pakai apa adanya
  }
  if (pathname.length > 1 && pathname.endsWith("/")) {
    pathname = pathname.slice(0, -1);
  }
  const urlSegments = pathname.split("/").filter((segment) => segment.length > 0);

  let best: { route: ApiRouteDefinition; params: Record<string, string>; score: number } | null = null;

  for (const route of routes) {
    const pattern = route.path.split("/").filter((segment) => segment.length > 0);
    const match = matchSegments(pattern, urlSegments);
    if (match === null) {
      continue;
    }
    if (best === null || match.score > best.score) {
      best = { route, params: match.params, score: match.score };
    }
  }

  return best === null ? null : { route: best.route, params: best.params };
}

/** Definisi middleware direktori pohon `src/api` (Addendum D.3). */
export interface ApiMiddlewareDefinition {
  /** Absolute posix path file `_middleware.ts`. */
  file: string;
  /** Direktori tempat middleware berlaku (absolute posix). */
  dir: string;
}

/** Scan `_middleware.ts` di pohon `src/api`. */
export function scanApiMiddlewares(apiDir: string): ApiMiddlewareDefinition[] {
  const result: ApiMiddlewareDefinition[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && entry.name === "_middleware.ts") {
        result.push({ file: toPosix(full), dir: toPosix(dir) });
      }
    }
  };
  walk(apiDir);
  return result.sort((a, b) => a.dir.length - b.dir.length);
}

/** Middleware `src/api` untuk sebuah file API: root→leaf. */
export function findApiDirMiddlewares(
  apiFile: string,
  middlewares: ReadonlyArray<ApiMiddlewareDefinition>,
): ApiMiddlewareDefinition[] {
  const dir = toPosix(apiFile).split("/").slice(0, -1).join("/");
  const isAncestor = (ancestor: string, descendant: string): boolean =>
    ancestor === descendant || descendant.startsWith(`${ancestor}/`);
  return middlewares
    .filter((middleware) => isAncestor(middleware.dir, dir))
    .slice()
    .sort((a, b) => a.dir.length - b.dir.length);
}

export const API_METHODS: ReadonlyArray<ApiMethod> = [
  "GET",
  "HEAD",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "OPTIONS",
];

export function isApiMethod(value: string): value is ApiMethod {
  return (API_METHODS as ReadonlyArray<string>).includes(value);
}

function collectTsFiles(dir: string): string[] {
  const result: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      result.push(...collectTsFiles(full));
    } else if (entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) {
      result.push(full);
    }
  }
  return result.sort();
}

function parseSegment(raw: string): ParsedSegment | null {
  if (/^\(.+\)$/.test(raw)) {
    return null;
  }
  const catchall = /^\[\.\.\.([A-Za-z_][A-Za-z0-9_]*)\]$/.exec(raw);
  if (catchall !== null) {
    return { kind: "catchall", value: "*", param: catchall[1] as string };
  }
  const dynamic = /^\[([A-Za-z_][A-Za-z0-9_]*)\]$/.exec(raw);
  if (dynamic !== null) {
    return { kind: "dynamic", value: `:${dynamic[1]}`, param: dynamic[1] as string };
  }
  return { kind: "static", value: raw, param: null };
}

function toApiPath(prefix: string, segments: ParsedSegment[]): string {
  const parts = [prefix.replace(/^\/|\/$/g, ""), ...segments.map((s) => s.value)].filter(
    (part) => part.length > 0,
  );
  return `/${parts.join("/")}`;
}

function matchSegments(
  pattern: string[],
  urlSegments: string[],
): { params: Record<string, string>; score: number } | null {
  const params: Record<string, string> = {};
  let score = 0;

  for (let index = 0; index < pattern.length; index += 1) {
    const segment = pattern[index] as string;
    const urlSegment = urlSegments[index];

    if (segment === "*") {
      params["*"] = urlSegments
        .slice(index)
        .map((part) => safeDecode(part))
        .join("/");
      return { params, score: score - 100 };
    }
    if (urlSegment === undefined) {
      return null;
    }
    if (segment.startsWith(":")) {
      params[segment.slice(1)] = safeDecode(urlSegment);
      score += 1;
      continue;
    }
    if (segment !== urlSegment) {
      return null;
    }
    score += 10;
  }

  if (urlSegments.length !== pattern.length) {
    return null;
  }
  return { params, score };
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function assertNoApiConflicts(routes: ReadonlyArray<ApiRouteDefinition>): void {
  const seen = new Map<string, ApiRouteDefinition>();
  const conflictKey = (path: string): string =>
    path
      .split("/")
      .map((segment) => (segment.startsWith(":") ? ":" : segment))
      .join("/");
  for (const route of routes) {
    const key = conflictKey(route.path);
    const existing = seen.get(key);
    if (existing !== undefined) {
      throw new MoonsError({
        code: "E_API_ROUTE_CONFLICT",
        file: route.file,
        message: `two API files resolve to the same URL pattern (\`${route.path}\`)`,
        details: `Collides with \`${existing.file}\` — \`[id]\` and \`[uid]\` at the same position are a conflict.`,
        suggestions: [
          "Use the same dynamic segment name, or delete one of the files",
          "Make sure `[...rest]` is only used as the final segment",
        ],
      });
    }
    seen.set(key, route);
  }
}
