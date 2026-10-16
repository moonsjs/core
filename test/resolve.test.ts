import { expect, test } from "bun:test";
import { resolveRoute, scanRoutes } from "@moonsjs/core";
import { relative } from "node:path";
import { makeRoutesDir } from "./helpers";

function setup(files: string[]) {
  const dir = makeRoutesDir(files);
  return { dir, routes: scanRoutes(dir) };
}

test("static mengalahkan dynamic", () => {
  const { routes } = setup(["users/[id].tsx", "users/new.tsx", "users/index.tsx"]);

  const resolved = resolveRoute("/users/new", routes);
  expect(resolved?.route.path).toBe("/users/new");
  expect(resolved?.params).toEqual({});

  const dynamic = resolveRoute("/users/u1", routes);
  expect(dynamic?.route.path).toBe("/users/:id");
  expect(dynamic?.params).toEqual({ id: "u1" });

  const index = resolveRoute("/users", routes);
  expect(index?.route.path).toBe("/users");
});

test("static mengalahkan catch-all, catch-all butuh minimal satu segmen", () => {
  const { routes } = setup(["docs/index.tsx", "docs/intro.tsx", "docs/[...rest].tsx"]);

  expect(resolveRoute("/docs/intro", routes)?.route.path).toBe("/docs/intro");
  expect(resolveRoute("/docs", routes)?.route.path).toBe("/docs");
  expect(resolveRoute("/docs/a", routes)?.route.path).toBe("/docs/*");
  expect(resolveRoute("/docs/a/b/c", routes)?.params).toEqual({ rest: "a/b/c" });
});

test("tanpa route yang cocok → null", () => {
  const { routes } = setup(["index.tsx"]);
  expect(resolveRoute("/nope", routes)).toBeNull();
});

test("trailing slash dan query string dinormalisasi", () => {
  const { routes } = setup(["about.tsx", "users/[id].tsx"]);
  expect(resolveRoute("/about/", routes)?.route.path).toBe("/about");
  expect(resolveRoute("/users/u1?tab=x", routes)?.params).toEqual({ id: "u1" });
});

test("param URL di-decode", () => {
  const { routes } = setup(["users/[id].tsx"]);
  expect(resolveRoute("/users/u%201", routes)?.params).toEqual({ id: "u 1" });
});

test("layout chain dari root ke leaf, termasuk route group", () => {
  const { dir, routes } = setup([
    "_layout.tsx",
    "users/_layout.tsx",
    "users/[id].tsx",
    "about.tsx",
    "(admin)/_layout.tsx",
    "(admin)/dashboard.tsx",
  ]);

  const users = resolveRoute("/users/u1", routes);
  expect(users?.layouts.map((layout) => relative(dir, layout.file))).toEqual([
    "_layout.tsx",
    "users/_layout.tsx",
  ]);

  const about = resolveRoute("/about", routes);
  expect(about?.layouts.map((layout) => relative(dir, layout.file))).toEqual(["_layout.tsx"]);

  const dashboard = resolveRoute("/dashboard", routes);
  expect(dashboard?.layouts.map((layout) => relative(dir, layout.file))).toEqual([
    "_layout.tsx",
    "(admin)/_layout.tsx",
  ]);
});

test("D.3: findErrorBoundary — boundary terdekat menang, fallback root", () => {
  const { dir, routes } = setup([
    "_error.tsx",
    "admin/_error.tsx",
    "admin/index.tsx",
    "admin/deep/index.tsx",
    "other/index.tsx",
  ]);
  const toRel = (file: string) => relative(dir, file);

  const admin = resolveRoute("/admin", routes);
  const deep = resolveRoute("/admin/deep", routes);
  const other = resolveRoute("/other", routes);

  expect(admin).not.toBeNull();
  expect(deep).not.toBeNull();
  expect(other).not.toBeNull();

  const { findErrorBoundary } = require("@moonsjs/core") as typeof import("@moonsjs/core");
  expect(toRel(findErrorBoundary(admin!.route, routes)!.file)).toBe("admin/_error.tsx");
  expect(toRel(findErrorBoundary(deep!.route, routes)!.file)).toBe("admin/_error.tsx");
  expect(toRel(findErrorBoundary(other!.route, routes)!.file)).toBe("_error.tsx");
});

test("D.3: findDirMiddlewares — chain root→leaf hanya untuk subtree", () => {
  const { dir, routes } = setup([
    "_middleware.ts",
    "admin/_middleware.ts",
    "admin/index.tsx",
    "admin/deep/index.tsx",
    "other/index.tsx",
  ]);
  const toRel = (file: string) => relative(dir, file);
  const { findDirMiddlewares } = require("@moonsjs/core") as typeof import("@moonsjs/core");

  const admin = resolveRoute("/admin", routes)!;
  expect(findDirMiddlewares(admin.route, routes).map((route) => toRel(route.file))).toEqual([
    "_middleware.ts",
    "admin/_middleware.ts",
  ]);

  const other = resolveRoute("/other", routes)!;
  expect(findDirMiddlewares(other.route, routes).map((route) => toRel(route.file))).toEqual([
    "_middleware.ts",
  ]);
});
