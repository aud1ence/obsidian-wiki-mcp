/** Validate path is within vault, prevent path traversal */
export declare function validateVaultPath(userPath: string, vaultPath: string): string;
/** Write file safely with lockfile + timeout */
export declare function writePageSafe(absPath: string, content: string, lockTimeoutMs?: number, staleLockTtlMs?: number): Promise<void>;
/** Delete all stale locks in the vault */
export declare function cleanupStaleLocks(vaultPath: string, staleLockTtlMs?: number): void;
/** Check if vault is initialized */
export declare function isVaultInitialized(vaultPath: string): boolean;
/** Read file in vault, return null if not exists */
export declare function readFile(absPath: string): string | null;
/** List all .md files in _wiki/ */
export declare function listWikiPages(vaultPath: string): string[];
/** Relative path from vault root */
export declare function relPath(absPath: string, vaultPath: string): string;
