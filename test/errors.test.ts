import { expect, test } from "bun:test";
import { MoonsError } from "@moonsjs/core";

test("format §15.1 lengkap dengan file:line", () => {
  const error = new MoonsError({
    code: "E_ENV_IN_CLIENT",
    file: "src/client/config.ts",
    line: 3,
    message: "called `env(\"API_KEY\")` in a client module",
    details: "`env()` is legal on the server only.",
    suggestions: ["Move the call into a serverFn", "Use import.meta.env for public values"],
  });

  expect(error.format()).toBe(
    [
      "[moons] E_ENV_IN_CLIENT",
      "",
      "src/client/config.ts:3",
      '  called `env("API_KEY")` in a client module',
      "",
      "`env()` is legal on the server only.",
      "",
      "Suggestion:",
      "  1. Move the call into a serverFn",
      "  2. Use import.meta.env for public values",
    ].join("\n"),
  );
});

test("format konflik route dengan relatedFiles", () => {
  const error = new MoonsError({
    code: "E_ROUTE_CONFLICT",
    relatedFiles: ["src/routes/users/[id].tsx", "src/routes/users/[name].tsx"],
    message: "both resolve to /users/:<dynamic>",
    details: "There is no fallback for route conflicts. Turn one of them into a static route, or merge them.",
    suggestions: ["Turn one of the dynamic segments into a static one, or", "Delete one of the files"],
  });

  const formatted = error.format();
  expect(formatted).toContain("[moons] E_ROUTE_CONFLICT");
  expect(formatted).toContain("src/routes/users/[id].tsx\nsrc/routes/users/[name].tsx");
  expect(formatted).toContain("  both resolve to /users/:<dynamic>");
  expect(formatted).toContain("Suggestion:");
});

test("format dengan location dan annotation", () => {
  const rpc = new MoonsError({
    code: "E_RPC_INVALID_INPUT",
    location: "POST /_moons/fn/a1b2c3d4e5f6a7b8",
    message: "input does not match the schema: `id` must be a string",
    details: "RPC input must pass schema validation.",
    suggestions: ["Check the argument types at the call site, or", "Update the `input` schema"],
  });
  expect(rpc.format()).toContain("POST /_moons/fn/a1b2c3d4e5f6a7b8\n  input does not match the schema");

  const output = new MoonsError({
    code: "E_RPC_INVALID_OUTPUT",
    file: "src/server/users.server.ts",
    line: 14,
    annotation: "getUser",
    message: "output does not match the schema: field `name` is missing",
    details: "The handler return value must pass schema validation.",
    suggestions: ["Fix the handler return value, or", "Update the `output` schema"],
  });
  expect(output.format()).toContain("src/server/users.server.ts:14 (getUser)");
});
