/**
 * Addendum M + O: trailing-slash policy.
 *
 * `applyTrailingSlash` returns the canonical pathname (used by Link/navigate on
 * both server and client). `trailingSlashRedirect` returns the canonical path
 * only when a 308 is required.
 *
 * Exemptions: root `/`, internal `/_moons/**`, and paths whose last segment
 * contains a dot (static assets).
 */
function isTrailingSlashExempt(pathname: string): boolean {
  if (pathname === "/" || pathname.length === 0) {
    return true;
  }
  if (pathname.startsWith("/_moons/")) {
    return true;
  }
  const withoutTrailing = pathname.replace(/\/+$/, "");
  const lastSegment = withoutTrailing.split("/").pop() ?? "";
  return lastSegment.includes(".");
}

/** Return the canonical form of `pathname` for the given policy. */
export function applyTrailingSlash(
  pathname: string,
  policy: "never" | "always",
): string {
  if (isTrailingSlashExempt(pathname)) {
    return pathname;
  }
  const hasTrailingSlash = pathname.endsWith("/");
  if (policy === "never" && hasTrailingSlash) {
    return pathname.replace(/\/+$/, "");
  }
  if (policy === "always" && !hasTrailingSlash) {
    return `${pathname}/`;
  }
  return pathname;
}

/** Return the canonical path when a redirect is required, or `null`. */
export function trailingSlashRedirect(
  pathname: string,
  policy: "never" | "always",
): string | null {
  const canonical = applyTrailingSlash(pathname, policy);
  return canonical === pathname ? null : canonical;
}
