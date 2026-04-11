/** Validate path nằm trong vault, chống path traversal */
export declare function validateVaultPath(userPath: string, vaultPath: string): string;
/** Ghi file an toàn với lockfile + timeout */
export declare function writePageSafe(absPath: string, content: string, lockTimeoutMs?: number, staleLockTtlMs?: number): Promise<void>;
/** Xóa tất cả stale locks trong vault */
export declare function cleanupStaleLocks(vaultPath: string, staleLockTtlMs?: number): void;
/** Kiểm tra vault đã init chưa */
export declare function isVaultInitialized(vaultPath: string): boolean;
/** Đọc file trong vault, trả null nếu không tồn tại */
export declare function readFile(absPath: string): string | null;
/** List tất cả .md files trong _wiki/ */
export declare function listWikiPages(vaultPath: string): string[];
/** Relative path từ vault root */
export declare function relPath(absPath: string, vaultPath: string): string;
