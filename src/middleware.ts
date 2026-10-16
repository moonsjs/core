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
  const label = options.label ?? "middleware global";
  return async (req: Request): Promise<Response> => {
    let lastIndex = -1;

    const dispatch = async (index: number): Promise<Response> => {
      if (index <= lastIndex) {
        throw new MoonsError({
          code,
          message: `${label} memanggil \`next()\` lebih dari sekali`,
          details: "Middleware harus memanggil `next` tepat satu kali.",
          suggestions: ["Periksa pemanggilan `next()` di middleware"],
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
          message: `${label} tidak mengembalikan \`Response\``,
          details:
            "Middleware wajib memanggil `next` dan mengembalikan hasilnya, atau mengembalikan `Response` sendiri.",
          suggestions: [
            "Kembalikan `await next()` dari middleware",
            "Atau kembalikan `new Response(...)` secara eksplisit",
          ],
        });
      }
      return response;
    };

    return dispatch(0);
  };
}
