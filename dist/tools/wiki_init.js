import fs from "fs";
import path from "path";
import { z } from "zod";
import { isVaultInitialized, listWikiPages } from "../lib/vault.js";
export const DEFAULT_FOLDERS = [
    { name: "systems", description: "tools, platforms, infrastructure, architecture" },
    { name: "guides", description: "how-to, runbooks, procedures, troubleshooting" },
    { name: "topics", description: "concepts, theory, background knowledge, patterns" },
    { name: "work", description: "projects, initiatives, features, ongoing work" },
];
function buildSchemaContent(folders) {
    const folderLines = folders
        .map((f) => `  ${f.name}/`.padEnd(16) + `← ${f.description}`)
        .join("\n");
    return `# Wiki Schema — obsidian-wiki-mcp

## Vault Structure

\`\`\`
_wiki/          ← all wiki pages
${folderLines}
_sources/       ← raw immutable inputs (paste here, do not edit)
_schema.md      ← this file — read before doing anything
_log.md         ← append-only, DO NOT edit manually
_index.md       ← auto-catalog, DO NOT edit manually
\`\`\`

Sub-folders are encouraged. Create them freely within the theme folders above.
Example: _wiki/systems/databases/redis-oom.md, _wiki/guides/deployment/k8s.md

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

- Use kebab-case: redis-oom.md, cluster-setup.md
- Incident/event pages: guides/incident-YYYY-MM-DD-<slug>.md
`;
}
const LOG_CONTENT = `# Wiki Change Log

<!-- This file is automatically managed by MCP. DO NOT edit manually. -->
`;
const INDEX_CONTENT = `# Wiki Index

<!-- This file is automatically managed by MCP. DO NOT edit manually. -->

| path | tldr | tags | last_modified |
|------|------|------|---------------|
`;
/** Scan top-level dirs in vaultPath, excluding _* dirs and hidden dirs. */
function scanExistingFolders(vaultPath) {
    if (!fs.existsSync(vaultPath))
        return [];
    return fs
        .readdirSync(vaultPath, { withFileTypes: true })
        .filter((e) => e.isDirectory() &&
        !e.name.startsWith("_") &&
        !e.name.startsWith("."))
        .map((e) => ({ name: e.name, description: "existing folder" }));
}
/** Count .md files recursively in a directory. */
function countMdFiles(dir) {
    let count = 0;
    const walk = (d) => {
        for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
            if (entry.isDirectory())
                walk(path.join(d, entry.name));
            else if (entry.name.endsWith(".md") && !entry.name.startsWith("."))
                count++;
        }
    };
    walk(dir);
    return count;
}
export function registerWikiInit(server, ctx) {
    server.registerTool("wiki_init", {
        description: "Initialize vault: create _schema.md, _log.md, _index.md and directory structure. " +
            "Supports custom folder definitions, scanning existing structure, and re-initializing schema.",
        inputSchema: {
            vault_path: z
                .string()
                .optional()
                .describe("Path to vault (overrides config). Leave empty to use default."),
            folders: z
                .array(z.object({
                name: z.string().describe("Folder name, e.g. 'systems'"),
                description: z.string().describe("One-line description of what goes here"),
            }))
                .optional()
                .describe("Custom folder definitions under _wiki/. " +
                "If omitted and scan_existing=false, defaults to: systems, guides, topics, work."),
            scan_existing: z
                .boolean()
                .optional()
                .describe("If true, scan vault path for existing top-level directories and use them as the folder structure. " +
                "Overrides the 'folders' param. Useful when the user already has a folder layout they want to keep."),
            force_reinit: z
                .boolean()
                .optional()
                .describe("If true, overwrite _schema.md even when the vault is already initialized. " +
                "Existing pages in _wiki/ are NOT moved or deleted. Run wiki_reindex() afterward."),
        },
    }, async (args) => {
        const vaultPath = args.vault_path
            ? path.resolve(args.vault_path.replace(/^~/, process.env.HOME ?? ""))
            : ctx.config.vaultPath;
        const alreadyInit = isVaultInitialized(vaultPath);
        // Bail early if already initialized and not forcing
        if (alreadyInit && !args.force_reinit) {
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            status: "already_initialized",
                            vault_path: vaultPath,
                            created: [],
                            existing_pages_found: listWikiPages(vaultPath).length,
                            message: "Vault already initialized. Use force_reinit=true to overwrite _schema.md, or run wiki_lint_scan() to check vault health.",
                        }, null, 2),
                    },
                ],
            };
        }
        // Resolve folder definitions
        let folders;
        if (args.scan_existing) {
            const detected = scanExistingFolders(vaultPath);
            folders = detected.length > 0 ? detected : DEFAULT_FOLDERS;
        }
        else if (args.folders && args.folders.length > 0) {
            folders = args.folders;
        }
        else {
            folders = DEFAULT_FOLDERS;
        }
        const created = [];
        // Create directories (only when not force_reinit — folders already exist in that case)
        if (!alreadyInit) {
            const dirs = [
                vaultPath,
                path.join(vaultPath, "_wiki"),
                ...folders.map((f) => path.join(vaultPath, "_wiki", f.name)),
                path.join(vaultPath, "_sources"),
            ];
            for (const dir of dirs) {
                if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir, { recursive: true });
                    created.push(path.relative(vaultPath, dir) || ".");
                }
            }
        }
        // Write _schema.md (always in force_reinit, only if missing otherwise)
        const schemaPath = path.join(vaultPath, "_schema.md");
        if (!fs.existsSync(schemaPath) || args.force_reinit) {
            fs.writeFileSync(schemaPath, buildSchemaContent(folders), "utf-8");
            created.push("_schema.md");
        }
        // Write _log.md and _index.md only if missing
        const staticFiles = [
            [path.join(vaultPath, "_log.md"), LOG_CONTENT],
            [path.join(vaultPath, "_index.md"), INDEX_CONTENT],
        ];
        for (const [filePath, content] of staticFiles) {
            if (!fs.existsSync(filePath)) {
                fs.writeFileSync(filePath, content, "utf-8");
                created.push(path.relative(vaultPath, filePath));
            }
        }
        const existingPages = listWikiPages(vaultPath);
        // Build scan summary if scan_existing was used
        const detectedFolders = args.scan_existing
            ? folders.map((f) => {
                const dir = path.join(vaultPath, f.name);
                const mdCount = fs.existsSync(dir) ? countMdFiles(dir) : 0;
                return { folder: f.name, md_files: mdCount };
            })
            : undefined;
        const migrationCandidates = detectedFolders
            ? detectedFolders.reduce((sum, d) => sum + d.md_files, 0)
            : undefined;
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({
                        status: alreadyInit ? "reinitialized" : "success",
                        vault_path: vaultPath,
                        folders: folders.map((f) => f.name),
                        created,
                        existing_pages_found: existingPages.length,
                        ...(detectedFolders && { detected_structure: detectedFolders }),
                        ...(migrationCandidates !== undefined && {
                            migration_candidates: migrationCandidates,
                        }),
                        message: alreadyInit
                            ? "Schema updated. Existing pages not moved. Run wiki_reindex() to rebuild the index."
                            : args.scan_existing && detectedFolders
                                ? `Vault initialized using detected folder structure. ${migrationCandidates} existing .md file(s) found — use wiki_import() to migrate them.`
                                : "Vault initialized. Run wiki_lint_scan() to check vault health.",
                    }, null, 2),
                },
            ],
        };
    });
}
//# sourceMappingURL=wiki_init.js.map