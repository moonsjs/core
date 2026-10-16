import { expect, test } from "bun:test";
import {
  ERROR_CATALOG,
  MOONS_ERROR_CODES,
  MoonsError,
  findErrorEntry,
  type MoonsErrorCode,
} from "@moonsjs/core";

const EXPECTED_CODES: MoonsErrorCode[] = [
  "E_API_HANDLER_INVALID",
  "E_API_ROUTE_CONFLICT",
  "E_RESPONSE_HEADER_INVALID",
  "E_RESPONSE_OUTSIDE_REQUEST",
  "E_MIDDLEWARE_INVALID",
  "E_PRERENDER_NO_PATHS",
  "E_PRERENDER_LEAK",
  "E_PRERENDER_INVALID",
  "E_ISR_INVALID",
  "E_SERVER_IMPORT_IN_CLIENT",
  "E_SCHEMA_LOCAL_REF",
  "E_SCHEMA_SERVER_REF",
  "E_ROUTE_CONFLICT",
  "E_ROUTE_EXPORT_INVALID",
  "E_CONFIG_INVALID",
  "E_RPC_INVALID_INPUT",
  "E_RPC_INVALID_OUTPUT",
  "E_RPC_BAD_ORIGIN",
  "E_RPC_MISSING_HEADER",
  "E_RPC_BODY_TOO_LARGE",
  "E_ENV_IN_CLIENT",
  "E_FORBIDDEN_SERVER_IMPORT",
  "E_INTERNAL",
];

test("katalog runtime memuat seluruh kode §15.2 (23)", () => {
  expect([...MOONS_ERROR_CODES].sort()).toEqual([...EXPECTED_CODES].sort());
});

test("ERROR_CATALOG mencakup SEMUA kode, sekali masing-masing, field terisi", () => {
  expect([...ERROR_CATALOG.map((entry) => entry.code)].sort()).toEqual(
    [...MOONS_ERROR_CODES].sort(),
  );
  expect(new Set(ERROR_CATALOG.map((entry) => entry.code)).size).toBe(ERROR_CATALOG.length);

  for (const entry of ERROR_CATALOG) {
    expect(entry.trigger.length).toBeGreaterThan(0);
    expect(entry.details.length).toBeGreaterThan(0);
    expect(entry.suggestions.length).toBeGreaterThan(0);
    expect(findErrorEntry(entry.code)).toBe(entry);
  }
  expect(findErrorEntry("E_TIDAK_ADA")).toBeUndefined();
});

test("setiap kode §15 memakai format §15.1 (trigger & bentuk pesan)", () => {
  for (const code of EXPECTED_CODES) {
    const error = new MoonsError({
      code,
      file: "src/contoh.ts",
      line: 3,
      message: `message for ${code}`,
      details: "Short explanation of why this is an error.",
      suggestions: ["First suggestion", "Second suggestion"],
    });

    const formatted = error.format();

    expect(formatted.startsWith(`[moons] ${code}\n\n`)).toBe(true);
    expect(formatted).toContain("\nsrc/contoh.ts:3\n");
    expect(formatted).toContain(`  message for ${code}\n`);
    expect(formatted).toContain("Short explanation of why this is an error.");
    expect(formatted).toContain("\nSuggestion:\n  1. First suggestion\n  2. Second suggestion");
    expect(formatted).not.toContain("undefined");
    expect(error.message).toBe(formatted);
  }
});
