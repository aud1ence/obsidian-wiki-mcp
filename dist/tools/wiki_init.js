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
_sources/       ← raw immutable inputs (paste here, do not edit)
_schema.md      ← this file — read before doing anything
_log.md         ← append-only, DO NOT edit manually
_index.md       ← auto-catalog, DO NOT edit manually
\`\`\`

## Page Format (Mandatory)

Each page in _wiki/ must have the following structure:

\`\`\`markdown
---
tldr: "<1 sentence, ≤ 100 tokens, plain text>"
tags: [tag1, tag2]
related: ["[[path/to/page]]"]
last_modified: "YYYY-MM-DD"
last_linted: "YYYY-MM-DD"
dirty: false
source: "claude-session-X | kiro-session-X | manual"
---

## TL;DR

<Short summary, 2-4 sentences. This is the shallow layer.>

---

## Detail

<Full content: cause, steps, examples, references.>
\`\`\`

## Tag Taxonomy

Infra: infra, k8s, freeswitch, redis, mongodb, minio, mysql
Ops: incident, runbook, troubleshoot, backup, deploy
Projects: xcall, mobiva, vtt
Scope: server-35, server-pbx1, prod, staging

## Ingest Rules

1. Find ≤ 5 most relevant pages via wiki_query first
2. Decide: update existing page or create a new one?
3. Always update related links bidirectionally
4. Update _index.md after writing

## Lint Rules

- ORPHAN: page with no backlinks after 7 days
- MISSING_TLDR: page missing ## TL;DR section
- STALE: last_modified > 90 days and dirty = true
- BROKEN_LINK: [[link]] pointing to a non-existent page

## Naming Convention

- Use kebab-case: redis-oom.md, server-35-setup.md
- Incident pages: ops/incident-YYYY-MM-DD-<slug>.md
`;
const LOG_CONTENT = `# Wiki Change Log

<!-- This file is automatically managed by MCP. DO NOT edit manually. -->
`;
const INDEX_CONTENT = `# Wiki Index

<!-- This file is automatically managed by MCP. DO NOT edit manually. -->

| path | tldr | tags | last_modified |
|------|------|------|---------------|
`;
export function registerWikiInit(server, ctx) {
    server.registerTool("wiki_init", {
        description: "Initialize vault: create _schema.md, _log.md, _index.md and directory structure",
        inputSchema: {
            vault_path: z.string().optional().describe("Path to Obsidian vault (override config if needed). Leave empty to use default config."),
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
                            ? "Vault already initialized. Run wiki_lint_scan() to check vault health."
                            : "Vault initialized. Run wiki_lint_scan() to check vault health.",
                    }, null, 2),
                },
            ],
        };
    });
}
//# sourceMappingURL=wiki_init.js.map