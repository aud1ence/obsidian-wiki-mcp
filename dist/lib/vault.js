import fs from "fs";
import path from "path";
/** Validate path is within vault, prevent path traversal */
export function validateVaultPath(userPath, vaultPath) {
    const abs = path.resolve(vaultPath, userPath);
    const vaultAbs = path.resolve(vaultPath);
    if (!abs.startsWith(vaultAbs + path.sep) && abs !== vaultAbs) {
        throw {
            code: "PATH_TRAVERSAL",
            message: `Path "${userPath}" is outside vault`,
        };
    }
    return abs;
}
/** Write file safely with lockfile + timeout */
export async function writePageSafe(absPath, content, lockTimeoutMs = 5000, staleLockTtlMs = 30000) {
    const lockPath = absPath + ".lock";
    // Cleanup stale lock
    if (fs.existsSync(lockPath)) {
        const stat = fs.statSync(lockPath);
        const age = Date.now() - stat.mtimeMs;
        if (age > staleLockTtlMs) {
            fs.unlinkSync(lockPath);
        }
    }
    // Wait for lock up to lockTimeoutMs
    const deadline = Date.now() + lockTimeoutMs;
    while (fs.existsSync(lockPath)) {
        if (Date.now() > deadline) {
            throw {
                code: "LOCK_TIMEOUT",
                message: "Page is being written by another tool. Try again later.",
            };
        }
        await sleep(100);
    }
    // Acquire → write → release
    fs.writeFileSync(lockPath, String(Date.now()));
    try {
        fs.mkdirSync(path.dirname(absPath), { recursive: true });
        fs.writeFileSync(absPath, content, "utf-8");
    }
    finally {
        if (fs.existsSync(lockPath))
            fs.unlinkSync(lockPath);
    }
}
/** Delete all stale locks in the vault */
export function cleanupStaleLocks(vaultPath, staleLockTtlMs = 30000) {
    if (!fs.existsSync(vaultPath))
        return;
    const cleanup = (dir) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                cleanup(full);
            }
            else if (entry.name.endsWith(".lock")) {
                const stat = fs.statSync(full);
                const age = Date.now() - stat.mtimeMs;
                if (age > staleLockTtlMs) {
                    fs.unlinkSync(full);
                }
            }
        }
    };
    cleanup(vaultPath);
}
/** Check if vault is initialized */
export function isVaultInitialized(vaultPath) {
    return fs.existsSync(path.join(vaultPath, "_schema.md"));
}
/** Read file in vault, return null if not exists */
export function readFile(absPath) {
    if (!fs.existsSync(absPath))
        return null;
    return fs.readFileSync(absPath, "utf-8");
}
/** List all .md files in _wiki/ */
export function listWikiPages(vaultPath) {
    const wikiDir = path.join(vaultPath, "_wiki");
    if (!fs.existsSync(wikiDir))
        return [];
    const results = [];
    const walk = (dir) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                walk(full);
            }
            else if (entry.name.endsWith(".md") && !entry.name.startsWith(".")) {
                results.push(full);
            }
        }
    };
    walk(wikiDir);
    return results;
}
/** Relative path from vault root */
export function relPath(absPath, vaultPath) {
    return path.relative(vaultPath, absPath);
}
function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}
//# sourceMappingURL=vault.js.map