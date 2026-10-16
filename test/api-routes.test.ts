import { expect, test } from "bun:test";
import { MoonsError } from "@moonsjs/core";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { resolveApiRoute, scanApiRoutes } from "../src/api-routes";

function makeApiDir(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "moons-api-"));
  for (const [rel, content] of Object.entries(files)) {
    const full = join(root, rel);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
  return root;
}

test("scanApiRoutes: prefix, index, param, catch-all, group; _*/d.ts diabaikan", () => {
  const dir = makeApiDir({
    "hello.ts": "export const GET = () => new Response('ok');\n",
    "index.ts": "export const GET = () => new Response('root');\n",
    "webhooks/[provider].ts": "export const POST = () => new Response('hook');\n",
    "files/[...rest].ts": "export const GET = () => new Response('rest');\n",
    "(admin)/metrics.ts": "export const GET = () => new Response('metrics');\n",
    "_middleware.ts": "export default () => new Response('mw');\n",
    "types.d.ts": "export type X = 1;\n",
  });

  const routes = scanApiRoutes(dir, { prefix: "api" });
  expect(routes.map((route) => route.path)).toEqual([
    "/api",
    "/api/files/*",
    "/api/hello",
    "/api/metrics",
    "/api/webhooks/:provider",
  ]);
  expect(routes.find((route) => route.path === "/api/webhooks/:provider")?.params).toEqual(["provider"]);
  expect(routes.find((route) => route.path === "/api/files/*")?.params).toEqual(["rest"]);
});

test("resolveApiRoute: precedence static > dynamic > catch-all + decode param", () => {
  const dir = makeApiDir({
    "users/me.ts": "export const GET = () => new Response('me');\n",
    "users/[id].ts": "export const GET = () => new Response('id');\n",
    "users/[...rest].ts": "export const GET = () => new Response('rest');\n",
  });
  const routes = scanApiRoutes(dir, { prefix: "api" });

  expect(resolveApiRoute("/api/users/me", routes)?.route.path).toBe("/api/users/me");
  const dynamic = resolveApiRoute("/api/users/u%201", routes);
  expect(dynamic?.route.path).toBe("/api/users/:id");
  expect(dynamic?.params).toEqual({ id: "u 1" });
  expect(resolveApiRoute("/api/users/a/b", routes)?.route.path).toBe("/api/users/*");
  expect(resolveApiRoute("/api/nope", routes)).toBeNull();
});

test("scanApiRoutes: konflik pola (nama param berbeda) → E_API_ROUTE_CONFLICT", () => {
  const dir = makeApiDir({
    "c/[id].ts": "export const GET = () => new Response('a');\n",
    "c/[uid].ts": "export const GET = () => new Response('b');\n",
  });
  let thrown: unknown;
  try {
    scanApiRoutes(dir, { prefix: "api" });
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(MoonsError);
  expect((thrown as MoonsError).code).toBe("E_API_ROUTE_CONFLICT");
  expect((thrown as MoonsError).format()).toContain("Saran:");
});
