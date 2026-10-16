import { expect, test } from "bun:test";
import { MoonsError, defineConfig, validateConfig } from "@moonsjs/core";
import { join } from "node:path";
import { makeTempDir, writeFile } from "./helpers";

const context = () => ({});

test("defineConfig mempertahankan tipe literal context (dasar typegen Ctx §13)", () => {
  const config = defineConfig({
    routesDir: "src/routes",
    context: async () => ({ db: "fake", count: 1 }),
  });

  type Inferred = Awaited<ReturnType<typeof config.context>>;
  type Expect = Inferred extends { db: string; count: number } ? true : false;
  const check: Expect = true;

  expect(check).toBe(true);
  expect(config.context).toBeDefined();
});

test("config valid dinormalisasi dengan default §6.1", () => {
  const config = validateConfig({ context });
  expect(config.routesDir).toBe("src/routes");
  expect(config.middleware).toEqual([]);
  expect(config.security).toEqual({
    originWhitelist: [],
    bodyLimitBytes: 1_000_000,
    serverOnlyPackages: [],
    trustProxy: false,
  });
  expect(config.plugins).toEqual([]);
});

test("key root tidak dikenal → E_CONFIG_INVALID dengan format §15", () => {
  let thrown: unknown;
  try {
    validateConfig({ context, routeDir: "src/routes" });
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(MoonsError);
  const error = thrown as MoonsError;
  expect(error.code).toBe("E_CONFIG_INVALID");
  expect(error.format()).toContain("key `routeDir` tidak dikenal");
  expect(error.format()).toContain("Saran:");
});

test("key security tidak dikenal → E_CONFIG_INVALID", () => {
  expect(() => validateConfig({ context, security: { csrf: true } })).toThrow(MoonsError);
});

test("context bukan fungsi → E_CONFIG_INVALID", () => {
  expect(() => validateConfig({ context: "nope" })).toThrow(MoonsError);
});

test("routesDir yang tidak ada di disk → E_CONFIG_INVALID", () => {
  const dir = makeTempDir();
  expect(() => validateConfig({ context }, { projectRoot: dir })).toThrow(MoonsError);
});

test("bodyLimitBytes tidak valid → E_CONFIG_INVALID", () => {
  expect(() => validateConfig({ context, security: { bodyLimitBytes: -1 } })).toThrow(MoonsError);
});

test("middleware bukan array fungsi → E_CONFIG_INVALID", () => {
  expect(() => validateConfig({ context, middleware: ["nope"] })).toThrow(MoonsError);
});

test("pesan error menunjuk file:line saat file config tersedia", () => {
  const dir = makeTempDir();
  const file = join(dir, "moons.config.ts");
  writeFile(file, ["import { defineConfig } from \"@moonsjs/core\";", "", "export default defineConfig({", "  routeDir: \"src/routes\",", "});"].join("\n"));

  let thrown: unknown;
  try {
    validateConfig({ context, routeDir: "x" }, { file });
  } catch (error) {
    thrown = error;
  }
  const error = thrown as MoonsError;
  expect(error.line).toBe(4);
  expect(error.format()).toContain(`${file}:4`);
});

test("validateConfig §14.4: key plugin tak dikenal / hook bukan fungsi ditolak", () => {
  const base = { routesDir: "src/routes", context: async () => ({}) };

  expect(() =>
    validateConfig({ ...base, plugins: [{ name: "ok", onStart: () => {} }] }),
  ).not.toThrow();

  let unknownKey: unknown;
  try {
    validateConfig({ ...base, plugins: [{ name: "p", mencurigakan: 1 }] });
  } catch (error) {
    unknownKey = error;
  }
  expect(unknownKey).toBeInstanceOf(MoonsError);
  expect((unknownKey as MoonsError).code).toBe("E_CONFIG_INVALID");
  expect((unknownKey as MoonsError).format()).toContain("key `mencurigakan`");
  expect((unknownKey as MoonsError).format()).toContain("Saran:");

  let notFunction: unknown;
  try {
    validateConfig({ ...base, plugins: [{ name: "p", onReady: "bukan fungsi" }] });
  } catch (error) {
    notFunction = error;
  }
  expect(notFunction).toBeInstanceOf(MoonsError);
  expect((notFunction as MoonsError).format()).toContain("harus fungsi");
});

test("validateConfig Addendum C: security.serverOnlyPackages wajib array string", () => {
  const base = { routesDir: "src/routes", context: async () => ({}) };

  expect(() =>
    validateConfig({ ...base, security: { serverOnlyPackages: ["pg", "drizzle-orm"] } }),
  ).not.toThrow();

  let thrown: unknown;
  try {
    validateConfig({ ...base, security: { serverOnlyPackages: [1] } });
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(MoonsError);
  expect((thrown as MoonsError).code).toBe("E_CONFIG_INVALID");
  expect((thrown as MoonsError).format()).toContain("serverOnlyPackages");
  expect((thrown as MoonsError).format()).toContain("Saran:");

  let empty: unknown;
  try {
    validateConfig({ ...base, security: { serverOnlyPackages: [""] } });
  } catch (error) {
    empty = error;
  }
  expect(empty).toBeInstanceOf(MoonsError);
});

test("Addendum I: `isr.storage` valid diterima; bentuk salah → E_CONFIG_INVALID", () => {
  const storage = {
    read: async () => null,
    write: async () => {},
  };
  const ok = validateConfig({ context: () => ({}), isr: { storage } });
  expect(ok.isr?.storage).toBe(storage);

  let badKey: unknown;
  try {
    validateConfig({ context: () => ({}), isr: { hook: 1 } });
  } catch (error) {
    badKey = error;
  }
  expect(badKey).toBeInstanceOf(MoonsError);
  expect((badKey as MoonsError).code).toBe("E_CONFIG_INVALID");

  let badStorage: unknown;
  try {
    validateConfig({ context: () => ({}), isr: { storage: { read: async () => null } } });
  } catch (error) {
    badStorage = error;
  }
  expect((badStorage as MoonsError).code).toBe("E_CONFIG_INVALID");
});

test("Addendum L.3: `logging` valid diterima; bentuk salah → E_CONFIG_INVALID", () => {
  const ok = validateConfig({
    context,
    logging: { accessLog: true, json: false, redact: ["token"] },
  });
  expect(ok.logging).toEqual({ accessLog: true, json: false, redact: ["token"] });

  for (const bad of [
    { accessLog: "yes" },
    { json: 1 },
    { redact: ["ok", 3] },
    { level: "info" },
  ]) {
    let caught: unknown;
    try {
      validateConfig({ context, logging: bad });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(MoonsError);
    expect((caught as MoonsError).code).toBe("E_CONFIG_INVALID");
  }
});
