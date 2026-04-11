import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { listWikiPages, relPath } from "./vault.js";
/** Extract [[wikilinks]] từ content */
export function extractWikiLinks(content) {
    const links = [];
    const regex = /\[\[([^\]|#]+)(?:#[^\]|]*)?\|?[^\]]*\]\]/g;
    let m;
    while ((m = regex.exec(content)) !== null) {
        links.push(m[1].trim());
    }
    return links;
}
export async function buildBacklinkIndex(vaultPath) {
    const backlinks = new Map();
    const forwardLinks = new Map();
    const pages = listWikiPages(vaultPath);
    for (const absPath of pages) {
        const rel = relPath(absPath, vaultPath);
        const content = fs.readFileSync(absPath, "utf-8");
        const parsed = matter(content);
        const links = extractWikiLinks(parsed.content);
        const fwd = new Set();
        for (const link of links) {
            // Resolve link → relative path
            const normalized = normalizeLink(link, rel, vaultPath);
            if (normalized) {
                fwd.add(normalized);
                if (!backlinks.has(normalized))
                    backlinks.set(normalized, new Set());
                backlinks.get(normalized).add(rel);
            }
        }
        forwardLinks.set(rel, fwd);
    }
    return {
        backlinks,
        forwardLinks,
        getAllTargets() {
            return new Set(backlinks.keys());
        },
        getBacklinks(pagePath) {
            return Array.from(backlinks.get(pagePath) ?? []);
        },
        addPage(pageRelPath, content) {
            // Remove old forward links
            const oldFwd = forwardLinks.get(pageRelPath) ?? new Set();
            for (const target of oldFwd) {
                backlinks.get(target)?.delete(pageRelPath);
            }
            // Add new forward links
            const parsed = matter(content);
            const links = extractWikiLinks(parsed.content);
            const newFwd = new Set();
            for (const link of links) {
                const normalized = normalizeLink(link, pageRelPath, vaultPath);
                if (normalized) {
                    newFwd.add(normalized);
                    if (!backlinks.has(normalized))
                        backlinks.set(normalized, new Set());
                    backlinks.get(normalized).add(pageRelPath);
                }
            }
            forwardLinks.set(pageRelPath, newFwd);
        },
        removePage(pageRelPath) {
            const fwd = forwardLinks.get(pageRelPath) ?? new Set();
            for (const target of fwd) {
                backlinks.get(target)?.delete(pageRelPath);
            }
            forwardLinks.delete(pageRelPath);
            backlinks.delete(pageRelPath);
        },
    };
}
/**
 * Normalize [[link]] sang relative path trong vault.
 * Hỗ trợ: bare name, path với /, kebab/normal casing.
 */
function normalizeLink(link, fromPage, vaultPath) {
    // Thêm .md nếu chưa có
    const withExt = link.endsWith(".md") ? link : link + ".md";
    // Tìm file trong vault
    const candidates = [
        withExt,
        `_wiki/${withExt}`,
        path.join(path.dirname(fromPage), withExt),
    ];
    for (const candidate of candidates) {
        const abs = path.resolve(vaultPath, candidate);
        if (fs.existsSync(abs)) {
            return relPath(abs, vaultPath);
        }
    }
    // Trả về normalized path dù file chưa tồn tại (để detect broken links)
    return withExt;
}
//# sourceMappingURL=backlink_index.js.map