import fs from "fs";
import path from "path";

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

const INDEX_HEADER = `| path | tldr | tags | last_modified |
|------|------|------|---------------|`;

/** Parse _index.md → array of IndexRow */
export function parseIndexFile(content: string): IndexRow[] {
  const rows: IndexRow[] = [];
  const lines = content.split("\n");
  let inTable = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!inTable) {
      if (trimmed.startsWith("| path")) {
        inTable = true;
        continue;
      }
      continue;
    }
    // Skip separator row
    if (/^\|[-| ]+\|$/.test(trimmed)) continue;
    if (!trimmed.startsWith("|")) {
      inTable = false;
      continue;
    }

    const parts = trimmed
      .slice(1, -1)
      .split("|")
      .map((s) => s.trim());

    if (parts.length >= 4) {
      rows.push({
        path: parts[0],
        tldr: parts[1],
        tags: parts[2],
        last_modified: parts[3],
      });
    }
  }
  return rows;
}

/** Serialize rows → Markdown table */
export function serializeIndex(rows: IndexRow[]): string {
  const lines = [INDEX_HEADER];
  for (const row of rows) {
    lines.push(
      `| ${row.path} | ${escapeMd(row.tldr)} | ${row.tags} | ${row.last_modified} |`
    );
  }
  return lines.join("\n") + "\n";
}

function escapeMd(s: string): string {
  return s.replace(/\|/g, "\\|");
}

/** Ghi _index.md */
export function writeIndexFile(vaultPath: string, rows: IndexRow[]): void {
  const indexPath = path.join(vaultPath, "_index.md");
  const content = `# Wiki Index\n\n<!-- File này do MCP tự động quản lý. KHÔNG edit thủ công. -->\n\n${serializeIndex(rows)}`;
  fs.writeFileSync(indexPath, content, "utf-8");
}

/** Đọc rows từ _index.md */
export function readIndexRows(vaultPath: string): IndexRow[] {
  const indexPath = path.join(vaultPath, "_index.md");
  if (!fs.existsSync(indexPath)) return [];
  const content = fs.readFileSync(indexPath, "utf-8");
  return parseIndexFile(content);
}

/** Update hoặc thêm một row trong _index.md */
export function upsertIndexRow(vaultPath: string, newRow: IndexRow): void {
  const rows = readIndexRows(vaultPath);
  const idx = rows.findIndex((r) => r.path === newRow.path);
  if (idx >= 0) {
    rows[idx] = newRow;
  } else {
    rows.push(newRow);
  }
  writeIndexFile(vaultPath, rows);
}

/** Build in-memory BM25 index từ rows */
export async function buildBm25Index(vaultPath: string): Promise<Bm25Index> {
  const rows = readIndexRows(vaultPath);

  // Simple TF-IDF / BM25 implementation (không dùng wink do ESM compatibility issues)
  // Dùng simple keyword scoring thay thế
  return createSimpleBm25(rows);
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

const STOPWORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "shall", "can", "that", "this", "these",
  "those", "i", "you", "he", "she", "it", "we", "they", "what", "which",
  "who", "how", "when", "where", "why", "và", "của", "là", "có", "cho",
  "với", "trong", "không", "được", "đã", "các", "một", "để", "từ",
]);

function getTerms(text: string): string[] {
  return tokenize(text).filter((t) => !STOPWORDS.has(t));
}

interface DocIndex {
  id: string;
  terms: Map<string, number>; // term → count
  totalTerms: number;
  row: IndexRow;
}

function createSimpleBm25(initialRows: IndexRow[]): Bm25Index {
  const docs = new Map<string, DocIndex>();

  function indexRow(row: IndexRow): void {
    const text = `${row.path} ${row.tldr} ${row.tags}`;
    const terms = getTerms(text);
    const termMap = new Map<string, number>();
    for (const t of terms) {
      termMap.set(t, (termMap.get(t) ?? 0) + 1);
    }
    docs.set(row.path, { id: row.path, terms: termMap, totalTerms: terms.length, row });
  }

  for (const row of initialRows) indexRow(row);

  function score(doc: DocIndex, queryTerms: string[]): number {
    const k1 = 1.5;
    const b = 0.75;
    const avgDocLen = 20;
    let s = 0;
    const N = Math.max(docs.size, 1);

    for (const term of queryTerms) {
      // Doc frequency
      let df = 0;
      for (const d of docs.values()) {
        if (d.terms.has(term)) df++;
      }
      if (df === 0) continue;

      const idf = Math.log((N - df + 0.5) / (df + 0.5) + 1);
      const tf = doc.terms.get(term) ?? 0;
      const docLen = doc.totalTerms;
      const tfNorm =
        (tf * (k1 + 1)) /
        (tf + k1 * (1 - b + b * (docLen / avgDocLen)));
      s += idf * tfNorm;
    }
    return s;
  }

  return {
    search(query: string, topK = 5): SearchResult[] {
      const queryTerms = getTerms(query);
      if (queryTerms.length === 0 || docs.size === 0) return [];

      const scored: Array<{ path: string; tldr: string; score: number }> = [];
      for (const doc of docs.values()) {
        const s = score(doc, queryTerms);
        if (s > 0) {
          scored.push({ path: doc.row.path, tldr: doc.row.tldr, score: s });
        }
      }

      scored.sort((a, b) => b.score - a.score);
      const maxScore = scored[0]?.score ?? 1;

      return scored.slice(0, topK).map((r) => ({
        ...r,
        score: parseFloat((r.score / maxScore).toFixed(2)),
      }));
    },

    addDoc(row: IndexRow): void {
      indexRow(row);
    },

    removeDoc(filePath: string): void {
      docs.delete(filePath);
    },

    rebuild(rows: IndexRow[]): void {
      docs.clear();
      for (const row of rows) indexRow(row);
    },
  };
}
