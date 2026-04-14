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
function detectQuestionType(question) {
    const q = question.toLowerCase();
    if (/\b(how|setup|install|config|configure|fix|debug|troubleshoot|deploy|run|step|build|enable|disable|restart|start|stop|upgrade|migrate|backup|restore)\b/.test(q) ||
        /\b(l\u00e0m th\u1ebf n\u00e0o|c\u00e1ch|thi\u1ebft l\u1eadp|c\u00e0i \u0111\u1eb7t|kh\u1eafc ph\u1ee5c|tri\u1ec3n khai)\b/.test(q)) {
        return "procedural";
    }
    if (/\b(what|why|when|where|who|which|l\u00e0 g\u00ec|t\u1ea1i sao|khi n\u00e0o|\u1edf \u0111\u00e2u)\b/.test(q)) {
        return "factual";
    }
    return "exploratory";
}
/** For procedural questions, boost pages with operational tags */
function reRankForProcedural(results, bm25Index) {
    const opsTagKeywords = new Set([
        "runbook", "troubleshoot", "incident", "ops", "fix", "deploy",
        "setup", "install", "config", "debug", "backup", "restore",
    ]);
    const boosted = results.map((r) => {
        const row = bm25Index.getRow(r.path);
        if (!row)
            return r;
        const tags = row.tags.toLowerCase().split(",").map((t) => t.trim());
        const hasOpsTag = tags.some((t) => opsTagKeywords.has(t));
        return { ...r, score: hasOpsTag ? r.score * 1.2 : r.score };
    });
    boosted.sort((a, b) => b.score - a.score);
    const maxScore = boosted[0]?.score ?? 1;
    return boosted.map((r) => ({
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
        description: "Search the vault using BM25, returning raw TL;DRs. Host LLM synthesizes answers.",
        inputSchema: {
            question: z.string().describe("The question or keywords to search for"),
        },
    }, async (args) => {
        const vaultPath = ctx.config.vaultPath;
        const isInit = isVaultInitialized(vaultPath);
        const questionType = detectQuestionType(args.question);
        let results = ctx.bm25Index.search(args.question, ctx.config.bm25TopK);
        // For procedural questions, re-rank by boosting pages with operational tags
        if (questionType === "procedural" && results.length > 0) {
            results = reRankForProcedural(results, ctx.bm25Index);
        }
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
                                ...(isInit ? {} : { note: "Vault not initialized. Call wiki_init() to improve search." }),
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