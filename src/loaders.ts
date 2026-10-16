import { MoonsError } from "./errors";

export interface LoaderRunArgs {
  params: Record<string, string>;
  ctx: Ctx;
  req: Request;
}

/** Bentuk modul route yang dibutuhkan runtime (PRD §11.2). */
export interface RouteModule {
  default?: unknown;
  loader?: (args: LoaderRunArgs) => Promise<unknown> | unknown;
  meta?: unknown;
  /** Addendum D.5: `export const prerender = true`. */
  prerender?: unknown;
  /** Addendum D.5: `export const paths = () => [{ … }]` (dynamic). */
  paths?: unknown;
  /** Addendum E.1: `export const revalidate = <detik>` (ISR). */
  revalidate?: unknown;
}

export interface LoaderEntry {
  file: string;
  module: RouteModule;
}

/**
 * Jalankan loader layout + page secara paralel (PRD §11.2).
 * Loader dilarang mengembalikan `Response`.
 */
export async function runLoaders(
  entries: ReadonlyArray<LoaderEntry>,
  args: LoaderRunArgs,
): Promise<Record<string, unknown>> {
  const results = await Promise.all(
    entries.map(async (entry): Promise<readonly [string, unknown]> => {
      const loader = entry.module.loader;
      if (loader === undefined) {
        return [entry.file, undefined] as const;
      }
      const value = await loader(args);
      if (value instanceof Response) {
        throw new MoonsError({
          code: "E_INTERNAL",
          file: entry.file,
          message: "loader mengembalikan `Response`",
          details:
            "Loader wajib mengembalikan plain data yang bisa di-devalue; `Response` hanya boleh dari middleware.",
          suggestions: [
            "Kembalikan objek data biasa dari loader",
            "Jika perlu mengubah status/header, gunakan middleware",
          ],
        });
      }
      return [entry.file, value] as const;
    }),
  );

  return Object.fromEntries(results);
}
