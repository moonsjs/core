import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MOONS_VERSION } from "../src/version";

test("MOONS_VERSION sinkron dengan packages/core/package.json (anti-drift)", () => {
  const pkg = JSON.parse(
    readFileSync(join(import.meta.dir, "..", "package.json"), "utf8"),
  ) as { version: string };
  expect(MOONS_VERSION).toBe(pkg.version);
});
