/**
 * LLM_CONTEXT.md 生成: 現行アプリの HTML/CSS/JS/Worker/SQL を1ファイルに結合（NotebookLM 向け）
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const files = [
  "index.html",
  "styles.css",
  "print-list.css",
  "schema.sql",
  "CloudflareWorkers_worker.js",
  "sw.js",
  "js/config.js",
  "js/constants/storage.js",
  "js/constants/timing.js",
  "js/constants/ui.js",
  "js/constants/defaults.js",
  "js/constants/column-definitions.js",
  "js/constants/messages.js",
  "js/constants/index.js",
  "js/globals.js",
  "js/utils.js",
  "js/services/qr-generator.js",
  "js/services/csv.js",
  "js/layout.js",
  "js/filters.js",
  "js/board.js",
  "js/vacations.js",
  "js/offices.js",
  "js/firebase-config.js",
  "js/firebase-auth.js",
  "js/auth.js",
  "js/sync.js",
  "js/admin.js",
  "js/tools.js",
  "js/notices.js",
  "main.js",
  "package.json",
  "wrangler.toml",
];

function extLang(f) {
  if (f.endsWith(".html")) return "html";
  if (f.endsWith(".css")) return "css";
  if (f.endsWith(".sql")) return "sql";
  if (f.endsWith(".json")) return "json";
  if (f.endsWith(".toml")) return "toml";
  return "javascript";
}

const fileListMd = files.map((f) => `- \`${f.replace(/\\/g, "/")}\``).join("\n");
const headerPath = path.join(__dirname, "LLM_CONTEXT_header.md");
const headerTemplate = fs.readFileSync(headerPath, "utf8");
const header = headerTemplate.replace("{{FILE_LIST}}", fileListMd);

let out = header.replace(/\r\n/g, "\n");
for (const rel of files) {
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) {
    console.error("Missing:", rel);
    process.exit(1);
  }
  const body = fs.readFileSync(abs, "utf8").replace(/\r\n/g, "\n");
  out += `### ${rel.replace(/\\/g, "/")}\n\n`;
  out += "```" + extLang(rel) + "\n";
  out += body;
  out += "\n```\n\n";
}

const outPath = path.join(root, "LLM_CONTEXT.md");
fs.writeFileSync(outPath, out, "utf8");
console.log("Wrote", outPath, "size", fs.statSync(outPath).size);
