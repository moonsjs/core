import { expect, test } from "bun:test";
import { trailingSlashRedirect } from "@moonsjs/core";

test("M: trailingSlashRedirect — never/always + pengecualian", () => {
  // never: buang slash akhir.
  expect(trailingSlashRedirect("/about/", "never")).toBe("/about");
  expect(trailingSlashRedirect("/about//", "never")).toBe("/about");
  expect(trailingSlashRedirect("/about", "never")).toBeNull();

  // always: tambah slash akhir.
  expect(trailingSlashRedirect("/about", "always")).toBe("/about/");
  expect(trailingSlashRedirect("/about/", "always")).toBeNull();

  // pengecualian: root, internal, aset ber-titik.
  for (const policy of ["never", "always"] as const) {
    expect(trailingSlashRedirect("/", policy)).toBeNull();
    expect(trailingSlashRedirect("/_moons/fn/abc/", policy)).toBeNull();
    expect(trailingSlashRedirect("/assets/app.js", policy)).toBeNull();
    expect(trailingSlashRedirect("/file.css/", policy)).toBeNull();
  }
});
