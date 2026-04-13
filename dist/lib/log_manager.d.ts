export interface LogEntry {
    timestamp: string;
    operation: "ingest" | "query" | "write" | "lint" | "init" | "fix" | "reindex";
    source?: string;
    metadata: Record<string, unknown>;
}
export declare function appendLog(vaultPath: string, entry: LogEntry): void;
export declare function updateLastLintAnchor(vaultPath: string): void;
