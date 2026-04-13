import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { z } from "zod";
import { Config } from "../config.js";
import { Bm25Index } from "../lib/index_manager.js";
import { BacklinkIndex } from "../lib/backlink_index.js";
import { isVaultInitialized, relPath } from "../lib/vault.js";
import { appendLog } from "../lib/log_manager.js";

const MAX_CONTENT_CHARS = 16000; // ~4000 tokens

function expandHome(p: string): string {
  if (p.startsWith("~")) return path.join(process.env.HOME ?? "", p.slice(1));
  return p;
}

/**
 * Detect if a page already has wiki-compatible frontmatter.
 * Requires at minimum: tldr field present.
 */
function hasWikiFrontmatter(fm: Record<string, unknown>): boolean {
  return typeof fm.tldr === "string" && fm.tldr.trim().length > 0;
}

/**
 * Suggest a wiki path from the source file path.
 * e.g. "notes/redis-tips.md" → "_wiki/concepts/redis-tips.md"
 */
function suggestWikiPath(sourceFile: string): string {
  const base = path.basename(sourceFile, ".md");
  return `_wiki/concepts/${base}.md`;
}

/**
 * Build a draft frontmatter block for the LLM to fill in.
 */
function buildDraftFrontmatter(
  existingFm: Record<string, unknown>,
  sourceFile: string
): string {
  const today = new Date().toISOString().slice(0, 10);
  const fm: Record<string, unknown> = {
    tldr: existingFm.tldr ?? "<FILL: one sentence summary, ≤ 100 tokens>",
    tags: existingFm.tags ?? ["<FILL: tag1, tag2>"],
    related: existingFm.related ?? [],
    last_modified: today,
    last_linted: today,
    dirty: false,
    source: `import:${path.basename(sourceFile)}`,
  };
  return matter.stringify("", fm).trim();
}

export function registerWikiImport(
  server: import("@modelcontextprotocol/sdk/server/mcp.js").McpServer,
  ctx: { config: Config; bm25Index: Bm25Index; backlinkIndex: BacklinkIndex }
) {
  server.registerTool(
    "wiki_import",
    {
      description:
        "Read a .md file from any path (inside or outside the vault) and prepare it for wiki ingestion. " +
        "Returns file content + candidate wiki pages + a draft frontmatter template. " +
        "The host LLM then calls wiki_write_page to finalize.",
      inputSchema: {
        file_path: z
          .string()
          .describe(
            "Absolute or ~-relative path to the .md file to import. " +
              "Can be anywhere on disk — not limited to the vault."
          ),
        suggested_wiki_path: z
          .string()
          .optional()
          .describe(
            "Where to place the page in the wiki, e.g. _wiki/infra/redis-tips.md. " +
              "If omitted, a path is suggested automatically."
          ),
        tags: z
          .array(z.string())
          .optional()
          .describe("Tags to help find related pages. Optional."),
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
                message: "Vault not initialized. Run wiki_init() first.",
              }),
            },
          ],
        };
      }

      // Resolve file path
      const absSourcePath = path.resolve(expandHome(args.file_path));

      if (!fs.existsSync(absSourcePath)) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                status: "error",
                code: "FILE_NOT_FOUND",
                message: `File not found: ${absSourcePath}`,
              }),
            },
          ],
        };
      }

      if (!absSourcePath.endsWith(".md")) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                status: "error",
                code: "NOT_MARKDOWN",
                message: "Only .md files are supported.",
              }),
            },
          ],
        };
      }

      // Read file
      let rawContent: string;
      try {
        rawContent = fs.readFileSync(absSourcePath, "utf-8");
      } catch (e: unknown) {
        const err = e as { message: string };
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                status: "error",
                code: "READ_ERROR",
                message: err.message,
              }),
            },
          ],
        };
      }

      // Truncate if too large
      const truncated = rawContent.length > MAX_CONTENT_CHARS;
      const contentForSearch = truncated
        ? rawContent.slice(0, MAX_CONTENT_CHARS)
        : rawContent;

      // Parse existing frontmatter
      const parsed = matter(rawContent);
      const existingFm = parsed.data as Record<string, unknown>;
      const alreadyWikiFormat = hasWikiFrontmatter(existingFm);

      // Search for related pages
      const searchQuery =
        contentForSearch.slice(0, 500) + " " + (args.tags ?? []).join(" ");
      const candidates = ctx.bm25Index.search(searchQuery, ctx.config.bm25TopK);

      // Determine suggested wiki path
      const suggestedPath =
        args.suggested_wiki_path ?? suggestWikiPath(absSourcePath);

      // Check if target path already exists
      const targetAbs = path.resolve(vaultPath, suggestedPath);
      const targetExists = fs.existsSync(targetAbs);
      const targetRelPath = targetExists
        ? relPath(targetAbs, vaultPath)
        : null;

      // Build draft frontmatter for LLM
      const draftFrontmatter = buildDraftFrontmatter(existingFm, absSourcePath);

      appendLog(vaultPath, {
        timestamp: new Date().toISOString(),
        operation: "ingest",
        source: `import:${path.basename(absSourcePath)}`,
        metadata: {
          file: absSourcePath,
          size_chars: String(rawContent.length),
          truncated: String(truncated),
          candidates_found: String(candidates.length),
        },
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                status: "ready",
                source_file: absSourcePath,
                file_size_chars: rawContent.length,
                truncated,
                already_wiki_format: alreadyWikiFormat,

                // Where to write
                suggested_wiki_path: suggestedPath,
                target_exists: targetExists,
                existing_page_path: targetRelPath,

                // Related pages already in wiki
                candidates: candidates.map((r) => ({
                  path: r.path,
                  tldr: r.tldr,
                  score: r.score,
                })),

                // Raw content for LLM to transform
                raw_content: contentForSearch,

                // Draft frontmatter for LLM to fill in
                draft_frontmatter: draftFrontmatter,

                next_steps: [
                  alreadyWikiFormat
                    ? "File already has wiki frontmatter. Review and call wiki_write_page directly."
                    : "Fill in draft_frontmatter (tldr, tags, related), restructure body into TL;DR + Detail sections, then call wiki_write_page.",
                  targetExists
                    ? `Target page exists at ${targetRelPath}. Call wiki_read_page('${targetRelPath}', 'full') to compare before merging.`
                    : `No existing page at ${suggestedPath}. Create a new page with wiki_write_page.`,
                  candidates.length > 0
                    ? `${candidates.length} related page(s) found — update their 'related' links after writing.`
                    : "No related pages found.",
                ],
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
