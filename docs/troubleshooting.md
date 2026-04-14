# Troubleshooting

## MCP server fails to connect (`Failed to reconnect`)

**Most common cause:** a vault path containing spaces was split incorrectly in `~/.claude.json`.

Inspect the config:

```bash
cat ~/.claude.json | python3 -c "
import json, sys
d = json.load(sys.stdin)
for k, v in d.get('projects', {}).items():
    if 'mcpServers' in v and 'obsidian-wiki' in v['mcpServers']:
        print(k)
        print(json.dumps(v['mcpServers']['obsidian-wiki'], indent=2))
"
```

Look at the `args` array. If `--vault` is followed by two separate entries, the path was split:

```json
// WRONG — path split at the space
"args": ["-y", "obsidian-wiki-mcp", "--vault", "/Users/name/Library/Mobile", "Documents/MyVault"]

// CORRECT
"args": ["-y", "obsidian-wiki-mcp", "--vault", "/Users/name/Library/Mobile Documents/MyVault"]
```

Fix: edit `~/.claude.json` directly, or remove and re-add the server using a quoted path:

```bash
claude mcp remove obsidian-wiki
claude mcp add obsidian-wiki -- npx -y obsidian-wiki-mcp --vault "/Users/name/Library/Mobile Documents/MyVault"
```

---

## Vault not initialized (`VAULT_NOT_INIT`)

```
[obsidian-wiki-mcp] WARN: Vault not initialized (no _schema.md found)
```

The server starts but `wiki_ingest` and `wiki_write_page` return `VAULT_NOT_INIT`. Fix:

```
Call wiki_init()
```

---

## Search returns no results

**Symptom:** `wiki_query` always returns `status: "not_found"` even for pages you know exist.

**Cause:** `_index.md` is out of sync — pages were created or edited outside the MCP.

**Fix:**

```
Call wiki_reindex()
```

---

## `_index.md` has wrong row count

Same cause and fix as above — run `wiki_reindex()`. To preview what will be indexed first:

```
Call wiki_reindex(dry_run=true)
```

---

## Lock file left behind (`LOCK_TIMEOUT`)

```
{ code: "LOCK_TIMEOUT", message: "Page is being written by another tool. Try again later." }
```

A `.lock` file from a previous failed write is blocking. Lock files older than `stale_lock_ttl_ms` (default 30 s) are cleaned up automatically on the next write attempt. If the problem persists:

1. Check for `*.lock` files in `_wiki/`:
   ```bash
   find /path/to/vault/_wiki -name "*.lock"
   ```
2. Delete them manually if they are stale (older than a minute).

---

## Page appears in `_index.md` but not in search results

The in-memory BM25 index is built at startup from `_index.md`. If you edited `_index.md` manually or restarted the server in an unusual state, the in-memory index may differ from the file. Run `wiki_reindex()` to force a full rebuild of both.
