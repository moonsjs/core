import { expect, test } from "bun:test";
import { relative } from "node:path";
import { routeKeyFromFile, scanRoutes } from "@moonsjs/core";
import { MoonsError } from "@moonsjs/core";
import { makeRoutesDir } from "./helpers";

function paths(dir: string, files: string[]): string[] {
  return files.map((file) => relative(dir, file));
}

test("memetakan file route sesuai PRD §11.1", () => {
  const dir = makeRoutesDir([
    "_layout.tsx",
    "index.tsx",
    "about.tsx",
    "users/_layout.tsx",
    "users/index.tsx",
    "users/[id].tsx",
    "docs/[...rest].tsx",
    "(admin)/dashboard.tsx",
    "notes.txt",
    "_internal.tsx",
  ]);

  const routes = scanRoutes(dir);
  const pages = routes.filter((route) => route.kind === "page");

  expect(pages.map((route) => route.path).sort()).toEqual([
    "/",
    "/about",
    "/dashboard",
    "/docs/*",
    "/users",
    "/users/:id",
  ].sort());

  const dynamic = pages.find((route) => route.path === "/users/:id");
  expect(dynamic?.params).toEqual(["id"]);

  const catchAll = pages.find((route) => route.path === "/docs/*");
  expect(catchAll?.params).toEqual(["rest"]);

  const layouts = routes.filter((route) => route.kind === "layout");
  expect(layouts.map((route) => route.path).sort()).toEqual(["/", "/users"]);
});

test("melempar E_ROUTE_CONFLICT untuk dua dynamic di segmen yang sama", () => {
  const dir = makeRoutesDir(["users/[id].tsx", "users/[name].tsx"]);

  let thrown: unknown;
  try {
    scanRoutes(dir);
  } catch (error) {
    thrown = error;
  }

  expect(thrown).toBeInstanceOf(MoonsError);
  const moonsError = thrown as MoonsError;
  expect(moonsError.code).toBe("E_ROUTE_CONFLICT");

  const formatted = moonsError.format();
  expect(formatted).toContain("[moons] E_ROUTE_CONFLICT");
  expect(formatted).toContain("users/[id].tsx");
  expect(formatted).toContain("users/[name].tsx");
  expect(formatted).toContain("Saran:");
});

test("konflik statik (index vs file) juga terdeteksi", () => {
  const dir = makeRoutesDir(["users/index.tsx", "users.tsx"]);
  expect(() => scanRoutes(dir)).toThrow(MoonsError);
});

test("D.3: _error.tsx boleh bersarang; _404.tsx tetap root-only", () => {
  const nestedError = makeRoutesDir(["nested/_error.tsx"]);
  const routes = scanRoutes(nestedError);
  expect(routes.find((route) => route.kind === "error")).toBeDefined();

  const nestedNotFound = makeRoutesDir(["nested/_404.tsx"]);
  let thrown: unknown;
  try {
    scanRoutes(nestedNotFound);
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(MoonsError);
  expect((thrown as MoonsError).code).toBe("E_ROUTE_EXPORT_INVALID");
  expect((thrown as MoonsError).format()).toContain("_404.tsx");
});

test("D.3: _middleware.ts discan sebagai kind middleware (key unik per direktori)", () => {
  const dir = makeRoutesDir(["_middleware.ts", "admin/_middleware.ts", "admin/page.tsx"]);
  const routes = scanRoutes(dir);
  const middlewares = routes.filter((route) => route.kind === "middleware");
  expect(middlewares).toHaveLength(2);
  const keys = middlewares.map((route) => routeKeyFromFile(dir, route.file)).sort();
  expect(keys).toEqual(["_middleware", "admin/_middleware"]);
});

test("_404.tsx di root dikenali sebagai kind 404", () => {
  const dir = makeRoutesDir(["_404.tsx", "index.tsx"]);
  const routes = scanRoutes(dir);
  expect(routes.find((route) => route.kind === "404")).toBeDefined();
});

test("catch-all bukan segmen terakhir → E_ROUTE_EXPORT_INVALID", () => {
  const dir = makeRoutesDir(["docs/[...rest]/detail.tsx"]);
  let thrown: unknown;
  try {
    scanRoutes(dir);
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(MoonsError);
  expect((thrown as MoonsError).code).toBe("E_ROUTE_EXPORT_INVALID");
});

test("routeKeyFromFile stabil untuk manifest/payload", () => {
  expect(routeKeyFromFile("/x/src/routes", "/x/src/routes/users/[id].tsx")).toBe("users/[id]");
  expect(routeKeyFromFile("/x/src/routes", "/x/src/routes/index.tsx")).toBe("index");
  expect(routeKeyFromFile("/x/src/routes", "/x/src/routes/(admin)/dashboard.tsx")).toBe(
    "(admin)/dashboard",
  );
});
