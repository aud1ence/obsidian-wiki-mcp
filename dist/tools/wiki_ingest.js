import fs from "fs";
import path from "path";
import { z } from "zod";
import { isVaultInitialized } from "../lib/vault.js";
import { appendLog } from "../lib/log_manager.js";
const MAX_CONTENT_TOKENS_APPROX = 4000;
const TOKENS_PER_CHAR = 0.25;
function estimateTokens(text) {
    return Math.ceil(text.length * TOKENS_PER_CHAR);
}
function chunkContent(content) {
    const estimated = estimateTokens(content);
    if (estimated <= MAX_CONTENT_TOKENS_APPROX)
        return [content];
    const paragraphs = content.split(/\n\n+/);
    const chunks = [];
    let current = "";
    for (const para of paragraphs) {
        const combined = current ? current + "\n\n" + para : para;
        if (estimateTokens(combined) > MAX_CONTENT_TOKENS_APPROX && current) {
            chunks.push(current.trim());
            current = para;
        }
        else {
            current = combined;
        }
    }
    if (current.trim())
        chunks.push(current.trim());
    return chunks;
}
function getSchemaExcerpt(vaultPath) {
    const schemaPath = path.join(vaultPath, "_schema.md");
    if (!fs.existsSync(schemaPath))
        return "";
    const content = fs.readFileSync(schemaPath, "utf-8");
    const match = content.match(/## Ingest Rules\n([\s\S]*?)(?=\n## |$)/);
    return match ? match[1].trim() : "";
}
export function registerWikiIngest(server, ctx) {
    server.registerTool("wiki_ingest", {
        description: "Receive raw content from session, find relevant pages, return context for host LLM to decide on action",
        inputSchema: {
            content: z.string().describe("Raw content to ingest (conversation, log, note, ...)"),
            source: z.string().describe("Source of content: claude-session-X, kiro-session-X, manual, ..."),
            tags: z.array(z.string()).optional().describe("Suggested tags (optional)"),
        },
    }, async (args) => {
        const { content, source, tags = [] } = args;
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
        if (estimateTokens(content) < 50) {
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({ status: "too_short" }),
                    },
                ],
            };
        }
        const chunks = chunkContent(content);
        // STEP 2: Run BM25 search on each chunk independently, aggregate candidates
        const candidateMap = new Map();
        for (const chunk of chunks) {
            const chunkResults = ctx.bm25Index.search(chunk + " " + tags.join(" "), ctx.config.bm25TopK);
            for (const r of chunkResults) {
                const existing = candidateMap.get(r.path);
                if (!existing || r.score > existing.score) {
                    candidateMap.set(r.path, r);
                }
            }
        }
        const results = Array.from(candidateMap.values())
            .sort((a, b) => b.score - a.score)
            .slice(0, ctx.config.bm25TopK);
        const schemaExcerpt = getSchemaExcerpt(vaultPath);
        appendLog(vaultPath, {
            timestamp: new Date().toISOString(),
            operation: "ingest",
            source,
            metadata: {
                chunks: chunks.length,
                candidates_found: results.length,
                tags: tags.join(",") || "(none)",
            },
        });
        const response = {
            status: "context_ready",
            candidates: results.map((r) => ({
                path: r.path,
                tldr: r.tldr,
                score: r.score,
            })),
            schema_excerpt: schemaExcerpt,
            next_step: results.length === 0
                ? "No existing pages found. Create a new page with wiki_write_page."
                : "Review candidates above. Call wiki_read_page(path, 'full') for pages to update, then wiki_write_page to save.",
        };
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(response, null, 2),
                },
            ],
        };
    });
}
//# sourceMappingURL=wiki_ingest.js.map