import { expect, test } from "bun:test";
import { MoonsError, generateTypes } from "@moonsjs/core";
import { cpSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { makeRoutesDir, makeTempDir, writeFile } from "./helpers";

test("generateTypes menulis routes.d.ts dan context.d.ts (§13)", async () => {
  const project = makeTempDir();
  const routesDir = join(project, "src/routes");
  makeRoutesDirInto(routesDir);
  const configPath = join(project, "moons.config.ts");
  writeFile(configPath, "export default { context: () => ({}) };\n");
  const outDir = join(project, ".moons");

  await generateTypes({ routesDir, configPath, outDir });

  const routesDts = readFileSync(join(outDir, "routes.d.ts"), "utf8");
  expect(routesDts).toContain('"/users/[id]": { params: { id: string } };');
  expect(routesDts).toContain('"/docs/[...rest]": { params: { rest: string } };');
  expect(routesDts).toContain('"/about": { params: {} };');
  expect(routesDts).toContain("export type RoutePath = keyof RouteMap;");
  expect(routesDts).toContain("export {};");

  const contextDts = readFileSync(join(outDir, "context.d.ts"), "utf8");
  expect(contextDts).toContain('import type config from "../moons.config";');
  expect(contextDts).toContain("declare global {");
  expect(contextDts).toContain("type Ctx = Awaited<ReturnType<typeof config.context>>;");
});

test("generateTypes gagal dengan E_ROUTE_CONFLICT pada route duplikat", async () => {
  const project = makeTempDir();
  const routesDir = join(project, "src/routes");
  makeRoutesDirInto(routesDir);
  writeFile(join(routesDir, "users/[name].tsx"), "// duplikat\n");
  const outDir = join(project, ".moons");

  let thrown: unknown;
  try {
    await generateTypes({ routesDir, configPath: join(project, "moons.config.ts"), outDir });
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(MoonsError);
  expect((thrown as MoonsError).code).toBe("E_ROUTE_CONFLICT");
  expect(existsSync(join(outDir, "routes.d.ts"))).toBe(false);
});

function makeRoutesDirInto(routesDir: string): void {
  const source = makeRoutesDir([
    "_layout.tsx",
    "index.tsx",
    "about.tsx",
    "users/index.tsx",
    "users/[id].tsx",
    "docs/[...rest].tsx",
  ]);
  cpSync(source, routesDir, { recursive: true });
}
