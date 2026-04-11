import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { z } from "zod";
import { Config } from "../config.js";
import { Bm25Index } from "../lib/index_manager.js";
import { BacklinkIndex } from "../lib/backlink_index.js";
import { validateVaultPath } from "../lib/vault.js";

export function registerWikiReadPage(
  server: import("@modelcontextprotocol/sdk/server/mcp.js").McpServer,
  ctx: { config: Config; bm25Index: Bm25Index; backlinkIndex: BacklinkIndex }
) {
  server.registerTool(
    "wiki_read_page",
    {
      description: "Đọc một page trong vault. depth='shallow' chỉ trả TL;DR, depth='full' trả toàn bộ content.",
      inputSchema: {
        path: z.string().describe("Relative path trong vault, ví dụ: _wiki/infra/redis-oom.md"),
        depth: z.enum(["shallow", "full"]).describe("'shallow' để đọc TL;DR, 'full' để đọc toàn bộ content"),
      },
    },
    async (args) => {
      const vaultPath = ctx.config.vaultPath;

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

      if (!fs.existsSync(absPath)) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                status: "error",
                code: "PAGE_NOT_FOUND",
                message: `Page không tồn tại: ${args.path}`,
              }),
            },
          ],
        };
      }

      const rawContent = fs.readFileSync(absPath, "utf-8");
      const parsed = matter(rawContent);
      const fm = parsed.data;
      const relPagePath = path.relative(vaultPath, absPath);

      if (args.depth === "shallow") {
        const tldrMatch = parsed.content.match(
          /## TL;DR\n+([\s\S]*?)(?=\n---|\n## |$)/
        );
        const tldrSection = tldrMatch ? tldrMatch[1].trim() : null;
        const hasDetail = parsed.content.includes("## Detail");

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  path: relPagePath,
                  depth: "shallow",
                  frontmatter: {
                    tldr: fm.tldr ?? "",
                    tags: fm.tags ?? [],
                    related: fm.related ?? [],
                    last_modified: fm.last_modified ?? "",
                    dirty: fm.dirty ?? false,
                  },
                  tldr_section: tldrSection,
                  has_detail: hasDetail,
                },
                null,
                2
              ),
            },
          ],
        };
      } else {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  path: relPagePath,
                  depth: "full",
                  frontmatter: fm,
                  content: parsed.content,
                },
                null,
                2
              ),
            },
          ],
        };
      }
    }
  );
}
