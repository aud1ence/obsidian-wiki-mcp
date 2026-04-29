import fs from "fs";
import matter from "gray-matter";
import { z } from "zod";
import { Config } from "../config.js";
import { Bm25Index, upsertIndexRow } from "../lib/index_manager.js";
import { BacklinkIndex } from "../lib/backlink_index.js";
import {
  validateVaultPath,
  writePageSafe,
  isVaultInitialized,
  relPath,
} from "../lib/vault.js";
import { buildUnifiedDiff } from "../lib/unified_diff.js";
import { appendLog } from "../lib/log_manager.js";

export function registerWikiWritePage(
  server: import("@modelcontextprotocol/sdk/server/mcp.js").McpServer,
  ctx: { config: Config; bm25Index: Bm25Index; backlinkIndex: BacklinkIndex }
) {
  server.registerTool(
    "wiki_write_page",
    {
      description: "Write a page to the vault. Host LLM calls this after deciding on the content.",
      inputSchema: {
        path: z.string().describe("Relative path in the vault, e.g., _wiki/infra/redis-oom.md"),
        content: z.string().describe("Markdown content (including YAML frontmatter)"),
        source: z.string().describe("Source: claude-session-X, kiro-session-X, manual"),
      },
    },
    async (args) => {
      const vaultPath = ctx.config.vaultPath;

      if (!isVaultInitialized(vaultPath)) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                status: "error",
                code: "VAULT_NOT_INIT",
                message: "Vault not initialized. Call wiki_init() first.",
              }),
            },
          ],
        };
      }

      let absPath: string;
      try {
        absPath = validateVaultPath(args.path, vaultPath);
      } catch (e: unknown) {
        const err = e as { code: string; message: string };
        return {
          content: [
            {
              type: "text" as const,
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
      const beforeContent = isNew ? null : fs.readFileSync(absPath, "utf-8");

      let parsed: matter.GrayMatterFile<string>;
      try {
        parsed = matter(args.content);
      } catch {
        return {
          content: [
            {
              type: "text" as const,
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
      const fm = parsed.data as Record<string, unknown>;
      if (!fm.last_modified) fm.last_modified = today;
      if (!fm.source) fm.source = args.source;

      const finalContent = matter.stringify(parsed.content, fm);

      try {
        await writePageSafe(
          absPath,
          finalContent,
          ctx.config.lockTimeoutMs,
          ctx.config.staleLockTtlMs
        );
      } catch (e: unknown) {
        const err = e as { code: string; message: string };
        return {
          content: [
            {
              type: "text" as const,
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
        tldr: (fm.tldr as string) ?? "",
        tags: Array.isArray(fm.tags)
          ? (fm.tags as string[]).join(",")
          : (fm.tags as string) ?? "",
        last_modified: (fm.last_modified as string) ?? today,
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
            type: "text" as const,
            text: JSON.stringify(
              {
                status: "success",
                action: isNew ? "created" : "updated",
                path: rel,
                diff: beforeContent === null ? null : buildUnifiedDiff(beforeContent, finalContent),
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );
}
