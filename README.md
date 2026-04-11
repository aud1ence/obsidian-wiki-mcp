# obsidian-wiki-mcp

MCP server implementing [Karpathy's LLM Wiki pattern](https://x.com/karpathy/status/1863099529009164779) for Obsidian vaults.

Solves **document drift** — your vault stays up-to-date as knowledge evolves across AI sessions.

## Design principle

The server is a **pure storage/retrieval layer**. All content decisions (what to write, how to synthesize) are made by the host LLM (Claude). The server never calls an AI model.

## Installation

```bash
claude mcp add obsidian-wiki -- npx -y obsidian-wiki-mcp --vault ~/path/to/vault
```

Or with env var:

```bash
WIKI_VAULT_PATH=~/path/to/vault npx obsidian-wiki-mcp
```

## Tools (7)

| Tool              | Description                                                                 |
| ----------------- | --------------------------------------------------------------------------- |
| `wiki_init`       | Initialize vault: create `_schema.md`, `_log.md`, `_index.md`               |
| `wiki_ingest`     | Capture knowledge from session → return context for host LLM                |
| `wiki_write_page` | Write page to vault (called by host LLM after decision)                     |
| `wiki_query`      | BM25 search → return raw TL;DRs for host LLM to synthesize                  |
| `wiki_read_page`  | Read page at `shallow` (TL;DR only) or `full` depth                         |
| `wiki_lint_scan`  | Detect structural issues: orphans, missing TL;DR, stale pages, broken links |
| `wiki_apply_fix`  | Apply fix for a detected issue                                              |

## Workflow

```
1. wiki_init()                          ← first time only
2. wiki_ingest(content, source)         ← returns candidate pages
3. wiki_read_page(path, 'full')         ← read pages to update (optional)
4. wiki_write_page(path, content)       ← host LLM writes the result
5. wiki_query("your question")          ← search later
6. wiki_lint_scan()                     ← periodic health check
7. wiki_apply_fix(issue_id)             ← fix detected issues
```

## Vault structure

```
your-vault/
├── _wiki/
│   ├── infra/       ← servers, network, deployment
│   ├── ops/         ← incidents, runbooks, troubleshooting
│   ├── concepts/    ← technical concepts, architecture
│   └── projects/    ← per-project knowledge
├── _sources/        ← raw immutable inputs
├── _schema.md       ← constitution (read this first)
├── _log.md          ← append-only change log
└── _index.md        ← BM25 search index
```

## Config

Priority: CLI arg → env var → `~/.obsidian-wiki-mcp.json`

```json
{
  "vault_path": "~/Documents/MyVault",
  "log_level": "info",
  "lock_timeout_ms": 5000,
  "bm25_top_k": 5
}
```

## License

MIT
