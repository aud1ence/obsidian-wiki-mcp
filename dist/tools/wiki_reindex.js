import fs from "fs";
import matter from "gray-matter";
import { z } from "zod";
import { writeIndexFile } from "../lib/index_manager.js";
import { buildBacklinkIndex } from "../lib/backlink_index.js";
import { isVaultInitialized, listWikiPages, relPath } from "../lib/vault.js";
import { appendLog } from "../lib/log_manager.js";
export function registerWikiReindex(server, ctx) {
    server.registerTool("wiki_reindex", {
        description: "Rescan all pages in _wiki/ and rebuild BM25 index + _index.md. " +
            "Call this after manually creating or editing .md files outside the MCP (e.g. directly in Obsidian).",
        inputSchema: {
            dry_run: z
                .boolean()
                .optional()
                .describe("If true, report what would be indexed without writing anything. Default: false."),
        },
    }, async (args) => {
        const vaultPath = ctx.config.vaultPath;
        const dryRun = args.dry_run ?? false;
        if (!isVaultInitialized(vaultPath)) {
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            status: "error",
                            code: "VAULT_NOT_INIT",
                            message: "Vault not initialized. Run wiki_init() first.",
                        }),
                    },
                ],
            };
        }
        const pages = listWikiPages(vaultPath);
        const rows = [];
        const skipped = [];
        const today = new Date().toISOString().slice(0, 10);
        for (const absPath of pages) {
            const rel = relPath(absPath, vaultPath);
            try {
                const raw = fs.readFileSync(absPath, "utf-8");
                const parsed = matter(raw);
                const fm = parsed.data;
                const tldr = typeof fm.tldr === "string"
                    ? fm.tldr
                    : parsed.content.slice(0, 120).replace(/\n/g, " ").trim();
                const tags = Array.isArray(fm.tags)
                    ? fm.tags.join(",")
                    : typeof fm.tags === "string"
                        ? fm.tags
                        : "";
                const last_modified = typeof fm.last_modified === "string" ? fm.last_modified : today;
                rows.push({ path: rel, tldr, tags, last_modified });
            }
            catch {
                skipped.push(rel);
            }
        }
        if (!dryRun) {
            // Rebuild _index.md
            writeIndexFile(vaultPath, rows);
            // Rebuild in-memory BM25 index
            ctx.bm25Index.rebuild(rows);
            // Rebuild in-memory backlink index
            const newBacklink = await buildBacklinkIndex(vaultPath);
            ctx.backlinkIndex.backlinks.clear();
            ctx.backlinkIndex.forwardLinks.clear();
            for (const [k, v] of newBacklink.backlinks) {
                ctx.backlinkIndex.backlinks.set(k, v);
            }
            for (const [k, v] of newBacklink.forwardLinks) {
                ctx.backlinkIndex.forwardLinks.set(k, v);
            }
            appendLog(vaultPath, {
                timestamp: new Date().toISOString(),
                operation: "reindex",
                metadata: {
                    pages_indexed: String(rows.length),
                    skipped: skipped.length > 0 ? skipped.join(", ") : "(none)",
                },
            });
        }
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({
                        status: dryRun ? "dry_run" : "success",
                        pages_found: pages.length,
                        pages_indexed: rows.length,
                        skipped,
                        indexed: rows.map((r) => ({
                            path: r.path,
                            tldr: r.tldr.slice(0, 80),
                            tags: r.tags,
                        })),
                    }, null, 2),
                },
            ],
        };
    });
}
//# sourceMappingURL=wiki_reindex.js.map