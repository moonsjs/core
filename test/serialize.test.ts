import { expect, test } from "bun:test";
import {
  decodeSsrPayload,
  encodeSsrPayload,
  reviveError,
  serializeError,
  type SerializedError,
  type SsrPayload,
} from "@moonsjs/core/serialize";

test("round-trip payload utuh: Date, Map, Set, BigInt, undefined, NaN", () => {
  const payload: SsrPayload = {
    key: "/users/[id]",
    params: { id: "u1" },
    searchParams: { month: "2026-11", type: "FIX" },
    data: {
      "users/[id]": {
        createdAt: new Date("2024-01-01T00:00:00Z"),
        tags: new Map([["role", "admin"]]),
        seen: new Set(["a", "b"]),
        big: 123n,
        missing: undefined,
        notANumber: Number.NaN,
      },
    },
  };

  const decoded = decodeSsrPayload(encodeSsrPayload(payload));
  const value = decoded.data["users/[id]"] as {
    createdAt: Date;
    tags: Map<string, string>;
    seen: Set<string>;
    big: bigint;
    missing: undefined;
    notANumber: number;
  };

  expect(value.createdAt).toBeInstanceOf(Date);
  expect(value.createdAt.toISOString()).toBe("2024-01-01T00:00:00.000Z");
  expect(value.tags).toBeInstanceOf(Map);
  expect(value.tags.get("role")).toBe("admin");
  expect(value.seen).toBeInstanceOf(Set);
  expect(value.big).toBe(123n);
  expect(value.missing).toBeUndefined();
  expect(Number.isNaN(value.notANumber)).toBe(true);
  expect(decoded.key).toBe("/users/[id]");
  expect(decoded.params).toEqual({ id: "u1" });
  expect(decoded.searchParams).toEqual({ month: "2026-11", type: "FIX" });
});

test("escape §17: tidak ada karakter HTML berbahaya di output", () => {
  const payload: SsrPayload = {
    key: "/",
    params: {},
    data: {
      index: {
        html: "</script><script>alert(1)</script>",
        amp: "a & b",
        lineSep: "x\u2028y\u2029z",
      },
    },
  };

  const encoded = encodeSsrPayload(payload);
  expect(encoded).not.toContain("<");
  expect(encoded).not.toContain(">");
  expect(encoded).not.toContain("&");
  expect(encoded).not.toContain("\u2028");
  expect(encoded).not.toContain("\u2029");
  // devalue meng-escape `<`; layer kita menutup `>` dan `&` yang masih mentah.
  expect(encoded).toContain("\\u003e");
  expect(encoded).toContain("\\u0026");
});

test("teks literal \\u003c tidak rusak oleh escape/unescape", () => {
  const tricky = "literal \\u003c dan </script> dan &";
  const payload: SsrPayload = { key: "/", params: {}, data: { index: tricky } };

  const decoded = decodeSsrPayload(encodeSsrPayload(payload));
  expect(decoded.data["index"]).toBe(tricky);
});

test("serializeError/reviveError round-trip (devalue tidak mendukung Error)", () => {
  const error = new Error("gagal total");
  const serialized = serializeError(error);
  const payload: SsrPayload = { key: "__moons/error", params: {}, data: {}, error: serialized };

  const decoded = decodeSsrPayload(encodeSsrPayload(payload));
  const revived = reviveError(decoded.error as SerializedError);

  expect(revived).toBeInstanceOf(Error);
  expect(revived.message).toBe("gagal total");
  expect(revived.name).toBe("Error");

  expect(serializeError("string-error").message).toBe("string-error");
});
