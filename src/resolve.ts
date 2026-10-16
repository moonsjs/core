import { dirname } from "node:path";
import type { ResolvedRoute, RouteDefinition } from "./types";

/**
 * Resolve URL ke route + layout chain sesuai PRD §6.2/§11.1.
 * Precedence: static > dynamic > catch-all, per segmen; route dengan segmen
 * lebih spesifik menang. Konflik sudah dicegah saat scan (E_ROUTE_CONFLICT).
 */
export function resolveRoute(url: string, routes: RouteDefinition[]): ResolvedRoute | null {
  const pathname = normalizePathname(url);
  const urlSegments = splitPath(pathname);
  const pages = routes.filter((route) => route.kind === "page");

  let best: { route: RouteDefinition; params: Record<string, string>; kinds: string[] } | null = null;

  for (const route of pages) {
    const match = matchRoute(route, urlSegments);
    if (match === null) {
      continue;
    }
    if (best === null || compareMatches(match.kinds, best.kinds) > 0) {
      best = { route, params: match.params, kinds: match.kinds };
    }
  }

  if (best === null) {
    return null;
  }

  return {
    route: best.route,
    layouts: findLayouts(best.route, routes),
    params: best.params,
  };
}

function normalizePathname(url: string): string {
  let pathname: string;
  try {
    pathname = new URL(url, "http://moons.local").pathname;
  } catch {
    pathname = url;
  }
  if (pathname.length > 1 && pathname.endsWith("/")) {
    pathname = pathname.slice(0, -1);
  }
  return pathname;
}

function splitPath(pathname: string): string[] {
  return pathname.split("/").filter((segment) => segment.length > 0);
}

function matchRoute(
  route: RouteDefinition,
  urlSegments: string[],
): { params: Record<string, string>; kinds: string[] } | null {
  const pattern = splitPath(route.path);
  const params: Record<string, string> = {};
  const kinds: string[] = [];

  let paramIndex = 0;
  for (let i = 0; i < pattern.length; i += 1) {
    const segment = pattern[i] as string;

    if (segment === "*") {
      const rest = urlSegments.slice(i);
      if (rest.length === 0) {
        return null;
      }
      const paramName = route.params[paramIndex];
      if (paramName !== undefined) {
        params[paramName] = rest.map(safeDecode).join("/");
      }
      kinds.push("c");
      return { params, kinds };
    }

    if (i >= urlSegments.length) {
      return null;
    }

    const urlSegment = urlSegments[i] as string;

    if (segment.startsWith(":")) {
      const paramName = route.params[paramIndex];
      if (paramName === undefined) {
        return null;
      }
      params[paramName] = safeDecode(urlSegment);
      kinds.push("d");
      paramIndex += 1;
      continue;
    }

    if (segment !== safeDecode(urlSegment)) {
      return null;
    }
    kinds.push(`s:${segment}`);
  }

  if (urlSegments.length !== pattern.length) {
    return null;
  }

  return { params, kinds };
}

function kindRank(kind: string): number {
  if (kind.startsWith("s:")) return 3;
  if (kind === "d") return 2;
  return 1;
}

function compareMatches(a: string[], b: string[]): number {
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i += 1) {
    const rankA = a[i] === undefined ? 0 : kindRank(a[i] as string);
    const rankB = b[i] === undefined ? 0 : kindRank(b[i] as string);
    if (rankA !== rankB) {
      return rankA - rankB;
    }
  }
  return 0;
}

/** Layout yang berlaku: direktori layout adalah ancestor (atau sama) dari file route. */
export function findLayouts(page: RouteDefinition, routes: RouteDefinition[]): RouteDefinition[] {
  const pageDir = dirname(page.file);
  return routes
    .filter((route) => route.kind === "layout" && isDirAncestor(dirname(route.file), pageDir))
    .sort((a, b) => dirname(a.file).length - dirname(b.file).length);
}

/**
 * Error boundary terdekat (Addendum D.3): `_error.tsx` di direktori page atau
 * ancestor terdekatnya (yang paling dalam menang); null bila tidak ada.
 */
export function findErrorBoundary(
  page: RouteDefinition,
  routes: RouteDefinition[],
): RouteDefinition | null {
  const pageDir = dirname(page.file);
  const candidates = routes.filter(
    (route) => route.kind === "error" && isDirAncestor(dirname(route.file), pageDir),
  );
  candidates.sort((a, b) => dirname(b.file).length - dirname(a.file).length);
  return candidates[0] ?? null;
}

/** Middleware direktori untuk sebuah route/file: root→leaf (Addendum D.3). */
export function findDirMiddlewares(
  route: Pick<RouteDefinition, "file">,
  routes: RouteDefinition[],
): RouteDefinition[] {
  const dir = dirname(route.file);
  return routes
    .filter((item) => item.kind === "middleware" && isDirAncestor(dirname(item.file), dir))
    .sort((a, b) => dirname(a.file).length - dirname(b.file).length);
}

function isDirAncestor(ancestor: string, descendant: string): boolean {
  return ancestor === descendant || descendant.startsWith(`${ancestor}/`);
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
