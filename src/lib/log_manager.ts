import fs from "fs";
import path from "path";

export interface LogEntry {
  timestamp: string;
  operation: "ingest" | "query" | "write" | "lint" | "init" | "fix";
  source?: string;
  metadata: Record<string, unknown>;
}

export function appendLog(vaultPath: string, entry: LogEntry): void {
  const logPath = path.join(vaultPath, "_log.md");
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const timeStr = now.toTimeString().slice(0, 5);

  // Build entry lines
  let lines = `\n- ${timeStr} | ${entry.operation}`;
  if (entry.source) lines += ` | source:${entry.source}`;

  for (const [k, v] of Object.entries(entry.metadata)) {
    if (Array.isArray(v)) {
      lines += `\n  ${k}: [${v.join(", ")}]`;
    } else {
      lines += `\n  ${k}: ${v}`;
    }
  }
  lines += "\n";

  // Đảm bảo có header cho ngày hôm nay
  if (!fs.existsSync(logPath)) {
    fs.writeFileSync(logPath, "# Wiki Change Log\n\n<!-- File này do MCP tự động quản lý. KHÔNG edit thủ công. -->\n\n");
  }

  const content = fs.readFileSync(logPath, "utf-8");
  const dateSectionHeader = `## ${dateStr}`;

  if (!content.includes(dateSectionHeader)) {
    fs.appendFileSync(logPath, `\n${dateSectionHeader}\n`);
  }

  fs.appendFileSync(logPath, lines);
}

export function updateLastLintAnchor(vaultPath: string): void {
  const logPath = path.join(vaultPath, "_log.md");
  if (!fs.existsSync(logPath)) return;

  const isoNow = new Date().toISOString();
  let content = fs.readFileSync(logPath, "utf-8");

  const anchorRegex = /<!-- LAST_LINT: .*? -->/g;
  const newAnchor = `<!-- LAST_LINT: ${isoNow} -->`;

  if (anchorRegex.test(content)) {
    content = content.replace(/<!-- LAST_LINT: .*? -->/g, newAnchor);
  } else {
    content += `\n${newAnchor}\n`;
  }

  fs.writeFileSync(logPath, content, "utf-8");
}
