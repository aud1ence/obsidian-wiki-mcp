import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { z } from "zod";
import { isVaultInitialized, listWikiPages } from "../lib/vault.js";
import { appendLog } from "../lib/log_manager.js";
function fullTextScan(vaultPath, query, topK) {
    const pages = listWikiPages(vaultPath);
    const queryTerms = query.toLowerCase().split(/\s+/);
    const results = [];
    for (const absPath of pages) {
        const content = fs.readFileSync(absPath, "utf-8");
        const parsed = matter(content);
        const text = content.toLowerCase();
        let score = 0;
        for (const term of queryTerms) {
            const count = (text.match(new RegExp(term, "g")) ?? []).length;
            score += count;
        }
        if (score > 0) {
            const fm = parsed.data;
            const tldr = fm.tldr ?? parsed.content.slice(0, 120).replace(/\n/g, " ");
            const relP = path.relative(vaultPath, absPath);
            results.push({ path: relP, tldr, score });
        }
    }
    results.sort((a, b) => b.score - a.score);
    const maxScore = results[0]?.score ?? 1;
    return results.slice(0, topK).map((r) => ({
        ...r,
        score: parseFloat((r.score / maxScore).toFixed(2)),
    }));
}
function extractTldrSection(content) {
    const parsed = matter(content);
    const match = parsed.content.match(/## TL;DR\n+([\s\S]*?)(?=\n---|\n## |$)/);
    if (match)
        return match[1].trim();
    return "";
}
export function registerWikiQuery(server, ctx) {
    server.registerTool("wiki_query", {
        description: "Tìm kiếm BM25 trong vault, trả raw TL;DRs. Host LLM tự synthesize câu trả lời.",
        inputSchema: {
            question: z.string().describe("Câu hỏi hoặc từ khóa cần tìm"),
        },
    }, async (args) => {
        const vaultPath = ctx.config.vaultPath;
        const isInit = isVaultInitialized(vaultPath);
        let results = ctx.bm25Index.search(args.question, ctx.config.bm25TopK);
        if (results.length === 0) {
            const fallback = fullTextScan(vaultPath, args.question, ctx.config.bm25TopK);
            if (fallback.length === 0) {
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                status: "not_found",
                                results: [],
                                ...(isInit ? {} : { note: "Vault chưa init. Gọi wiki_init() để cải thiện search." }),
                            }),
                        },
                    ],
                };
            }
            results = fallback;
        }
        const enriched = results.slice(0, 3).map((r) => {
            const absPath = path.resolve(vaultPath, r.path);
            let tldr = r.tldr;
            if (fs.existsSync(absPath)) {
                const content = fs.readFileSync(absPath, "utf-8");
                const section = extractTldrSection(content);
                if (section)
                    tldr = section;
            }
            return { path: r.path, tldr, score: r.score };
        });
        appendLog(vaultPath, {
            timestamp: new Date().toISOString(),
            operation: "query",
            metadata: {
                searched: `"${args.question}"`,
                pages_read: `[${enriched.map((r) => r.path).join(", ")}]`,
            },
        });
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({
                        results: enriched,
                        next_step: "TL;DRs above may be sufficient. Call wiki_read_page(path, 'full') for detailed content if needed.",
                    }, null, 2),
                },
            ],
        };
    });
}
//# sourceMappingURL=wiki_query.js.map