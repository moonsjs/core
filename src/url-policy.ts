/**
 * Addendum M: kebijakan trailing slash (H.8). Mengembalikan path kanonik bila
 * `pathname` tidak kanonik (butuh redirect 308), atau `null` bila sudah
 * kanonik / dikecualikan.
 *
 * Pengecualian: root `/`, endpoint internal `/_moons/**`, dan path yang
 * segmen terakhirnya memuat titik (aset/file) — path itu tidak pernah
 * di-redirect.
 */
export function trailingSlashRedirect(
  pathname: string,
  policy: "never" | "always",
): string | null {
  if (pathname === "/" || pathname.length === 0) {
    return null;
  }
  if (pathname.startsWith("/_moons/")) {
    return null;
  }
  // Segmen terakhir dihitung TANPA slash akhir (`/file.css/` tetap dianggap aset).
  const withoutTrailing = pathname.replace(/\/+$/, "");
  const lastSegment = withoutTrailing.split("/").pop() ?? "";
  if (lastSegment.includes(".")) {
    return null;
  }
  const hasTrailingSlash = pathname.endsWith("/");
  if (policy === "never" && hasTrailingSlash) {
    return pathname.replace(/\/+$/, "");
  }
  if (policy === "always" && !hasTrailingSlash) {
    return `${pathname}/`;
  }
  return null;
}
