import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { Config } from "../config.js";
import { Bm25Index } from "../lib/index_manager.js";
import { BacklinkIndex, extractWikiLinks } from "../lib/backlink_index.js";
import { isVaultInitialized, listWikiPages, relPath } from "../lib/vault.js";
import { appendLog, updateLastLintAnchor } from "../lib/log_manager.js";

export type IssueType = "ORPHAN" | "MISSING_TLDR" | "STALE" | "BROKEN_LINK";

export interface LintIssue {
  id: string;
  type: IssueType;
  severity: "high" | "medium" | "low";
  pages: string[];
  detail: string;
  suggested_action: string;
}

const SEVERITY: Record<IssueType, "high" | "medium" | "low"> = {
  BROKEN_LINK: "high",
  STALE: "medium",
  ORPHAN: "low",
  MISSING_TLDR: "low",
};

const ORPHAN_AGE_DAYS = 7;
const STALE_AGE_DAYS = 90;
const MS_PER_DAY = 86400_000;

function daysSince(dateStr: string): number {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return 0;
  return Math.floor((Date.now() - d.getTime()) / MS_PER_DAY);
}

// Shared store cho wiki_apply_fix
export let lastLintIssues: LintIssue[] = [];

export function registerWikiLintScan(
  server: import("@modelcontextprotocol/sdk/server/mcp.js").McpServer,
  ctx: { config: Config; bm25Index: Bm25Index; backlinkIndex: BacklinkIndex }
) {
  server.registerTool(
    "wiki_lint_scan",
    {
      description: "Quét vault phát hiện vấn đề cấu trúc: orphan pages, missing TL;DR, stale pages, broken links",
    },
    async () => {
      const vaultPath = ctx.config.vaultPath;

      if (!isVaultInitialized(vaultPath)) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                status: "error",
                code: "VAULT_NOT_INIT",
                message: "Vault chưa được khởi tạo. Gọi wiki_init() trước.",
              }),
            },
          ],
        };
      }

      const pages = listWikiPages(vaultPath);
      const issues: LintIssue[] = [];
      let issueCounter = 0;

      function nextId(): string {
        issueCounter++;
        return `issue-${String(issueCounter).padStart(3, "0")}`;
      }

      const allTargets = ctx.backlinkIndex.getAllTargets();

      for (const absPath of pages) {
        const rel = relPath(absPath, vaultPath);
        const content = fs.readFileSync(absPath, "utf-8");
        const stat = fs.statSync(absPath);
        const parsed = matter(content);
        const fm = parsed.data as Record<string, unknown>;

        // ORPHAN
        const mtimeAge = Math.floor((Date.now() - stat.mtimeMs) / MS_PER_DAY);
        if (!allTargets.has(rel) && mtimeAge >= ORPHAN_AGE_DAYS) {
          const id = nextId();
          issues.push({
            id,
            type: "ORPHAN",
            severity: SEVERITY.ORPHAN,
            pages: [rel],
            detail: `Không có backlink sau ${mtimeAge} ngày`,
            suggested_action: `Gọi wiki_apply_fix('${id}') hoặc thêm backlink từ page khác`,
          });
        }

        // MISSING_TLDR
        if (!parsed.content.includes("## TL;DR")) {
          const id = nextId();
          issues.push({
            id,
            type: "MISSING_TLDR",
            severity: SEVERITY.MISSING_TLDR,
            pages: [rel],
            detail: "Page không có section ## TL;DR",
            suggested_action: `Gọi wiki_apply_fix('${id}') để server trả content, rồi thêm TL;DR và gọi wiki_write_page`,
          });
        }

        // STALE
        const lastMod = fm.last_modified as string;
        const dirty = fm.dirty as boolean;
        if (dirty === true && lastMod) {
          const age = daysSince(lastMod);
          if (age > STALE_AGE_DAYS) {
            const id = nextId();
            issues.push({
              id,
              type: "STALE",
              severity: SEVERITY.STALE,
              pages: [rel],
              detail: `last_modified=${lastMod}, dirty=true, ${age} ngày chưa cập nhật`,
              suggested_action: `Gọi wiki_apply_fix('${id}') để acknowledge (set dirty=false)`,
            });
          }
        }

        // BROKEN_LINK
        const links = extractWikiLinks(parsed.content);
        const brokenLinks: string[] = [];

        for (const link of links) {
          const withExt = link.endsWith(".md") ? link : link + ".md";
          const candidates = [
            withExt,
            `_wiki/${withExt}`,
            path.join(path.dirname(rel), withExt),
          ];
          const exists = candidates.some((c) => {
            const abs = path.resolve(vaultPath, c);
            return fs.existsSync(abs);
          });
          if (!exists) brokenLinks.push(`[[${link}]]`);
        }

        if (brokenLinks.length > 0) {
          const id = nextId();
          issues.push({
            id,
            type: "BROKEN_LINK",
            severity: SEVERITY.BROKEN_LINK,
            pages: [rel],
            detail: `Broken links: ${brokenLinks.join(", ")}`,
            suggested_action: `Gọi wiki_apply_fix('${id}') để xóa hoặc redirect broken links`,
          });
        }
      }

      // Lưu issues để wiki_apply_fix dùng
      lastLintIssues = issues;

      appendLog(vaultPath, {
        timestamp: new Date().toISOString(),
        operation: "lint",
        metadata: {
          pages_scanned: pages.length,
          issues_found: issues.length,
        },
      });
      updateLastLintAnchor(vaultPath);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ scanned: pages.length, issues }, null, 2),
          },
        ],
      };
    }
  );
}
