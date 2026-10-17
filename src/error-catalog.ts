import type { MoonsErrorCode } from "./errors";

/**
 * Machine-readable error catalog (PRD Addendum B.6 / N.1).
 * MUST include ALL `MOONS_ERROR_CODES` (guarded by a unit test) — used by
 * `moons errors --json` and MCP `explain_error`. Content is English so agents
 * and tooling can consume it directly.
 */
export interface ErrorCatalogEntry {
  code: MoonsErrorCode;
  /** When this error occurs. */
  trigger: string;
  /** Short explanation of why it is an error. */
  details: string;
  /** Fix suggestions (format §15.1). */
  suggestions: string[];
}

export const ERROR_CATALOG: ReadonlyArray<ErrorCatalogEntry> = [
  {
    code: "E_API_HANDLER_INVALID",
    trigger:
      "An `src/api/**` module exports something other than method handlers (`default`, helpers, constants), a handler is not a function, or a handler does not return a `Response`.",
    details:
      "API modules may only export method handlers: `GET|HEAD|POST|PUT|PATCH|DELETE|OPTIONS`.",
    suggestions: [
      "Export handlers as `export const GET = (args) => new Response(...)`",
      "Move helpers/constants to `src/server/**` or `src/shared/**`",
    ],
  },
  {
    code: "E_API_ROUTE_CONFLICT",
    trigger:
      "Two `src/api` files resolve to the same URL, or `[...rest]` is not the final segment.",
    details: "There is no fallback for API route conflicts.",
    suggestions: ["Rename one dynamic segment (`[id]` vs `[uid]`)", "Delete one of the files"],
  },
  {
    code: "E_RESPONSE_HEADER_INVALID",
    trigger:
      "`setHeader`/`appendHeader`/`setCookie`/`deleteCookie` received an illegal name/value: CRLF, control characters, a non-token name, a framing header (`content-length`, `transfer-encoding`, …), or a `maxAge` that is not a number ≥ 0.",
    details: "Validation prevents HTTP response splitting and protocol-breaking headers.",
    suggestions: [
      "Remove newlines/control characters from the value",
      "Use valid header/cookie names; `maxAge` is in seconds",
    ],
  },
  {
    code: "E_RESPONSE_OUTSIDE_REQUEST",
    trigger:
      "A response helper was called outside a request (during build/prerender, in a client component, or in tooling without a store).",
    details: "Response helpers are request-scoped; there is no `Response` to mutate.",
    suggestions: [
      "Move the call into a loader or a `*.server.ts` handler",
      "For public values use `import.meta.env`",
    ],
  },
  {
    code: "E_MIDDLEWARE_INVALID",
    trigger:
      "`_middleware.ts` without `export default`, a default that is not a function, calling `next()` more than once, or not returning a `Response`.",
    details: "Directory middleware follows the `Middleware` shape.",
    suggestions: [
      "Export default `(args) => Promise<Response>` and return `await next()`",
      "Check `next()` calls — exactly one per request",
    ],
  },
  {
    code: "E_PRERENDER_NO_PATHS",
    trigger: "A dynamic route uses `export const prerender = true` without `export const paths`.",
    details: "Prerendering needs a list of params to render each path.",
    suggestions: [
      'Add `export const paths = () => [{ id: "…" }]`',
      "Or remove `prerender` so the route renders at request time (SSR)",
    ],
  },
  {
    code: "E_PRERENDER_LEAK",
    trigger:
      "Prerendered HTML/payload contains the `leakTest.canary` or env-like secret values.",
    details:
      "Static files are permanent — a prerender leak cannot be mitigated at runtime; the build is stopped.",
    suggestions: [
      "Do not return secret env values from a loader that is prerendered",
      "Disable `prerender` for that route, or fetch the data via a request-time serverFn",
    ],
  },
  {
    code: "E_PRERENDER_INVALID",
    trigger:
      "`prerender` is not a boolean, `paths` is not an array of valid param objects (name/type mismatch), path traversal (`..`), `redirect()` during prerender, or a non-200 status other than 404.",
    details: "The prerender contract is enforced.",
    suggestions: [
      "Fix the `paths`/params shape so it matches the route pattern",
      "Do not use `redirect()` on a prerendered route",
    ],
  },
  {
    code: "E_ISR_INVALID",
    trigger: "`export const revalidate` is not a number >= 0, or is used without `export const prerender = true`.",
    details: "File-based ISR: revalidate (seconds) + prerender.",
    suggestions: [
      "Use a number of seconds, e.g. `export const revalidate = 60`",
      "Add `export const prerender = true` to the same page",
    ],
  },
  {
    code: "E_SERVER_IMPORT_IN_CLIENT",
    trigger: "A client module imports a NON-serverFn value from `*.server.ts` (or default/`* as`).",
    details: "Only `serverFn` may cross to the client; everything else is replaced by an RPC stub.",
    suggestions: [
      "Create a server function that returns the data you need",
      "If the value is genuinely public, redefine the constant in a client-safe module (never move secret values)",
    ],
  },
  {
    code: "E_SCHEMA_LOCAL_REF",
    trigger: "A serverFn `input`/`output` schema references a local declaration (`const`/`function`/`class`) in the `*.server.ts` file.",
    details:
      "The client stub only carries imports + schema expressions; local declarations are dropped so the reference is `undefined` in the browser. Error messages include a before/after diff (inline, or move to `src/shared/schemas.ts`).",
    suggestions: [
      "Inline the schema directly in `serverFn({ input, output })`",
      "Import the schema from a client-safe shared module (e.g. `src/shared/schemas.ts`)",
    ],
  },
  {
    code: "E_SCHEMA_SERVER_REF",
    trigger:
      "A serverFn `input`/`output` schema references a non-serverFn value imported from another `*.server.ts` file.",
    details:
      "The client stub does not export server values, so the schema reference fails — previously surfaced as a raw bundler error (`MISSING_EXPORT`).",
    suggestions: [
      "Move the constant/schema to a client-safe module (e.g. `src/shared/schemas.ts`)",
      "Do extra validation in the server handler instead of the schema expression",
    ],
  },
  {
    code: "E_ROUTE_CONFLICT",
    trigger: "Two route files resolve to the same URL.",
    details: "There is no fallback for route conflicts.",
    suggestions: ["Turn one dynamic segment into a static one", "Delete one of the files"],
  },
  {
    code: "E_ROUTE_EXPORT_INVALID",
    trigger:
      "Illegal export in a route module; `_error`/`_404` outside the root; `[...rest]` not the final segment; a layout exporting `meta`.",
    details:
      "Pages may only export `default|loader|meta`; layouts `default|loader`; `_error`/`_404` only `default`.",
    suggestions: ["Remove the extra export", "Move helpers/types to `src/shared/`"],
  },
  {
    code: "E_CONFIG_INVALID",
    trigger:
      "Invalid `moons.config.ts`: unknown key, plugin outside the allowed shape, or `routesDir` not found.",
    details: "Config is a server-side contract.",
    suggestions: [
      "Fix the key the message points at",
      "Follow the `MoonsPlugin` shape (anything beyond it is rejected)",
    ],
  },
  {
    code: "E_RPC_INVALID_INPUT",
    trigger: "A serverFn call input does not pass the `input` schema (validated on BOTH client and server).",
    details: "Server function input must pass `input` schema validation.",
    suggestions: ["Check the argument types at the call site", "Update the `input` schema"],
  },
  {
    code: "E_RPC_INVALID_OUTPUT",
    trigger: "A serverFn handler return value does not pass the `output` schema.",
    details: "Handler return values must pass `output` schema validation.",
    suggestions: ["Fix the handler return value", "Update the `output` schema"],
  },
  {
    code: "E_RPC_BAD_ORIGIN",
    trigger: "An RPC request arrived from an origin not in `security.originWhitelist`.",
    details: "CSRF/cross-site protection for RPC endpoints.",
    suggestions: [
      "Add the legitimate origin to `security.originWhitelist`",
      "Ensure calls come from your own pages (same-origin)",
    ],
  },
  {
    code: "E_RPC_MISSING_HEADER",
    trigger: "A request to `/_moons/fn/<hash>` without the `x-moons: 1` header.",
    details: "All RPC requests must include this header.",
    suggestions: ["Use `serverFn()` from the client instead of manual fetch"],
  },
  {
    code: "E_RPC_BODY_TOO_LARGE",
    trigger: "An RPC request body exceeds `security.bodyLimitBytes` (default 1,000,000 bytes).",
    details: "The size limit protects the server from oversized payloads.",
    suggestions: [
      "Raise `security.bodyLimitBytes` if you really need to",
      "Send smaller data / use a dedicated upload endpoint",
    ],
  },
  {
    code: "E_REQUEST_TIMEOUT",
    trigger:
      "A loader, serverFn, or API handler did not produce a response within `requestTimeoutMs` (default 30000 ms).",
    details:
      "The transport stops waiting and answers 504. The handler keeps running until it settles; JavaScript cannot cancel it.",
    suggestions: [
      "Make the handler faster, or move slow work out of the request path",
      "Raise `requestTimeoutMs`, or set it to 0 to disable the timeout",
    ],
  },
  {
    code: "E_ENV_IN_CLIENT",
    trigger: "`env()` was called in a module that ends up in the client bundle.",
    details: "`env` is server-only.",
    suggestions: [
      "Move the call into a serverFn or `*.server.ts`",
      "Use `import.meta.env.VITE_*` for public values",
    ],
  },
  {
    code: "E_FORBIDDEN_SERVER_IMPORT",
    trigger:
      "Import of `node:*`/`bun:*`, or of a server-only package (built-in list, `security.serverOnlyPackages`, or a `\"moons\": { \"serverOnly\": true }` marker in package.json), in a module that ends up in the client bundle (including dynamic `import()` and re-exports).",
    details:
      "Server-only modules/packages may only be imported from `*.server.ts`. Type-only imports are exempt.",
    suggestions: [
      "Move the operation into `*.server.ts` and call it through a serverFn",
      "Or replace/remove the import in the client module",
    ],
  },
  {
    code: "E_INTERNAL",
    trigger: "Framework error: failed build, a loader returning a `Response`, invalid redirect status, etc.",
    details: "The message carries the specific cause; this is the catalog fallback.",
    suggestions: ["Read the message + location shown", "Run `moons check` and fix the failing step"],
  },
];

export function findErrorEntry(code: string): ErrorCatalogEntry | undefined {
  return ERROR_CATALOG.find((entry) => entry.code === code);
}
