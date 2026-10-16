import { expect, test } from "bun:test";
import { computeFnHash, fnRegistryKey } from "@moonsjs/core";
import { createHash } from "node:crypto";

function expected(path: string, exportName: string): string {
  return createHash("sha256").update(`${path}#${exportName}`).digest("hex").slice(0, 16);
}

test("computeFnHash mengikuti §12.5 dan stabil", () => {
  const hash = computeFnHash("/project", "/project/src/server/users.server.ts", "getUser");
  expect(hash).toBe(expected("src/server/users.server.ts", "getUser"));
  expect(hash).toMatch(/^[0-9a-f]{16}$/);
  expect(computeFnHash("/project", "/project/src/server/users.server.ts", "getUser")).toBe(hash);
});

test("export berbeda menghasilkan hash berbeda", () => {
  const a = computeFnHash("/project", "/project/src/server/users.server.ts", "getUser");
  const b = computeFnHash("/project", "/project/src/server/users.server.ts", "deleteUser");
  expect(a).not.toBe(b);
});

test("fnRegistryKey memakai path posix relatif root", () => {
  expect(fnRegistryKey("/project", "/project/src/server/users.server.ts", "getUser")).toBe(
    "src/server/users.server.ts#getUser",
  );
});
