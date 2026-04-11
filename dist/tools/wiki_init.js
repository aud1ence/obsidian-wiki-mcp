import fs from "fs";
import path from "path";
import { z } from "zod";
import { isVaultInitialized, listWikiPages } from "../lib/vault.js";
const SCHEMA_CONTENT = `# Wiki Schema — obsidian-wiki-mcp

## Vault Structure

\`\`\`
_wiki/          ← LLM-maintained pages, organized by topic
  infra/        ← servers, network, deployment
  ops/          ← incidents, runbooks, troubleshooting
  concepts/     ← technical concepts, architecture
  projects/     ← per-project knowledge
_sources/       ← raw immutable inputs (paste vào đây, không edit)
_schema.md      ← file này — đọc trước khi làm bất cứ điều gì
_log.md         ← append-only, KHÔNG edit thủ công
_index.md       ← catalog tự động, KHÔNG edit thủ công
\`\`\`

## Page Format (bắt buộc)

Mỗi page trong _wiki/ phải có cấu trúc:

\`\`\`markdown
---
tldr: "<1 câu, ≤ 100 tokens, plain text>"
tags: [tag1, tag2]
related: ["[[path/to/page]]"]
last_modified: "YYYY-MM-DD"
last_linted: "YYYY-MM-DD"
dirty: false
source: "claude-session-X | kiro-session-X | manual"
---

## TL;DR

<Tóm tắt ngắn, 2-4 câu. Đây là tầng shallow.>

---

## Detail

<Nội dung đầy đủ: nguyên nhân, steps, examples, references.>
\`\`\`

## Tag Taxonomy

Infra: infra, k8s, freeswitch, redis, mongodb, minio, mysql
Ops: incident, runbook, troubleshoot, backup, deploy
Projects: xcall, mobiva, vtt
Scope: server-35, server-pbx1, prod, staging

## Ingest Rules

1. Tìm ≤ 5 pages liên quan nhất qua wiki_query trước
2. Quyết định: cập nhật page cũ hay tạo page mới?
3. Luôn cập nhật related links 2 chiều
4. Cập nhật _index.md sau khi ghi

## Lint Rules

- ORPHAN: page không có backlink sau 7 ngày
- MISSING_TLDR: page không có ## TL;DR section
- STALE: last_modified > 90 ngày và dirty = true
- BROKEN_LINK: [[link]] trỏ đến page không tồn tại

## Naming Convention

- Dùng kebab-case: redis-oom.md, server-35-setup.md
- Incident pages: ops/incident-YYYY-MM-DD-<slug>.md
`;
const LOG_CONTENT = `# Wiki Change Log

<!-- File này do MCP tự động quản lý. KHÔNG edit thủ công. -->
`;
const INDEX_CONTENT = `# Wiki Index

<!-- File này do MCP tự động quản lý. KHÔNG edit thủ công. -->

| path | tldr | tags | last_modified |
|------|------|------|---------------|
`;
export function registerWikiInit(server, ctx) {
    server.registerTool("wiki_init", {
        description: "Khởi tạo vault: tạo _schema.md, _log.md, _index.md và cấu trúc thư mục",
        inputSchema: {
            vault_path: z.string().optional().describe("Path tới Obsidian vault (override config nếu cần). Để trống để dùng config mặc định."),
        },
    }, async (args) => {
        const vaultPath = args.vault_path
            ? path.resolve(args.vault_path.replace(/^~/, process.env.HOME ?? ""))
            : ctx.config.vaultPath;
        const alreadyInit = isVaultInitialized(vaultPath);
        const dirs = [
            vaultPath,
            path.join(vaultPath, "_wiki"),
            path.join(vaultPath, "_wiki", "infra"),
            path.join(vaultPath, "_wiki", "ops"),
            path.join(vaultPath, "_wiki", "concepts"),
            path.join(vaultPath, "_wiki", "projects"),
            path.join(vaultPath, "_sources"),
        ];
        const created = [];
        for (const dir of dirs) {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
                created.push(path.relative(vaultPath, dir) || ".");
            }
        }
        const files = [
            [path.join(vaultPath, "_schema.md"), SCHEMA_CONTENT],
            [path.join(vaultPath, "_log.md"), LOG_CONTENT],
            [path.join(vaultPath, "_index.md"), INDEX_CONTENT],
        ];
        for (const [filePath, content] of files) {
            if (!fs.existsSync(filePath)) {
                fs.writeFileSync(filePath, content, "utf-8");
                created.push(path.relative(vaultPath, filePath));
            }
        }
        const existingPages = listWikiPages(vaultPath);
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({
                        status: alreadyInit ? "already_initialized" : "success",
                        vault_path: vaultPath,
                        created,
                        existing_pages_found: existingPages.length,
                        migrated: 0,
                        message: alreadyInit
                            ? "Vault đã được init trước đó. Run wiki_lint_scan() để kiểm tra vault health."
                            : "Vault initialized. Run wiki_lint_scan() to check vault health.",
                    }, null, 2),
                },
            ],
        };
    });
}
//# sourceMappingURL=wiki_init.js.map