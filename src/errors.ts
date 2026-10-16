/** Error framework. Format pesan wajib mengikuti PRD §15.1. */

export const MOONS_ERROR_CODES = [
  "E_API_HANDLER_INVALID",
  "E_API_ROUTE_CONFLICT",
  "E_RESPONSE_HEADER_INVALID",
  "E_RESPONSE_OUTSIDE_REQUEST",
  "E_MIDDLEWARE_INVALID",
  "E_PRERENDER_NO_PATHS",
  "E_PRERENDER_LEAK",
  "E_PRERENDER_INVALID",
  "E_ISR_INVALID",
  "E_SERVER_IMPORT_IN_CLIENT",
  "E_SCHEMA_LOCAL_REF",
  "E_ROUTE_CONFLICT",
  "E_ROUTE_EXPORT_INVALID",
  "E_CONFIG_INVALID",
  "E_RPC_INVALID_INPUT",
  "E_RPC_INVALID_OUTPUT",
  "E_RPC_BAD_ORIGIN",
  "E_RPC_MISSING_HEADER",
  "E_RPC_BODY_TOO_LARGE",
  "E_ENV_IN_CLIENT",
  "E_FORBIDDEN_SERVER_IMPORT",
  "E_INTERNAL",
] as const;

export type MoonsErrorCode = (typeof MOONS_ERROR_CODES)[number];

export interface MoonsErrorInit {
  code: MoonsErrorCode;
  /** Deskripsi baris yang bermasalah (satu baris). */
  message: string;
  file?: string;
  line?: number;
  /** Anotasi setelah `file:line`, mis. nama export: `(getUser)`. */
  annotation?: string;
  /** Baris lokasi bebas, mis. `POST /_moons/fn/<hash>` (menimpa file:line). */
  location?: string;
  /** File tambahan yang terlibat (mis. dua file konflik route). */
  relatedFiles?: string[];
  /** Penjelasan singkat mengapa ini error (minimal satu paragraf). */
  details: string;
  suggestions: string[];
}

export class MoonsError extends Error {
  readonly code: MoonsErrorCode;
  readonly file: string | undefined;
  readonly line: number | undefined;
  readonly annotation: string | undefined;
  readonly location: string | undefined;
  readonly relatedFiles: string[];
  readonly details: string;
  readonly suggestions: string[];

  constructor(init: MoonsErrorInit) {
    // `message` memuat format lengkap §15.1: tool (Vite, dsb.) umumnya hanya
    // mencetak `error.message`, bukan `toString()`.
    super(formatMoonsError(init));
    this.name = "MoonsError";
    this.code = init.code;
    this.file = init.file;
    this.line = init.line;
    this.annotation = init.annotation;
    this.location = init.location;
    this.relatedFiles = init.relatedFiles ?? [];
    this.details = init.details;
    this.suggestions = init.suggestions;
  }

  /** Format PRD §15.1. */
  format(): string {
    return this.message;
  }

  override toString(): string {
    return this.message;
  }
}

function formatMoonsError(init: MoonsErrorInit): string {
  const lines: string[] = [`[moons] ${init.code}`, ""];
  const relatedFiles = init.relatedFiles ?? [];

  if (relatedFiles.length > 0) {
    for (const file of relatedFiles) {
      lines.push(file);
    }
  } else if (init.location !== undefined) {
    lines.push(init.location);
  } else if (init.file !== undefined) {
    const annotation = init.annotation === undefined ? "" : ` (${init.annotation})`;
    lines.push(`${init.file}:${init.line ?? 1}${annotation}`);
  }

  lines.push(`  ${init.message}`, "", init.details, "", "Saran:");
  init.suggestions.forEach((suggestion, index) => {
    lines.push(`  ${index + 1}. ${suggestion}`);
  });

  return lines.join("\n");
}
