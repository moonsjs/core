import { MoonsError } from "./errors";
import type { Middleware } from "./types";
import type { MoonsErrorCode } from "./errors";

/**
 * Compose middleware global sesuai PRD §14.2 (opsi kode error untuk chain
 * direktori §D.3). Setiap middleware wajib memanggil `next()` tepat sekali dan
 * mengembalikan `Response`; pelanggaran → `options.code ?? E_INTERNAL`.
 */
export function composeMiddleware(
  middleware: ReadonlyArray<Middleware>,
  ctx: Ctx,
  final: () => Promise<Response>,
  options: { code?: MoonsErrorCode; label?: string } = {},
): (req: Request) => Promise<Response> {
  const code = options.code ?? "E_INTERNAL";
  const label = options.label ?? "global middleware";
  return async (req: Request): Promise<Response> => {
    let lastIndex = -1;

    const dispatch = async (index: number): Promise<Response> => {
      if (index <= lastIndex) {
        throw new MoonsError({
          code,
          message: `${label} called \`next()\` more than once`,
          details: "Middleware must call `next` exactly once.",
          suggestions: ["Check the `next()` calls in your middleware"],
        });
      }
      lastIndex = index;

      const current = middleware[index];
      if (current === undefined) {
        return final();
      }

      const response = await current({ req, ctx, next: () => dispatch(index + 1) });
      if (!(response instanceof Response)) {
        throw new MoonsError({
          code,
          message: `${label} did not return a \`Response\``,
          details:
            "Middleware must call `next` and return its result, or return its own `Response`.",
          suggestions: [
            "Return `await next()` from the middleware",
            "Or return `new Response(...)` explicitly",
          ],
        });
      }
      return response;
    };

    return dispatch(0);
  };
}
