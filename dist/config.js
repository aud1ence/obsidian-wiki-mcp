import fs from "fs";
import os from "os";
import path from "path";
const DEFAULT_CONFIG = {
    logLevel: "info",
    lockTimeoutMs: 5000,
    bm25TopK: 5,
    staleLockTtlMs: 30000,
};
function expandHome(p) {
    if (p.startsWith("~"))
        return path.join(os.homedir(), p.slice(1));
    return p;
}
function loadConfigFile() {
    const configPath = path.join(os.homedir(), ".obsidian-wiki-mcp.json");
    if (!fs.existsSync(configPath))
        return {};
    try {
        const raw = fs.readFileSync(configPath, "utf-8");
        const parsed = JSON.parse(raw);
        if (parsed.vault_path)
            parsed.vaultPath = expandHome(parsed.vault_path);
        return parsed;
    }
    catch {
        return {};
    }
}
export function resolveConfig() {
    // 1. CLI arg: --vault <path>
    const args = process.argv.slice(2);
    const vaultArgIdx = args.findIndex((a) => a === "--vault");
    const vaultFromCli = vaultArgIdx !== -1 ? expandHome(args[vaultArgIdx + 1]) : undefined;
    // 2. Env var
    const vaultFromEnv = process.env.WIKI_VAULT_PATH
        ? expandHome(process.env.WIKI_VAULT_PATH)
        : undefined;
    // 3. Config file
    const fileConfig = loadConfigFile();
    const vaultPath = vaultFromCli ?? vaultFromEnv ?? fileConfig.vaultPath ?? "";
    if (!vaultPath) {
        console.error("[obsidian-wiki-mcp] ERROR: vault_path is required.\n" +
            "  Set via: --vault <path>  OR  WIKI_VAULT_PATH env var  OR  ~/.obsidian-wiki-mcp.json");
        process.exit(1);
    }
    const absVaultPath = path.resolve(vaultPath);
    return {
        vaultPath: absVaultPath,
        logLevel: process.env.WIKI_LOG_LEVEL ??
            fileConfig.logLevel ??
            DEFAULT_CONFIG.logLevel,
        lockTimeoutMs: fileConfig.lockTimeoutMs ?? DEFAULT_CONFIG.lockTimeoutMs,
        bm25TopK: fileConfig.bm25TopK ?? DEFAULT_CONFIG.bm25TopK,
        staleLockTtlMs: fileConfig.staleLockTtlMs ?? DEFAULT_CONFIG.staleLockTtlMs,
    };
}
//# sourceMappingURL=config.js.map