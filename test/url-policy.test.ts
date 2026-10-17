import { describe, expect, test } from "bun:test";
import { applyTrailingSlash, trailingSlashRedirect } from "../src/url-policy";

describe("applyTrailingSlash", () => {
  test("never removes trailing slashes", () => {
    expect(applyTrailingSlash("/about/", "never")).toBe("/about");
    expect(applyTrailingSlash("/a/b/", "never")).toBe("/a/b");
    expect(applyTrailingSlash("/about", "never")).toBe("/about");
  });

  test("always appends a trailing slash", () => {
    expect(applyTrailingSlash("/about", "always")).toBe("/about/");
    expect(applyTrailingSlash("/a/b", "always")).toBe("/a/b/");
    expect(applyTrailingSlash("/about/", "always")).toBe("/about/");
  });

  test("root, framework paths, and assets are exempt", () => {
    expect(applyTrailingSlash("/", "always")).toBe("/");
    expect(applyTrailingSlash("/_moons/fn/abc", "always")).toBe("/_moons/fn/abc");
    expect(applyTrailingSlash("/assets/app.js", "always")).toBe("/assets/app.js");
    expect(applyTrailingSlash("/assets/app.js/", "never")).toBe("/assets/app.js/");
  });
});

describe("trailingSlashRedirect", () => {
  test("returns the canonical path only when a redirect is required", () => {
    expect(trailingSlashRedirect("/about", "always")).toBe("/about/");
    expect(trailingSlashRedirect("/about/", "always")).toBeNull();
    expect(trailingSlashRedirect("/about/", "never")).toBe("/about");
    expect(trailingSlashRedirect("/about", "never")).toBeNull();
    expect(trailingSlashRedirect("/", "always")).toBeNull();
  });
});
