import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Config } from "../config.js";
import { Bm25Index } from "../lib/index_manager.js";
import { BacklinkIndex } from "../lib/backlink_index.js";
export interface ToolContext {
    config: Config;
    bm25Index: Bm25Index;
    backlinkIndex: BacklinkIndex;
}
export declare function registerTools(server: McpServer, ctx: ToolContext): void;
