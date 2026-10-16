import { expect, test } from "bun:test";
import { MoonsError, composeMiddleware, type Middleware } from "@moonsjs/core";

const req = new Request("http://localhost/");

test("middleware berjalan berurutan lalu final (§14.2)", async () => {
  const order: string[] = [];
  const middleware: Middleware[] = [
    async ({ next }) => {
      order.push("a");
      const response = await next();
      order.push("a:after");
      return response;
    },
    async ({ next }) => {
      order.push("b");
      return next();
    },
  ];

  const handler = composeMiddleware(middleware, {}, async () => {
    order.push("final");
    return new Response("ok");
  });

  const response = await handler(req);
  expect(await response.text()).toBe("ok");
  expect(order).toEqual(["a", "b", "final", "a:after"]);
});

test("middleware boleh mutate ctx", async () => {
  const ctx: Record<string, unknown> = {};
  const handler = composeMiddleware(
    [
      async ({ ctx: rawCtx, next }) => {
        const middlewareCtx = rawCtx as Record<string, unknown>;
        middlewareCtx["requestId"] = "r1";
        return next();
      },
    ],
    ctx,
    async () => new Response(String(ctx["requestId"])),
  );
  expect(await (await handler(req)).text()).toBe("r1");
});

test("middleware tanpa next → E_INTERNAL", async () => {
  const bad = (async () => undefined) as unknown as Middleware;
  const handler = composeMiddleware([bad], {}, async () => new Response("ok"));

  let thrown: unknown;
  try {
    await handler(req);
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(MoonsError);
  expect((thrown as MoonsError).code).toBe("E_INTERNAL");
  expect((thrown as MoonsError).format()).toContain("Saran:");
});

test("next() dua kali → E_INTERNAL", async () => {
  const twice: Middleware = async ({ next }) => {
    await next();
    return next();
  };
  const handler = composeMiddleware([twice], {}, async () => new Response("ok"));
  expect(handler(req)).rejects.toThrow(MoonsError);
});

test("tanpa middleware langsung ke final", async () => {
  const handler = composeMiddleware([], {}, async () => new Response("direct"));
  expect(await (await handler(req)).text()).toBe("direct");
});
