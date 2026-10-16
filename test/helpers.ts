import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

/** Buat pohon direktori route di tmp dari daftar path relatif. */
export function makeRoutesDir(files: ReadonlyArray<string>): string {
  const dir = mkdtempSync(join(tmpdir(), "moons-routes-"));
  for (const file of files) {
    const full = join(dir, file);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, "// fixture\n");
  }
  return dir;
}

export function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), "moons-test-"));
}

export function writeFile(fullPath: string, content: string): void {
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, content);
}
