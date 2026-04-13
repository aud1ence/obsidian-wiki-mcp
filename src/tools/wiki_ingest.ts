import fs from "fs";
import path from "path";
import { z } from "zod";
import { Config } from "../config.js";
import { Bm25Index } from "../lib/index_manager.js";
import { BacklinkIndex } from "../lib/backlink_index.js";
import { isVaultInitialized } from "../lib/vault.js";
import { appendLog } from "../lib/log_manager.js";

const MAX_CONTENT_TOKENS_APPROX = 4000;
const TOKENS_PER_CHAR = 0.25;

function estimateTokens(text: string): number {
  return Math.ceil(text.length * TOKENS_PER_CHAR);
}

function chunkContent(content: string): string[] {
  const estimated = estimateTokens(content);
  if (estimated <= MAX_CONTENT_TOKENS_APPROX) return [content];

  const paragraphs = content.split(/\n\n+/);
  const chunks: string[] = [];
  let current = "";

  for (const para of paragraphs) {
    const combined = current ? current + "\n\n" + para : para;
    if (estimateTokens(combined) > MAX_CONTENT_TOKENS_APPROX && current) {
      chunks.push(current.trim());
      current = para;
    } else {
      current = combined;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

function getSchemaExcerpt(vaultPath: string): string {
  const schemaPath = path.join(vaultPath, "_schema.md");
  if (!fs.existsSync(schemaPath)) return "";
  const content = fs.readFileSync(schemaPath, "utf-8");
  const match = content.match(/## Ingest Rules\n([\s\S]*?)(?=\n## |$)/);
  return match ? match[1].trim() : "";
}

export function registerWikiIngest(
  server: import("@modelcontextprotocol/sdk/server/mcp.js").McpServer,
  ctx: { config: Config; bm25Index: Bm25Index; backlinkIndex: BacklinkIndex }
) {
  server.registerTool(
    "wiki_ingest",
    {
      description: "Receive raw content from session, find relevant pages, return context for host LLM to decide on action",
      inputSchema: {
        content: z.string().describe("Raw content to ingest (conversation, log, note, ...)"),
        source: z.string().describe("Source of content: claude-session-X, kiro-session-X, manual, ..."),
        tags: z.array(z.string()).optional().describe("Suggested tags (optional)"),
      },
    },
    async (args) => {
      const { content, source, tags = [] } = args;
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

      if (estimateTokens(content) < 50) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ status: "too_short" }),
            },
          ],
        };
      }

      const chunks = chunkContent(content);
      const isMultiChunk = chunks.length > 1;
      const searchChunk = chunks[0];

      const results = ctx.bm25Index.search(
        searchChunk + " " + tags.join(" "),
        ctx.config.bm25TopK
      );

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

      const response: Record<string, unknown> = {
        status: "context_ready",
        candidates: results.map((r) => ({
          path: r.path,
          tldr: r.tldr,
          score: r.score,
        })),
        schema_excerpt: schemaExcerpt,
        next_step:
          results.length === 0
            ? "No existing pages found. Create a new page with wiki_write_page."
            : "Review candidates above. Call wiki_read_page(path, 'full') for pages to update, then wiki_write_page to save.",
      };

      if (isMultiChunk) {
        response.chunks = chunks.length;
        response.chunk_note = `Content divided into ${chunks.length} chunks. This is context for chunk 1/${chunks.length}.`;
        response.remaining_chunks = chunks.slice(1);
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(response, null, 2),
          },
        ],
      };
    }
  );
}
