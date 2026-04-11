export interface Config {
    vaultPath: string;
    logLevel: "debug" | "info" | "warn" | "error";
    lockTimeoutMs: number;
    bm25TopK: number;
    staleLockTtlMs: number;
}
export declare function resolveConfig(): Config;
