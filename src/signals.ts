import { MoonsError } from "./errors";

/**
 * Sinyal routing (PRD Addendum B.2) — **client-safe** (tanpa import node:*).
 * Dipakai loader/meta; ditangkap runtime server (redirect → response redirect,
 * notFound → halaman `_404`). Guard memakai brand Symbol.for agar tetap aman
 * walau modul termuat ganda (src/dist) di lingkungan berbeda.
 */

export type RedirectStatus = 301 | 302 | 303 | 307 | 308;

const REDIRECT_STATUSES: ReadonlyArray<number> = [301, 302, 303, 307, 308];
const REDIRECT_BRAND = Symbol.for("moons.redirectSignal");
const NOT_FOUND_BRAND = Symbol.for("moons.notFoundSignal");

export class RedirectSignal extends Error {
  readonly to: string;
  readonly status: RedirectStatus;
  readonly [REDIRECT_BRAND] = true;

  constructor(to: string, status: RedirectStatus = 302) {
    super(`redirect ${status} → ${to}`);
    this.name = "RedirectSignal";
    this.to = to;
    this.status = status;
  }
}

export class NotFoundSignal extends Error {
  readonly [NOT_FOUND_BRAND] = true;

  constructor() {
    super("notFound()");
    this.name = "NotFoundSignal";
  }
}

/** Redirect dari loader/meta (relatif di-resolve terhadap request URL). */
export function redirect(to: string, status: RedirectStatus = 302): never {
  if (typeof to !== "string" || to.trim().length === 0) {
    throw new MoonsError({
      code: "E_INTERNAL",
      message: "`redirect(to)` requires a non-empty destination URL",
      details: "Redirect signals are used in loaders/meta.",
      suggestions: ["Example: `redirect(\"/login\")`, or `redirect(\"/\", 303)`"],
    });
  }
  if (!REDIRECT_STATUSES.includes(status)) {
    throw new MoonsError({
      code: "E_INTERNAL",
      message: `unsupported redirect status \`${status}\``,
      details: `Supported statuses: ${REDIRECT_STATUSES.join(", ")}.`,
      suggestions: ["Use 302 (default) or 303/307/308 as needed"],
    });
  }
  throw new RedirectSignal(to, status);
}

/** Tandai halaman tidak ditemukan → render `_404` dengan status 404. */
export function notFound(): never {
  throw new NotFoundSignal();
}

export function isRedirectSignal(error: unknown): error is RedirectSignal {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as Record<symbol, unknown>)[REDIRECT_BRAND] === true
  );
}

export function isNotFoundSignal(error: unknown): error is NotFoundSignal {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as Record<symbol, unknown>)[NOT_FOUND_BRAND] === true
  );
}
