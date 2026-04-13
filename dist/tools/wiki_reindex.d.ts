import { Config } from "../config.js";
import { Bm25Index } from "../lib/index_manager.js";
import { BacklinkIndex } from "../lib/backlink_index.js";
export declare function registerWikiReindex(server: import("@modelcontextprotocol/sdk/server/mcp.js").McpServer, ctx: {
    config: Config;
    bm25Index: Bm25Index;
    backlinkIndex: BacklinkIndex;
}): void;
