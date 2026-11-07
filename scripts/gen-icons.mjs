/**
 * Gera src/components/icons.generated.ts a partir do Material Symbols (outlined, peso 400),
 * o conjunto de ícones indicado no brand book da Selbetti. Só os ícones listados entram no bundle.
 * Uso: npm run icons   (depois de editar a lista abaixo)
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const NAMES = [
  "dashboard", "group", "settings", "history", "bar_chart", "grid_view", "compare_arrows", "inventory_2",
  "lock_open", "logout", "menu", "close", "check_circle", "error", "info", "warning", "download", "add",
  "delete", "edit", "visibility", "chevron_left", "chevron_right", "keyboard_arrow_down", "content_copy", "send",
  "search", "assignment", "list_alt", "upload_file", "arrow_back", "arrow_forward", "progress_activity",
  "inbox", "tune", "task_alt", "schedule", "star", "target", "monitoring", "person", "mail", "key", "refresh", "block", "undo",
];

const out = {};
for (const n of NAMES) {
  const svg = readFileSync(path.join(root, "node_modules/@material-symbols/svg-400/outlined", `${n}.svg`), "utf8");
  const d = /<path d="([^"]+)"/.exec(svg)?.[1];
  if (!d) throw new Error(`Ícone sem path: ${n}`);
  out[n] = d;
}
const body = `// Gerado por scripts/gen-icons.mjs — não edite à mão. Fonte: Material Symbols (Google), licença Apache 2.0.
export const ICON_PATHS = ${JSON.stringify(out, null, 2)} as const;
export type IconName = keyof typeof ICON_PATHS;
`;
writeFileSync(path.join(root, "src/components/icons.generated.ts"), body);
console.log(`${NAMES.length} ícones gerados.`);
