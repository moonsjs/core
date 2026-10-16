/**
 * Fallback global `Ctx` untuk kompilasi mandiri package ini.
 * Aplikasi memakai deklarasi hasil typegen (§13: `.moons/context.d.ts`).
 * File ini di-exclude dari typecheck root (lihat tsconfig.json) agar tidak
 * bertabrakan dengan deklarasi hasil typegen di program aplikasi.
 */
declare global {
  type Ctx = unknown;
}

export {};
