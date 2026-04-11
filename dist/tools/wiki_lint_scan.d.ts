import { Config } from "../config.js";
import { Bm25Index } from "../lib/index_manager.js";
import { BacklinkIndex } from "../lib/backlink_index.js";
export type IssueType = "ORPHAN" | "MISSING_TLDR" | "STALE" | "BROKEN_LINK";
export interface LintIssue {
    id: string;
    type: IssueType;
    severity: "high" | "medium" | "low";
    pages: string[];
    detail: string;
    suggested_action: string;
}
export declare let lastLintIssues: LintIssue[];
export declare function registerWikiLintScan(server: import("@modelcontextprotocol/sdk/server/mcp.js").McpServer, ctx: {
    config: Config;
    bm25Index: Bm25Index;
    backlinkIndex: BacklinkIndex;
}): void;
