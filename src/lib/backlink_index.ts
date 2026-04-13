import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { listWikiPages, relPath } from "./vault.js";

export interface BacklinkIndex {
  /** page A → set of pages that link TO A */
  backlinks: Map<string, Set<string>>;
  /** page A → set of pages that A links TO */
  forwardLinks: Map<string, Set<string>>;
  getAllTargets(): Set<string>;
  getBacklinks(pagePath: string): string[];
  addPage(pageRelPath: string, content: string): void;
  removePage(pageRelPath: string): void;
}

/** Extract [[wikilinks]] from content */
export function extractWikiLinks(content: string): string[] {
  const links: string[] = [];
  const regex = /\[\[([^\]|#]+)(?:#[^\]|]*)?\|?[^\]]*\]\]/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(content)) !== null) {
    links.push(m[1].trim());
  }
  return links;
}

export async function buildBacklinkIndex(
  vaultPath: string
): Promise<BacklinkIndex> {
  const backlinks = new Map<string, Set<string>>();
  const forwardLinks = new Map<string, Set<string>>();

  const pages = listWikiPages(vaultPath);

  for (const absPath of pages) {
    const rel = relPath(absPath, vaultPath);
    const content = fs.readFileSync(absPath, "utf-8");
    const parsed = matter(content);
    const links = extractWikiLinks(parsed.content);

    const fwd = new Set<string>();
    for (const link of links) {
      // Resolve link → relative path
      const normalized = normalizeLink(link, rel, vaultPath);
      if (normalized) {
        fwd.add(normalized);
        if (!backlinks.has(normalized)) backlinks.set(normalized, new Set());
        backlinks.get(normalized)!.add(rel);
      }
    }
    forwardLinks.set(rel, fwd);
  }

  return {
    backlinks,
    forwardLinks,
    getAllTargets(): Set<string> {
      return new Set(backlinks.keys());
    },
    getBacklinks(pagePath: string): string[] {
      return Array.from(backlinks.get(pagePath) ?? []);
    },
    addPage(pageRelPath: string, content: string): void {
      // Remove old forward links
      const oldFwd = forwardLinks.get(pageRelPath) ?? new Set<string>();
      for (const target of oldFwd) {
        backlinks.get(target)?.delete(pageRelPath);
      }

      // Add new forward links
      const parsed = matter(content);
      const links = extractWikiLinks(parsed.content);
      const newFwd = new Set<string>();
      for (const link of links) {
        const normalized = normalizeLink(link, pageRelPath, vaultPath);
        if (normalized) {
          newFwd.add(normalized);
          if (!backlinks.has(normalized)) backlinks.set(normalized, new Set());
          backlinks.get(normalized)!.add(pageRelPath);
        }
      }
      forwardLinks.set(pageRelPath, newFwd);
    },
    removePage(pageRelPath: string): void {
      const fwd = forwardLinks.get(pageRelPath) ?? new Set<string>();
      for (const target of fwd) {
        backlinks.get(target)?.delete(pageRelPath);
      }
      forwardLinks.delete(pageRelPath);
      backlinks.delete(pageRelPath);
    },
  };
}

/**
 * Normalize [[link]] to relative path in the vault.
 * Supports: bare name, path with /, kebab/normal casing.
 */
function normalizeLink(
  link: string,
  fromPage: string,
  vaultPath: string
): string | null {
  // Add .md if not already present
  const withExt = link.endsWith(".md") ? link : link + ".md";

  // Find file in the vault
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

  // Return normalized path even if file doesn't exist (to detect broken links)
  return withExt;
}
