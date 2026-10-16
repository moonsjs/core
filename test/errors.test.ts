import { expect, test } from "bun:test";
import { MoonsError } from "@moonsjs/core";

test("format §15.1 lengkap dengan file:line", () => {
  const error = new MoonsError({
    code: "E_ENV_IN_CLIENT",
    file: "src/client/config.ts",
    line: 3,
    message: "memanggil `env(\"API_KEY\")` di modul yang masuk client",
    details: "`env()` hanya legal di server.",
    suggestions: ["Pindahkan pemanggilan ke dalam serverFn", "Gunakan import.meta.env untuk nilai publik"],
  });

  expect(error.format()).toBe(
    [
      "[moons] E_ENV_IN_CLIENT",
      "",
      "src/client/config.ts:3",
      '  memanggil `env("API_KEY")` di modul yang masuk client',
      "",
      "`env()` hanya legal di server.",
      "",
      "Saran:",
      "  1. Pindahkan pemanggilan ke dalam serverFn",
      "  2. Gunakan import.meta.env untuk nilai publik",
    ].join("\n"),
  );
});

test("format konflik route dengan relatedFiles", () => {
  const error = new MoonsError({
    code: "E_ROUTE_CONFLICT",
    relatedFiles: ["src/routes/users/[id].tsx", "src/routes/users/[name].tsx"],
    message: "keduanya resolve ke /users/:<dynamic>",
    details: "Tidak ada fallback untuk konflik route. Ubah salah satu menjadi static, atau gabungkan.",
    suggestions: ["Ganti salah satu dynamic segment menjadi static, atau", "Hapus salah satu file"],
  });

  const formatted = error.format();
  expect(formatted).toContain("[moons] E_ROUTE_CONFLICT");
  expect(formatted).toContain("src/routes/users/[id].tsx\nsrc/routes/users/[name].tsx");
  expect(formatted).toContain("  keduanya resolve ke /users/:<dynamic>");
  expect(formatted).toContain("Saran:");
});

test("format dengan location dan annotation", () => {
  const rpc = new MoonsError({
    code: "E_RPC_INVALID_INPUT",
    location: "POST /_moons/fn/a1b2c3d4e5f6a7b8",
    message: "input tidak sesuai schema: `id` harus string",
    details: "Input RPC harus lolos validasi schema.",
    suggestions: ["Periksa tipe argumen di pemanggil, atau", "Perbarui schema `input`"],
  });
  expect(rpc.format()).toContain("POST /_moons/fn/a1b2c3d4e5f6a7b8\n  input tidak sesuai schema");

  const output = new MoonsError({
    code: "E_RPC_INVALID_OUTPUT",
    file: "src/server/users.server.ts",
    line: 14,
    annotation: "getUser",
    message: "output tidak sesuai schema: field `name` tidak ada",
    details: "Output handler harus lolos validasi schema.",
    suggestions: ["Perbaiki return value handler, atau", "Perbarui schema `output`"],
  });
  expect(output.format()).toContain("src/server/users.server.ts:14 (getUser)");
});
