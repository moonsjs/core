import { expect, test } from "bun:test";
import { MoonsError, runLoaders, type LoaderRunArgs, type RouteModule } from "@moonsjs/core";

const req = new Request("http://localhost/");
const args: LoaderRunArgs = { params: { id: "u1" }, ctx: {}, req };

test("menjalankan loader secara paralel (§11.2)", async () => {
  const started: string[] = [];
  let releaseA: () => void = () => {};
  let releaseB: () => void = () => {};
  const gateA = new Promise<void>((resolve) => (releaseA = resolve));
  const gateB = new Promise<void>((resolve) => (releaseB = resolve));

  const pending = runLoaders(
    [
      {
        file: "a.tsx",
        module: {
          loader: async () => {
            started.push("a");
            await gateA;
            return "A";
          },
        },
      },
      {
        file: "b.tsx",
        module: {
          loader: async () => {
            started.push("b");
            await gateB;
            return "B";
          },
        },
      },
    ],
    args,
  );

  await Promise.resolve();
  expect(started.sort()).toEqual(["a", "b"]);

  releaseA();
  releaseB();
  expect(await pending).toEqual({ "a.tsx": "A", "b.tsx": "B" });
});

test("modul tanpa loader menghasilkan undefined", async () => {
  const result = await runLoaders([{ file: "a.tsx", module: {} }], args);
  expect(result).toEqual({ "a.tsx": undefined });
});

test("loader menerima params, ctx, dan req yang sama", async () => {
  let received: LoaderRunArgs | undefined;
  const module: RouteModule = {
    loader: (loaderArgs) => {
      received = loaderArgs;
      return { ok: true };
    },
  };
  await runLoaders([{ file: "a.tsx", module }], args);
  expect(received).toBe(args);
});

test("loader mengembalikan Response → E_INTERNAL", async () => {
  const module: RouteModule = { loader: () => new Response("nope") };
  let thrown: unknown;
  try {
    await runLoaders([{ file: "a.tsx", module }], args);
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(MoonsError);
  expect((thrown as MoonsError).code).toBe("E_INTERNAL");
});
