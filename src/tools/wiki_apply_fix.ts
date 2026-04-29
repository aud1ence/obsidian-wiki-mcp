import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { z } from "zod";
import { Config } from "../config.js";
import { Bm25Index } from "../lib/index_manager.js";
import { BacklinkIndex, extractWikiLinks } from "../lib/backlink_index.js";
import { validateVaultPath, writePageSafe } from "../lib/vault.js";
import { appendLog } from "../lib/log_manager.js";
import { buildUnifiedDiff } from "../lib/unified_diff.js";
import { lastLintIssues, type IssueType, type LintIssue } from "./wiki_lint_scan.js";

export function registerWikiApplyFix(
  server: import("@modelcontextprotocol/sdk/server/mcp.js").McpServer,
  ctx: { config: Config; bm25Index: Bm25Index; backlinkIndex: BacklinkIndex }
) {
  server.registerTool(
    "wiki_apply_fix",
    {
      description: "Apply fix for issues detected by wiki_lint_scan",
      inputSchema: {
        issue_id: z.string().describe("ID of the issue from wiki_lint_scan, e.g., issue-001"),
        resolution: z.string().optional().describe(
          "Resolution for issues requiring clarification. E.g., 'remove' to delete broken links"
        ),
      },
    },
    async (args) => {
      const vaultPath = ctx.config.vaultPath;

      const issue = lastLintIssues.find((i) => i.id === args.issue_id);
      if (!issue) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                status: "error",
                code: "ISSUE_NOT_FOUND",
                message: `Issue ${args.issue_id} not found. Call wiki_lint_scan() first.`,
              }),
            },
          ],
        };
      }

      switch (issue.type as IssueType) {
        case "ORPHAN":
          return handleOrphan(issue);
        case "MISSING_TLDR":
          return handleMissingTldr(issue, vaultPath);
        case "STALE":
          return handleStale(issue, vaultPath, ctx);
        case "BROKEN_LINK":
          return handleBrokenLink(issue, vaultPath, args.resolution, ctx);
        default:
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  status: "error",
                  code: "UNKNOWN_ISSUE_TYPE",
                  message: `Issue type not supported: ${issue.type}`,
                }),
              },
            ],
          };
      }
    }
  );
}

function handleOrphan(issue: LintIssue) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          status: "needs_clarification",
          issue_id: issue.id,
          question: `Page ${issue.pages[0]} has no backlinks. Which page should it be merged into, or should [[${issue.pages[0]}]] be added to a related page?`,
        }),
      },
    ],
  };
}

function handleMissingTldr(issue: LintIssue, vaultPath: string) {
  const pagePath = issue.pages[0];
  const absPath = path.resolve(vaultPath, pagePath);

  if (!fs.existsSync(absPath)) {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            status: "error",
            code: "PAGE_NOT_FOUND",
            message: `Page no longer exists: ${pagePath}`,
          }),
        },
      ],
    };
  }

  const content = fs.readFileSync(absPath, "utf-8");

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          status: "needs_content",
          issue_id: issue.id,
          path: pagePath,
          content,
          instruction:
            "Add ## TL;DR section (2-4 sentences) and frontmatter tldr field, then call wiki_write_page with the updated content.",
        }),
      },
    ],
  };
}

async function handleStale(
  issue: LintIssue,
  vaultPath: string,
  ctx: { config: Config; bm25Index: Bm25Index; backlinkIndex: BacklinkIndex }
) {
  const pagePath = issue.pages[0];
  let absPath: string;
  try {
    absPath = validateVaultPath(pagePath, vaultPath);
  } catch (e: unknown) {
    const err = e as { code: string; message: string };
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ status: "error", code: err.code, message: err.message }),
        },
      ],
    };
  }

  if (!fs.existsSync(absPath)) {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ status: "error", code: "PAGE_NOT_FOUND", message: `Page does not exist: ${pagePath}` }),
        },
      ],
    };
  }

  const content = fs.readFileSync(absPath, "utf-8");
  const parsed = matter(content);
  const today = new Date().toISOString().slice(0, 10);

  const fm = parsed.data as Record<string, unknown>;
  fm.dirty = false;
  fm.last_modified = today;
  fm.last_linted = today;

  const newContent = matter.stringify(parsed.content, fm);

  try {
    await writePageSafe(absPath, newContent, ctx.config.lockTimeoutMs, ctx.config.staleLockTtlMs);
  } catch (e: unknown) {
    const err = e as { code: string; message: string };
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ status: "error", code: err.code, message: err.message }),
        },
      ],
    };
  }

  appendLog(vaultPath, {
    timestamp: new Date().toISOString(),
    operation: "fix",
    metadata: {
      issue_id: issue.id,
      type: "STALE",
      fixed: `[${pagePath}]`,
      summary: `Set dirty=false, last_modified=${today}`,
    },
  });

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          status: "fixed",
          issue_id: issue.id,
          changes: [{ path: pagePath, summary: `Set dirty=false, last_modified=${today}` }],
          diff: buildUnifiedDiff(content, newContent),
        }),
      },
    ],
  };
}

async function handleBrokenLink(
  issue: LintIssue,
  vaultPath: string,
  resolution: string | undefined,
  ctx: { config: Config; bm25Index: Bm25Index; backlinkIndex: BacklinkIndex }
) {
  const pagePath = issue.pages[0];
  let absPath: string;
  try {
    absPath = validateVaultPath(pagePath, vaultPath);
  } catch (e: unknown) {
    const err = e as { code: string; message: string };
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ status: "error", code: err.code, message: err.message }),
        },
      ],
    };
  }

  if (!fs.existsSync(absPath)) {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ status: "error", code: "PAGE_NOT_FOUND", message: `Page does not exist: ${pagePath}` }),
        },
      ],
    };
  }

  if (!resolution) {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            status: "needs_clarification",
            issue_id: issue.id,
            question: `Page ${pagePath} has broken links: ${issue.detail}. Remove links (resolution: 'remove') or recreate missing pages?`,
          }),
        },
      ],
    };
  }

  if (resolution === "remove") {
    const content = fs.readFileSync(absPath, "utf-8");
    const parsed = matter(content);

    let newBody = parsed.content;
    const links = extractWikiLinks(parsed.content);

    for (const link of links) {
      const withExt = link.endsWith(".md") ? link : link + ".md";
      const exists = fs.existsSync(path.resolve(vaultPath, withExt)) ||
        fs.existsSync(path.resolve(vaultPath, "_wiki", withExt));

      if (!exists) {
        newBody = newBody.replace(new RegExp(`\\[\\[${escapeRegex(link)}[^\\]]*\\]\\]`, "g"), link);
      }
    }

    const newContent = matter.stringify(newBody, parsed.data);
    await writePageSafe(absPath, newContent, ctx.config.lockTimeoutMs, ctx.config.staleLockTtlMs);

    appendLog(vaultPath, {
      timestamp: new Date().toISOString(),
      operation: "fix",
      metadata: {
        issue_id: issue.id,
        type: "BROKEN_LINK",
        fixed: `[${pagePath}]`,
        summary: "Removed broken wikilinks",
      },
    });

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            status: "fixed",
            issue_id: issue.id,
            changes: [{ path: pagePath, summary: "Removed broken wikilinks, replaced with plain text" }],
            diff: buildUnifiedDiff(content, newContent),
          }),
        },
      ],
    };
  }

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          status: "needs_clarification",
          issue_id: issue.id,
          question: `Resolution '${resolution}' is not supported. Use 'remove' to delete broken links.`,
        }),
      },
    ],
  };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
