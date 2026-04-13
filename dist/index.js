#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { resolveConfig } from "./config.js";
import { buildBm25Index } from "./lib/index_manager.js";
import { buildBacklinkIndex } from "./lib/backlink_index.js";
import { cleanupStaleLocks, isVaultInitialized } from "./lib/vault.js";
import { registerTools } from "./tools/index.js";
import fs from "fs";
async function main() {
    const config = resolveConfig();
    // Validate vault path exists
    if (!fs.existsSync(config.vaultPath)) {
        console.error(`[obsidian-wiki-mcp] ERROR: Vault path does not exist: ${config.vaultPath}`);
        process.exit(1);
    }
    // Check read/write permissions
    try {
        fs.accessSync(config.vaultPath, fs.constants.R_OK | fs.constants.W_OK);
    }
    catch {
        console.error(`[obsidian-wiki-mcp] ERROR: No read/write permissions for vault: ${config.vaultPath}`);
        process.exit(1);
    }
    // Check vault init
    const vaultInit = isVaultInitialized(config.vaultPath);
    if (!vaultInit) {
        console.error(`[obsidian-wiki-mcp] WARN: Vault not initialized (missing _schema.md). Run wiki_init() to initialize.`);
    }
    // Cleanup stale locks
    cleanupStaleLocks(config.vaultPath, config.staleLockTtlMs);
    // Build indexes
    const bm25Index = await buildBm25Index(config.vaultPath);
    const backlinkIndex = await buildBacklinkIndex(config.vaultPath);
    if (config.logLevel === "debug") {
        console.error(`[obsidian-wiki-mcp] Vault: ${config.vaultPath}`);
        console.error(`[obsidian-wiki-mcp] Vault initialized: ${vaultInit}`);
    }
    // Create MCP server
    const server = new McpServer({
        name: "obsidian-wiki-mcp",
        version: "0.1.0",
    });
    // Register all tools
    registerTools(server, { config, bm25Index, backlinkIndex });
    // Start stdio transport
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("[obsidian-wiki-mcp] Server ready. Vault: " + config.vaultPath);
}
main().catch((err) => {
    console.error("[obsidian-wiki-mcp] FATAL:", err);
    process.exit(1);
});
//# sourceMappingURL=index.js.map