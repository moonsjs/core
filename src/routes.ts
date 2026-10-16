import { readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { MoonsError } from "./errors";
import type { RouteDefinition } from "./types";

type SegmentKind = "static" | "dynamic" | "catchall";

interface ParsedSegment {
  kind: SegmentKind;
  /** Nilai segmen untuk URL: teks statis, ":name", atau "*". */
  value: string;
  /** Nama param (dynamic/catchall) atau null. */
  param: string | null;
  /** Segmen mentah (termasuk "[id]", "dll) untuk identitas direktori. */
  raw: string;
}

/**
 * Scan file route sesuai PRD §11.1 (Addendum D.3).
 * - `_layout.tsx` berlaku untuk direktorinya dan turunannya.
 * - `_error.tsx` boleh di direktori mana pun (boundary terdekat menang).
 * - `_404.tsx` hanya valid di root routesDir.
 * - `_middleware.ts` = middleware direktori (root→leaf).
 * - `(nama)` route group tidak muncul di URL.
 * - `[param]` dynamic, `[...rest]` catch-all (wajib segmen terakhir).
 * - File selain `*.tsx` (dan `_middleware.ts`) diabaikan.
 */
export function scanRoutes(routesDir: string): RouteDefinition[] {
  const files = collectRouteFiles(routesDir);
  const routes: RouteDefinition[] = [];

  for (const file of files) {
    const relativePath = toPosix(relative(routesDir, file));
    const segments = relativePath.split("/");
    const fileName = segments.pop();
    if (fileName === undefined) {
      continue;
    }

    // Addendum D.3: middleware direktori (root→leaf).
    if (fileName === "_middleware.ts") {
      const parsedDir = segments.map(parseSegment).filter((s): s is ParsedSegment => s !== null);
      routes.push({
        path: toRoutePath(parsedDir),
        file: toPosix(file),
        kind: "middleware",
        params: collectParams(parsedDir),
      });
      continue;
    }

    if (fileName === "_error.tsx" || fileName === "_404.tsx") {
      // D.3: `_error` boleh bersarang (boundary terdekat); `_404` tetap root.
      if (fileName === "_404.tsx" && segments.length > 0) {
        throw new MoonsError({
          code: "E_ROUTE_EXPORT_INVALID",
          file: toPosix(file),
          message: "`_404.tsx` hanya valid di root routesDir",
          details:
            "404 tidak punya konteks direktori; `_error.tsx` boleh bersarang (boundary terdekat), `_404` tidak.",
          suggestions: ["Pindahkan `_404.tsx` ke root routesDir", "Hapus file tersebut"],
        });
      }
      const parsedDir = segments.map(parseSegment).filter((s): s is ParsedSegment => s !== null);
      routes.push({
        path: toRoutePath(parsedDir),
        file: toPosix(file),
        kind: fileName === "_error.tsx" ? "error" : "404",
        params: [],
      });
      continue;
    }

    const parsedDirSegments = segments.map(parseSegment).filter((s) => s !== null);

    if (fileName === "_layout.tsx") {
      routes.push({
        path: toRoutePath(parsedDirSegments),
        file: toPosix(file),
        kind: "layout",
        params: collectParams(parsedDirSegments),
      });
      continue;
    }

    if (fileName.startsWith("_")) {
      // Catatan interpretasi: file `_*` yang tidak dikenal bukan route.
      continue;
    }

    if (!fileName.endsWith(".tsx")) {
      continue;
    }

    const baseName = fileName.slice(0, -".tsx".length);
    const parsedSegments =
      baseName === "index"
        ? parsedDirSegments
        : [...parsedDirSegments, parseSegment(baseName)].filter((s) => s !== null);

    routes.push({
      path: toRoutePath(parsedSegments),
      file: toPosix(file),
      kind: "page",
      params: collectParams(parsedSegments),
    });
  }

  assertNoConflicts(routes);
  routes.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return routes;
}

/** Key stabil route untuk manifest/payload client: path file relatif routesDir tanpa ekstensi. */
export function routeKeyFromFile(routesDir: string, file: string): string {
  return toPosix(relative(routesDir, file)).replace(/\.(tsx|ts)$/, "");
}

function collectRouteFiles(dir: string): string[] {
  const result: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      result.push(...collectRouteFiles(full));
    } else if (
      entry.isFile() &&
      (entry.name.endsWith(".tsx") || entry.name === "_middleware.ts")
    ) {
      result.push(full);
    }
  }
  return result.sort();
}

function parseSegment(raw: string): ParsedSegment | null {
  if (/^\(.+\)$/.test(raw)) {
    return null; // route group
  }
  if (/^\[\.\.\..+\]$/.test(raw)) {
    const param = raw.slice(4, -1);
    if (param.length === 0) {
      throw invalidSegment(raw, "nama param catch-all kosong");
    }
    return { kind: "catchall", value: "*", param, raw };
  }
  if (/^\[.+\]$/.test(raw)) {
    const param = raw.slice(1, -1);
    if (param.includes("[") || param.includes("]") || param.length === 0) {
      throw invalidSegment(raw, "nama param dynamic tidak valid");
    }
    return { kind: "dynamic", value: `:${param}`, param, raw };
  }
  if (raw.includes("[") || raw.includes("]")) {
    throw invalidSegment(raw, "segmen dynamic/catch-all harus menempati seluruh nama segmen");
  }
  return { kind: "static", value: raw, param: null, raw };
}

function invalidSegment(raw: string, reason: string): MoonsError {
  return new MoonsError({
    code: "E_ROUTE_EXPORT_INVALID",
    message: `segmen route \`${raw}\` tidak valid: ${reason}`,
    details: "Aturan penamaan segmen ada ",
    suggestions: [
      "Perbaiki nama file/direktori route",
      "Lihat tabel pemetaan file → route ",
    ],
  });
}

function toRoutePath(segments: ParsedSegment[]): string {
  if (segments.length === 0) {
    return "/";
  }
  for (let i = 0; i < segments.length; i += 1) {
    const segment = segments[i] as ParsedSegment;
    if (segment.kind === "catchall" && i !== segments.length - 1) {
      throw new MoonsError({
        code: "E_ROUTE_EXPORT_INVALID",
        message: "segmen catch-all `[...rest]` wajib menjadi segmen terakhir",
        details: "Catch-all menangkap sisa URL, sehingga tidak boleh diikuti segmen lain.",
        suggestions: [
          "Pindahkan catch-all ke akhir path",
          "Atau ganti menjadi dynamic segment `[param]`",
        ],
      });
    }
  }
  return `/${segments.map((segment) => segment.value).join("/")}`;
}

function collectParams(segments: ParsedSegment[]): string[] {
  return segments
    .map((segment) => segment.param)
    .filter((param): param is string => param !== null);
}

function conflictKey(route: RouteDefinition): string {
  return route.path
    .split("/")
    .map((segment) => {
      if (segment === "") return "";
      if (segment === "*") return "c";
      if (segment.startsWith(":")) return "d";
      return `s:${segment}`;
    })
    .join("/");
}

function conflictDisplay(route: RouteDefinition): string {
  return route.path
    .split("/")
    .map((segment) => {
      if (segment === "*") return "*";
      if (segment.startsWith(":")) return ":<dynamic>";
      return segment;
    })
    .join("/");
}

function assertNoConflicts(routes: RouteDefinition[]): void {
  const seen = new Map<string, RouteDefinition>();
  for (const route of routes) {
    if (route.kind !== "page") {
      continue;
    }
    const key = conflictKey(route);
    const previous = seen.get(key);
    if (previous !== undefined) {
      throw new MoonsError({
        code: "E_ROUTE_CONFLICT",
        message: `keduanya resolve ke ${conflictDisplay(route)}`,
        relatedFiles: [previous.file, route.file],
        details: "Tidak ada fallback untuk konflik route. Ubah salah satu menjadi static, atau gabungkan.",
        suggestions: [
          "Ganti salah satu dynamic segment menjadi static, atau",
          "Hapus salah satu file",
        ],
      });
    }
    seen.set(key, route);
  }
}

function toPosix(path: string): string {
  return sep === "/" ? path : path.split(sep).join("/");
}
