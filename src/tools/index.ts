import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Config } from "../config.js";
import { Bm25Index } from "../lib/index_manager.js";
import { BacklinkIndex } from "../lib/backlink_index.js";
import { registerWikiInit } from "./wiki_init.js";
import { registerWikiIngest } from "./wiki_ingest.js";
import { registerWikiWritePage } from "./wiki_write_page.js";
import { registerWikiQuery } from "./wiki_query.js";
import { registerWikiReadPage } from "./wiki_read_page.js";
import { registerWikiLintScan } from "./wiki_lint_scan.js";
import { registerWikiApplyFix } from "./wiki_apply_fix.js";

export interface ToolContext {
  config: Config;
  bm25Index: Bm25Index;
  backlinkIndex: BacklinkIndex;
}

export function registerTools(server: McpServer, ctx: ToolContext): void {
  registerWikiInit(server, ctx);
  registerWikiIngest(server, ctx);
  registerWikiWritePage(server, ctx);
  registerWikiQuery(server, ctx);
  registerWikiReadPage(server, ctx);
  registerWikiLintScan(server, ctx);
  registerWikiApplyFix(server, ctx);
}
