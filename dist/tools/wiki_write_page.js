import fs from "fs";
import matter from "gray-matter";
import { z } from "zod";
import { upsertIndexRow } from "../lib/index_manager.js";
import { validateVaultPath, writePageSafe, isVaultInitialized, relPath, } from "../lib/vault.js";
import { appendLog } from "../lib/log_manager.js";
export function registerWikiWritePage(server, ctx) {
    server.registerTool("wiki_write_page", {
        description: "Write a page to the vault. Host LLM calls this after deciding on the content.",
        inputSchema: {
            path: z.string().describe("Relative path in the vault, e.g., _wiki/infra/redis-oom.md"),
            content: z.string().describe("Markdown content (including YAML frontmatter)"),
            source: z.string().describe("Source: claude-session-X, kiro-session-X, manual"),
        },
    }, async (args) => {
        const vaultPath = ctx.config.vaultPath;
        if (!isVaultInitialized(vaultPath)) {
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            status: "error",
                            code: "VAULT_NOT_INIT",
                            message: "Vault not initialized. Call wiki_init() first.",
                        }),
                    },
                ],
            };
        }
        let absPath;
        try {
            absPath = validateVaultPath(args.path, vaultPath);
        }
        catch (e) {
            const err = e;
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            status: "error",
                            code: err.code,
                            message: err.message,
                        }),
                    },
                ],
            };
        }
        const isNew = !fs.existsSync(absPath);
        let parsed;
        try {
            parsed = matter(args.content);
        }
        catch {
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            status: "error",
                            code: "INVALID_FRONTMATTER",
                            message: "Could not parse frontmatter from content",
                        }),
                    },
                ],
            };
        }
        const today = new Date().toISOString().slice(0, 10);
        const fm = parsed.data;
        if (!fm.last_modified)
            fm.last_modified = today;
        if (!fm.source)
            fm.source = args.source;
        const finalContent = matter.stringify(parsed.content, fm);
        try {
            await writePageSafe(absPath, finalContent, ctx.config.lockTimeoutMs, ctx.config.staleLockTtlMs);
        }
        catch (e) {
            const err = e;
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            status: "error",
                            code: err.code ?? "WRITE_ERROR",
                            message: err.message,
                        }),
                    },
                ],
            };
        }
        const rel = relPath(absPath, vaultPath);
        const indexRow = {
            path: rel,
            tldr: fm.tldr ?? "",
            tags: Array.isArray(fm.tags)
                ? fm.tags.join(",")
                : fm.tags ?? "",
            last_modified: fm.last_modified ?? today,
        };
        ctx.bm25Index.removeDoc(rel);
        ctx.bm25Index.addDoc(indexRow);
        upsertIndexRow(vaultPath, indexRow);
        ctx.backlinkIndex.addPage(rel, finalContent);
        appendLog(vaultPath, {
            timestamp: new Date().toISOString(),
            operation: "write",
            source: args.source,
            metadata: {
                [isNew ? "added" : "modified"]: `[${rel}]`,
            },
        });
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({
                        status: "success",
                        action: isNew ? "created" : "updated",
                        path: rel,
                    }, null, 2),
                },
            ],
        };
    });
}
//# sourceMappingURL=wiki_write_page.js.map