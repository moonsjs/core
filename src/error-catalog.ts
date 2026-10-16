import type { MoonsErrorCode } from "./errors";

/**
 * Katalog error machine-readable (PRD Addendum B.6).
 * Wajib memuat SEMUA kode `MOONS_ERROR_CODES` (dijaga unit test) — dipakai
 * `moons errors --json` dan MCP `explain_error`.
 */
export interface ErrorCatalogEntry {
  code: MoonsErrorCode;
  /** Kapan error ini muncul. */
  trigger: string;
  /** Penjelasan singkat mengapa ini error. */
  details: string;
  /** Saran perbaikan (format §15.1). */
  suggestions: string[];
}

export const ERROR_CATALOG: ReadonlyArray<ErrorCatalogEntry> = [
  {
    code: "E_API_HANDLER_INVALID",
    trigger:
      "Modul `src/api/**` mengekspor selain handler method (`default`, helper, konstanta), handler bukan fungsi, atau handler tidak mengembalikan `Response`.",
    details: "Modul API hanya boleh mengekspor handler method: `GET|HEAD|POST|PUT|PATCH|DELETE|OPTIONS`.",
    suggestions: [
      "Export handler sebagai `export const GET = (args) => new Response(...)`",
      "Pindahkan helper/konstanta ke `src/server/**` atau `src/shared/**`",
    ],
  },
  {
    code: "E_API_ROUTE_CONFLICT",
    trigger:
      "Dua file `src/api` resolve ke URL yang sama, atau `[...rest]` bukan segmen terakhir.",
    details: "Tidak ada fallback untuk konflik route API.",
    suggestions: ["Ganti nama segmen dinamis (`[id]` vs `[uid]`)", "Hapus salah satu file"],
  },
  {
    code: "E_RESPONSE_HEADER_INVALID",
    trigger:
      "`setHeader`/`appendHeader`/`setCookie`/`deleteCookie` menerima nama/nilai ilegal: CRLF, karakter kontrol, nama bukan token, header framing (`content-length`, `transfer-encoding`, …), atau `maxAge` bukan angka ≥ 0.",
    details:
      "Validasi mencegah HTTP response splitting dan header yang merusak protokol.",
    suggestions: [
      "Hapus baris baru/karakter kontrol dari nilai",
      "Gunakan nama header/cookie yang valid; `maxAge` dalam detik",
    ],
  },
  {
    code: "E_RESPONSE_OUTSIDE_REQUEST",
    trigger:
      "Helper respons dipanggil di luar request (saat build/prerender, komponen client, atau tooling tanpa store).",
    details: "Helper respons request-scoped; tidak ada `Response` untuk diubah.",
    suggestions: [
      "Pindahkan pemanggilan ke loader atau handler `*.server.ts`",
      "Untuk nilai publik, gunakan `import.meta.env`",
    ],
  },
  {
    code: "E_MIDDLEWARE_INVALID",
    trigger:
      "`_middleware.ts` tanpa `export default`, default bukan fungsi, memanggil `next()` lebih dari sekali, atau tidak mengembalikan `Response`.",
    details: "Middleware direktori mengikuti bentuk `Middleware`.",
    suggestions: [
      "Export default `(args) => Promise<Response>` dan kembalikan `await next()`",
      "Periksa pemanggilan `next()` — wajib tepat sekali",
    ],
  },
  {
    code: "E_PRERENDER_NO_PATHS",
    trigger: "Route dynamic memakai `export const prerender = true` tanpa `export const paths`.",
    details: "Prerender butuh daftar param untuk merender tiap path.",
    suggestions: [
      "Tambahkan `export const paths = () => [{ id: \"…\" }]`",
      "Atau hapus `prerender` agar dirender SSR saat request",
    ],
  },
  {
    code: "E_PRERENDER_LEAK",
    trigger:
      "HTML/​payload hasil prerender memuat canary `leakTest.canary` atau nilai env mirip-rahasia.",
    details:
      "File statis permanen — kebocoran ke prerender tidak bisa dimitigasi runtime; build dihentikan.",
    suggestions: [
      "Jangan mengembalikan nilai env rahasia dari loader yang di-prerender",
      "Matikan `prerender` untuk route itu atau ambil datanya via serverFn request-time",
    ],
  },
  {
    code: "E_PRERENDER_INVALID",
    trigger:
      "`prerender` bukan boolean, `paths` bukan array objek param yang valid (nama/tipe tak cocok), path traversal (`..`), `redirect()` saat prerender, atau status non-200 selain 404.",
    details: "Kontrak prerender mengikuti.",
    suggestions: [
      "Perbaiki bentuk `paths`/param agar cocok dengan pola route",
      "Jangan memakai `redirect()` pada route yang di-prerender",
    ],
  },
  {
    code: "E_ISR_INVALID",
    trigger: "`export const revalidate` bukan number >= 0, atau dipakai tanpa `export const prerender = true`.",
    details: "ISR berbasis file: revalidate(detik) + prerender.",
    suggestions: [
      "Gunakan angka detik, mis. `export const revalidate = 60`",
      "Tambahkan `export const prerender = true` pada page yang sama",
    ],
  },
  {
    code: "E_SERVER_IMPORT_IN_CLIENT",
    trigger: "Client meng-import nilai NON-serverFn dari `*.server.ts` (atau default/`* as`).",
    details: "Hanya `serverFn` yang boleh menyeberang ke client; sisanya diganti stub RPC.",
    suggestions: [
      "Buat server function yang mengembalikan data yang dibutuhkan",
      "Jika nilainya memang publik, definisikan ulang konstanta itu di modul yang boleh masuk client (jangan memindahkan nilai rahasia)",
    ],
  },
  {
    code: "E_SCHEMA_LOCAL_REF",
    trigger: "Schema `input`/`output` serverFn merujuk deklarasi lokal (`const`/`function`/`class`) di file `*.server.ts`.",
    details:
      "Stub client hanya membawa import + ekspresi schema; deklarasi lokal dibuang sehingga referensinya `undefined` di browser. Pesan error memuat contoh diff 'Sebelum/Sesudah' (inline atau pindah ke `src/shared/schemas.ts`).",
    suggestions: [
      "Inline schema langsung di argumen `serverFn({ input, output })`",
      "Impor schema dari modul bersama yang client-safe (mis. `src/shared/schemas.ts`)",
    ],
  },
  {
    code: "E_SCHEMA_SERVER_REF",
    trigger:
      "Schema `input`/`output` serverFn merujuk nilai non-serverFn yang diimpor dari file `*.server.ts` lain.",
    details:
      "Stub client tidak mengekspor nilai server, sehingga referensi schema gagal — dulu muncul sebagai error mentah bundler (`MISSING_EXPORT`).",
    suggestions: [
      "Pindahkan konstanta/schema ke modul client-safe (mis. `src/shared/schemas.ts`)",
      "Lakukan validasi tambahan di handler server, bukan di ekspresi schema",
    ],
  },
  {
    code: "E_ROUTE_CONFLICT",
    trigger: "Dua file route resolve ke URL yang sama.",
    details: "Tidak ada fallback untuk konflik route.",
    suggestions: ["Ganti salah satu dynamic segment menjadi static", "Hapus salah satu file"],
  },
  {
    code: "E_ROUTE_EXPORT_INVALID",
    trigger:
      "Export ilegal di modul route; `_error`/`_404` di non-root; `[...rest]` bukan segmen terakhir; layout export `meta`.",
    details: "Page hanya boleh export `default|loader|meta`; layout `default|loader`; `_error`/`_404` hanya `default`.",
    suggestions: ["Hapus export tambahan", "Pindahkan helper/tipe ke `src/shared/`"],
  },
  {
    code: "E_CONFIG_INVALID",
    trigger: "`moons.config.ts` tidak valid: key tak dikenal, plugin di luar bentuk atau routesDir tidak ditemukan.",
    details: "Config adalah kontrak server-side.",
    suggestions: ["Perbaiki key yang ditunjukkan pesan", "Ikuti bentuk `MoonsPlugin` (lebih dari itu ditolak)"],
  },
  {
    code: "E_RPC_INVALID_INPUT",
    trigger: "Input pemanggilan serverFn tidak lolos schema `input` (divalidasi di client DAN server).",
    details: "Input server function harus lolos validasi schema `input`.",
    suggestions: ["Periksa tipe argumen di pemanggil", "Perbarui schema `input`"],
  },
  {
    code: "E_RPC_INVALID_OUTPUT",
    trigger: "Nilai kembalian handler serverFn tidak lolos schema `output`.",
    details: "Return value handler harus lolos validasi schema `output`.",
    suggestions: ["Perbaiki return value handler", "Perbarui schema `output`"],
  },
  {
    code: "E_RPC_BAD_ORIGIN",
    trigger: "Request RPC datang dari origin yang tidak ada di `security.originWhitelist`.",
    details: "Proteksi CSRF/cross-site untuk endpoint RPC.",
    suggestions: ["Tambahkan origin yang sah ke `security.originWhitelist`", "Pastikan pemanggilan dari halaman sendiri (same-origin)"],
  },
  {
    code: "E_RPC_MISSING_HEADER",
    trigger: "Request ke `/_moons/fn/<hash>` tanpa header `x-moons: 1`.",
    details: "Semua RPC wajib menyertakan header ini.",
    suggestions: ["Gunakan `serverFn()` dari client, jangan fetch manual"],
  },
  {
    code: "E_RPC_BODY_TOO_LARGE",
    trigger: "Body request RPC melebihi `security.bodyLimitBytes` (default 1.000.000 byte).",
    details: "Batas ukuran melindungi server dari payload raksasa.",
    suggestions: ["Naikkan `security.bodyLimitBytes` bila memang perlu", "Kirim data lebih kecil / upload lewat endpoint khusus"],
  },
  {
    code: "E_ENV_IN_CLIENT",
    trigger: "`env()` dipanggil di modul yang masuk bundle client.",
    details: "`env` hanya legal di server.",
    suggestions: [
      "Pindahkan pemanggilan ke dalam serverFn atau `*.server.ts`",
      "Gunakan `import.meta.env.VITE_*` untuk nilai publik",
    ],
  },
  {
    code: "E_FORBIDDEN_SERVER_IMPORT",
    trigger:
      "Import `node:*`/`bun:*`, atau paket server-only (daftar bawaan, `security.serverOnlyPackages`, atau marker `\"moons\": { \"serverOnly\": true }` di package.json), di modul yang masuk bundle client (termasuk `import()` dinamis dan re-export).",
    details:
      "Modul/paket server-only hanya boleh di-import dari `*.server.ts`. Import type-only dikecualikan.",
    suggestions: [
      "Pindahkan operasi tersebut ke `*.server.ts` dan panggil lewat serverFn",
      "Atau ganti/hapus import tersebut di modul client",
    ],
  },
  {
    code: "E_INTERNAL",
    trigger: "Error framework: build gagal, loader mengembalikan `Response`, status redirect tidak valid, dsb.",
    details: "Pesan berisi penyebab spesifik; ini fallback katalog.",
    suggestions: ["Baca pesan + lokasi yang ditunjukkan", "Jalankan `moons check` dan perbaiki langkah yang merah"],
  },
];

export function findErrorEntry(code: string): ErrorCatalogEntry | undefined {
  return ERROR_CATALOG.find((entry) => entry.code === code);
}
