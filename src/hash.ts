import { createHash } from "node:crypto";
import { relative } from "node:path";

/**
 * Hash stabil serverFn (PRD §11.3, §12.5):
 * `sha256("<posix-relative-path>#<export-name>")` hex, 16 karakter pertama.
 * Path selalu memakai `/` sebagai separator, tidak peduli OS.
 */
export function computeFnHash(projectRoot: string, file: string, exportName: string): string {
  const relativePath = relative(projectRoot, file).split("\\").join("/");
  return createHash("sha256").update(`${relativePath}#${exportName}`).digest("hex").slice(0, 16);
}

/** Key stabil untuk `fn-registry.json` dan registry global. */
export function fnRegistryKey(projectRoot: string, file: string, exportName: string): string {
  const relativePath = relative(projectRoot, file).split("\\").join("/");
  return `${relativePath}#${exportName}`;
}
