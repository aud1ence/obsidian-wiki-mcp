export interface IndexRow {
    path: string;
    tldr: string;
    tags: string;
    last_modified: string;
}
export interface SearchResult {
    path: string;
    tldr: string;
    score: number;
}
export interface Bm25Index {
    search(query: string, topK?: number): SearchResult[];
    addDoc(row: IndexRow): void;
    removeDoc(filePath: string): void;
    rebuild(rows: IndexRow[]): void;
    getRow(filePath: string): IndexRow | undefined;
}
/** Parse _index.md → array of IndexRow */
export declare function parseIndexFile(content: string): IndexRow[];
/** Serialize rows → Markdown table */
export declare function serializeIndex(rows: IndexRow[]): string;
/** Write _index.md */
export declare function writeIndexFile(vaultPath: string, rows: IndexRow[]): void;
/** Read rows from _index.md */
export declare function readIndexRows(vaultPath: string): IndexRow[];
/** Update or add a row in _index.md */
export declare function upsertIndexRow(vaultPath: string, newRow: IndexRow): void;
/** Build in-memory BM25 index from rows */
export declare function buildBm25Index(vaultPath: string): Promise<Bm25Index>;
/**
 * Validate _index.md against actual _wiki/ pages.
 * If out of sync (missing entries or orphaned entries), rebuild automatically.
 * Returns true if a rebuild was performed.
 */
export declare function validateAndRebuildIndex(vaultPath: string, bm25Index: Bm25Index): boolean;
