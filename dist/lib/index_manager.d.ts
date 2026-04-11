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
}
/** Parse _index.md → array of IndexRow */
export declare function parseIndexFile(content: string): IndexRow[];
/** Serialize rows → Markdown table */
export declare function serializeIndex(rows: IndexRow[]): string;
/** Ghi _index.md */
export declare function writeIndexFile(vaultPath: string, rows: IndexRow[]): void;
/** Đọc rows từ _index.md */
export declare function readIndexRows(vaultPath: string): IndexRow[];
/** Update hoặc thêm một row trong _index.md */
export declare function upsertIndexRow(vaultPath: string, newRow: IndexRow): void;
/** Build in-memory BM25 index từ rows */
export declare function buildBm25Index(vaultPath: string): Promise<Bm25Index>;
