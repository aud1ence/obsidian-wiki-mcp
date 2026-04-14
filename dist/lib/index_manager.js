import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { listWikiPages, relPath } from "./vault.js";
const INDEX_HEADER = `| path | tldr | tags | last_modified |
|------|------|------|---------------|`;
/** Parse _index.md → array of IndexRow */
export function parseIndexFile(content) {
    const rows = [];
    const lines = content.split("\n");
    let inTable = false;
    for (const line of lines) {
        const trimmed = line.trim();
        if (!inTable) {
            if (trimmed.startsWith("| path")) {
                inTable = true;
                continue;
            }
            continue;
        }
        // Skip separator row
        if (/^\|[-| ]+\|$/.test(trimmed))
            continue;
        if (!trimmed.startsWith("|")) {
            inTable = false;
            continue;
        }
        const parts = trimmed
            .slice(1, -1)
            .split("|")
            .map((s) => s.trim());
        if (parts.length >= 4) {
            rows.push({
                path: parts[0],
                tldr: parts[1],
                tags: parts[2],
                last_modified: parts[3],
            });
        }
    }
    return rows;
}
/** Serialize rows → Markdown table */
export function serializeIndex(rows) {
    const lines = [INDEX_HEADER];
    for (const row of rows) {
        lines.push(`| ${row.path} | ${escapeMd(row.tldr)} | ${row.tags} | ${row.last_modified} |`);
    }
    return lines.join("\n") + "\n";
}
function escapeMd(s) {
    return s.replace(/\|/g, "\\|");
}
/** Write _index.md */
export function writeIndexFile(vaultPath, rows) {
    const indexPath = path.join(vaultPath, "_index.md");
    const content = `# Wiki Index\n\n<!-- This file is automatically managed by MCP. DO NOT edit manually. -->\n\n${serializeIndex(rows)}`;
    fs.writeFileSync(indexPath, content, "utf-8");
}
/** Read rows from _index.md */
export function readIndexRows(vaultPath) {
    const indexPath = path.join(vaultPath, "_index.md");
    if (!fs.existsSync(indexPath))
        return [];
    const content = fs.readFileSync(indexPath, "utf-8");
    return parseIndexFile(content);
}
/** Update or add a row in _index.md */
export function upsertIndexRow(vaultPath, newRow) {
    const rows = readIndexRows(vaultPath);
    const idx = rows.findIndex((r) => r.path === newRow.path);
    if (idx >= 0) {
        rows[idx] = newRow;
    }
    else {
        rows.push(newRow);
    }
    writeIndexFile(vaultPath, rows);
}
/** Build in-memory BM25 index from rows */
export async function buildBm25Index(vaultPath) {
    const rows = readIndexRows(vaultPath);
    // Simple TF-IDF / BM25 implementation (not using wink due to ESM compatibility issues)
    // Using simple keyword scoring instead
    return createSimpleBm25(rows);
}
function tokenize(text) {
    return text
        .toLowerCase()
        .replace(/[^\w\s]/g, " ")
        .split(/\s+/)
        .filter((t) => t.length > 1);
}
const STOPWORDS = new Set([
    "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "shall", "can", "that", "this", "these",
    "those", "i", "you", "he", "she", "it", "we", "they", "what", "which",
    "who", "how", "when", "where", "why",
]);
function getTerms(text) {
    return tokenize(text).filter((t) => !STOPWORDS.has(t));
}
function createSimpleBm25(initialRows) {
    const docs = new Map();
    function indexRow(row) {
        const text = `${row.path} ${row.tldr} ${row.tags}`;
        const terms = getTerms(text);
        const termMap = new Map();
        for (const t of terms) {
            termMap.set(t, (termMap.get(t) ?? 0) + 1);
        }
        docs.set(row.path, { id: row.path, terms: termMap, totalTerms: terms.length, row });
    }
    for (const row of initialRows)
        indexRow(row);
    function score(doc, queryTerms) {
        const k1 = 1.5;
        const b = 0.75;
        const avgDocLen = 20;
        let s = 0;
        const N = Math.max(docs.size, 1);
        for (const term of queryTerms) {
            // Doc frequency
            let df = 0;
            for (const d of docs.values()) {
                if (d.terms.has(term))
                    df++;
            }
            if (df === 0)
                continue;
            const idf = Math.log((N - df + 0.5) / (df + 0.5) + 1);
            const tf = doc.terms.get(term) ?? 0;
            const docLen = doc.totalTerms;
            const tfNorm = (tf * (k1 + 1)) /
                (tf + k1 * (1 - b + b * (docLen / avgDocLen)));
            s += idf * tfNorm;
        }
        return s;
    }
    return {
        search(query, topK = 5) {
            const queryTerms = getTerms(query);
            if (queryTerms.length === 0 || docs.size === 0)
                return [];
            const scored = [];
            for (const doc of docs.values()) {
                const s = score(doc, queryTerms);
                if (s > 0) {
                    scored.push({ path: doc.row.path, tldr: doc.row.tldr, score: s });
                }
            }
            scored.sort((a, b) => b.score - a.score);
            const maxScore = scored[0]?.score ?? 1;
            return scored.slice(0, topK).map((r) => ({
                ...r,
                score: parseFloat((r.score / maxScore).toFixed(2)),
            }));
        },
        addDoc(row) {
            indexRow(row);
        },
        removeDoc(filePath) {
            docs.delete(filePath);
        },
        rebuild(rows) {
            docs.clear();
            for (const row of rows)
                indexRow(row);
        },
        getRow(filePath) {
            return docs.get(filePath)?.row;
        },
    };
}
/**
 * Validate _index.md against actual _wiki/ pages.
 * If out of sync (missing entries or orphaned entries), rebuild automatically.
 * Returns true if a rebuild was performed.
 */
export function validateAndRebuildIndex(vaultPath, bm25Index) {
    const indexedRows = readIndexRows(vaultPath);
    const indexedPaths = new Set(indexedRows.map((r) => r.path));
    const wikiPages = listWikiPages(vaultPath);
    const actualPaths = new Set(wikiPages.map((abs) => relPath(abs, vaultPath)));
    const hasUnindexed = wikiPages.some((abs) => !indexedPaths.has(relPath(abs, vaultPath)));
    const hasOrphaned = indexedRows.some((r) => !actualPaths.has(r.path));
    if (!hasUnindexed && !hasOrphaned)
        return false;
    // Rebuild from disk
    const today = new Date().toISOString().slice(0, 10);
    const newRows = [];
    for (const absPath of wikiPages) {
        const rel = relPath(absPath, vaultPath);
        try {
            const raw = fs.readFileSync(absPath, "utf-8");
            const parsed = matter(raw);
            const fm = parsed.data;
            newRows.push({
                path: rel,
                tldr: typeof fm.tldr === "string" ? fm.tldr : parsed.content.slice(0, 120).replace(/\n/g, " ").trim(),
                tags: Array.isArray(fm.tags) ? fm.tags.join(",") : typeof fm.tags === "string" ? fm.tags : "",
                last_modified: typeof fm.last_modified === "string" ? fm.last_modified : today,
            });
        }
        catch {
            // skip unreadable files
        }
    }
    writeIndexFile(vaultPath, newRows);
    bm25Index.rebuild(newRows);
    return true;
}
//# sourceMappingURL=index_manager.js.map