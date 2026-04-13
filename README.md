# obsidian-wiki-mcp

MCP server implementing [Karpathy's LLM Wiki pattern](https://x.com/karpathy/status/1863099529009164779) for Obsidian vaults.

Solves **document drift** — your vault stays up-to-date as knowledge evolves across AI sessions.

> **Design principle:** The server is a pure storage/retrieval layer. All content decisions (what to write, how to synthesize) are made by the host LLM (Claude). The server never calls an AI model.

---

## Table of Contents

- [Installation](#installation)
- [Adding to Claude Code](#adding-to-claude-code)
- [Configuration](#configuration)
- [First-time Vault Setup](#first-time-vault-setup)
- [Vault Structure](#vault-structure)
- [Page Format](#page-format)
- [Tools Reference](#tools-reference)
- [Workflow](#workflow)
- [Troubleshooting](#troubleshooting)

---

## Installation

### Option 1: npx (recommended — no install needed)

```bash
claude mcp add obsidian-wiki -- npx -y obsidian-wiki-mcp --vault "/path/to/your/vault"
```


---

## Adding to Claude Code

> **Important:** If your vault path contains **spaces**, always wrap it in double quotes `"`. Do not use backslash escaping (`\ `) — it is parsed incorrectly by `claude mcp add`.

### Correct

```bash
claude mcp add obsidian-wiki -- npx -y obsidian-wiki-mcp --vault "/Users/yourname/Library/Mobile Documents/iCloud~md~obsidian/Documents/MyVault"
```

### Incorrect (path gets split at the space)

```bash
# DON'T do this — backslash escaping does not work here
claude mcp add obsidian-wiki -- npx -y obsidian-wiki-mcp --vault /Users/yourname/Library/Mobile\ Documents/...
```

After adding, verify the server is connected by running `/mcp` inside Claude Code.

---

## Configuration



### Config file (`~/.obsidian-wiki-mcp.json`)

```json
{
  "vault_path": "~/Documents/MyVault",
  "log_level": "info",
  "lock_timeout_ms": 5000,
  "bm25_top_k": 5,
  "stale_lock_ttl_ms": 30000
}
```

| Key                 | Default      | Description                                       |
| ------------------- | ------------ | ------------------------------------------------- |
| `vault_path`        | _(required)_ | Path to your Obsidian vault                       |
| `log_level`         | `"info"`     | Log verbosity: `"info"` or `"debug"`              |
| `lock_timeout_ms`   | `5000`       | Timeout waiting for file lock (ms)                |
| `bm25_top_k`        | `5`          | Max results returned by search                    |
| `stale_lock_ttl_ms` | `30000`      | Age at which a lock file is considered stale (ms) |

---

## First-time Vault Setup

Once the MCP server is connected, ask Claude to run:

```
Call wiki_init() to initialize the vault.
```

This creates:

- Directories: `_wiki/infra/`, `_wiki/ops/`, `_wiki/concepts/`, `_wiki/projects/`, `_sources/`
- `_schema.md` — vault constitution (rules and conventions)
- `_log.md` — append-only change log (auto-managed)
- `_index.md` — BM25 search catalog (auto-managed)

> If the vault was already initialized, `wiki_init()` reports `already_initialized` and does not overwrite anything.

---

## Vault Structure

```
your-vault/
├── _wiki/
│   ├── infra/        ← servers, network, deployment
│   ├── ops/          ← incidents, runbooks, troubleshooting
│   ├── concepts/     ← technical concepts, architecture
│   └── projects/     ← per-project knowledge
├── _sources/         ← raw immutable inputs (do not edit manually)
├── _schema.md        ← vault constitution — read before doing anything
├── _log.md           ← append-only log — DO NOT edit manually
└── _index.md         ← BM25 catalog — DO NOT edit manually
```

### Naming convention

- Use **kebab-case**: `redis-oom.md`, `server-35-setup.md`
- Incident pages: `ops/incident-YYYY-MM-DD-<slug>.md`

---

## Page Format

Every page inside `_wiki/` **must** follow this structure:

```markdown
---
tldr: "One sentence, ≤ 100 tokens, plain text"
tags: [infra, redis, server-35]
related:
  ["[[_wiki/infra/redis-setup.md]]", "[[_wiki/ops/incident-2024-01-01.md]]"]
last_modified: "2024-01-15"
last_linted: "2024-01-15"
dirty: false
source: "claude-session-1"
---

## TL;DR

Short summary, 2–4 sentences. This is the shallow-read layer.

---

## Detail

Full content: root cause, steps, examples, references.
```

### Suggested tag taxonomy

| Group    | Tags                                                               |
| -------- | ------------------------------------------------------------------ |
| Infra    | `infra`, `k8s`, `freeswitch`, `redis`, `mongodb`, `minio`, `mysql` |
| Ops      | `incident`, `runbook`, `troubleshoot`, `backup`, `deploy`          |
| Projects | `project-alpha`, `website-v2`, `mobile-app`                        |
| Scope    | `server-35`, `server-pbx1`, `prod`, `staging`                      |

---

## Tools Reference

### `wiki_init`

Initialize the vault: create directory structure and system files.

```
Call wiki_init()
```

Run **once** on first setup. Safe to call again — will not overwrite existing files.

---

### `wiki_ingest(content, source, tags?)`

Accept raw content from a session, find related pages, and return context for the LLM to decide the next action.

| Parameter | Required | Description                                      |
| --------- | -------- | ------------------------------------------------ |
| `content` | Yes      | Content to ingest (log, note, conversation, ...) |
| `source`  | Yes      | Origin label: `claude-session-1`, `manual`, etc. |
| `tags`    | No       | Suggested tags to improve search relevance       |

**Example:**

```
Ingest the following into the wiki:
"Redis on server-35 went OOM at 2:00 AM. Root cause: maxmemory was not set.
Fix: added maxmemory 4gb and maxmemory-policy allkeys-lru to redis.conf."

source: claude-session-1, tags: [redis, ops, server-35]
```

The tool returns a list of candidate pages and the recommended next step.

---

### `wiki_query(question)`

BM25 search across the vault, returning raw TL;DRs for the LLM to synthesize into an answer.

```
Use wiki_query to find information about "redis OOM server-35"
```

- Automatically falls back to full-text scan if BM25 returns no results
- Returns top 3 results with their TL;DR sections

---

### `wiki_read_page(path, depth)`

Read a page's content.

| `depth`     | Returns                            |
| ----------- | ---------------------------------- |
| `"shallow"` | TL;DR only (fast, token-efficient) |
| `"full"`    | Full page content                  |

```
Read the full page _wiki/infra/redis-setup.md
```

---

### `wiki_write_page(path, content, source)`

Write a page to the vault. Called by the LLM after deciding on the content.

| Parameter | Description                               |
| --------- | ----------------------------------------- |
| `path`    | Relative path: `_wiki/infra/redis-oom.md` |
| `content` | Markdown with complete YAML frontmatter   |
| `source`  | Origin label: `claude-session-1`          |

Automatically:

- Sets `last_modified` if missing
- Updates the BM25 index and `_index.md`
- Appends an entry to `_log.md`
- Uses file locking to prevent write conflicts

---

### `wiki_lint_scan()`

Scan the vault for structural issues.

```
Run wiki_lint_scan() to check vault health
```

Detects four issue types:

| Type           | Description                                     |
| -------------- | ----------------------------------------------- |
| `ORPHAN`       | Page with no backlinks after 7 days             |
| `MISSING_TLDR` | Page missing the `## TL;DR` section             |
| `STALE`        | `last_modified` > 90 days old and `dirty: true` |
| `BROKEN_LINK`  | `[[link]]` pointing to a non-existent page      |

---

### `wiki_apply_fix(issue_id)`

Apply a fix for an issue detected by `wiki_lint_scan`.

```
Use wiki_apply_fix to fix the ORPHAN issue at _wiki/infra/old-server.md
```

---

### `wiki_import(file_path, suggested_wiki_path?, tags?)`

Read a `.md` file from **any path on disk** (inside or outside the vault) and prepare it for wiki ingestion. The server reads the file directly — Claude does not need to read it first.

| Parameter             | Required | Description                                                                      |
| --------------------- | -------- | -------------------------------------------------------------------------------- |
| `file_path`           | Yes      | Absolute or `~`-relative path to the source `.md` file                           |
| `suggested_wiki_path` | No       | Target path in wiki, e.g. `_wiki/infra/redis-tips.md`. Auto-suggested if omitted |
| `tags`                | No       | Tags to improve candidate search                                                 |

**What it returns:**

- `raw_content` — full file content (truncated at ~4000 tokens if very large)
- `draft_frontmatter` — a template with `tldr`, `tags`, `related` fields for the LLM to fill in
- `candidates` — existing wiki pages related to this content
- `next_steps` — instructions for what to do next

**Flow when using Claude Code:**

```
User: "Import ~/notes/redis-tips.md into the wiki"

Claude:
  1. wiki_import("~/notes/redis-tips.md")
       → receives raw_content + draft_frontmatter + candidate pages
  2. wiki_read_page(candidate, 'full')     ← if a related page needs merging
  3. wiki_write_page(
       path  = "_wiki/infra/redis-tips.md",
       content = <filled frontmatter + TL;DR + Detail>,
       source = "import:redis-tips.md"
     )
```

**Example:**

```
Import ~/Documents/notes/k8s-ingress.md into the wiki under infra
```

```
Import /tmp/incident-report.md as _wiki/ops/incident-2024-06-01-k8s-crash.md
```

---

### `wiki_reindex(dry_run?)`

Rescan all files in `_wiki/` and rebuild the BM25 index and `_index.md`.

**When to use:** after creating or editing `.md` files directly in Obsidian (outside the MCP). The server indexes files in-memory at startup and via `wiki_write_page` — manually created files are invisible to search until reindexed.

| Parameter | Default | Description                                                      |
| --------- | ------- | ---------------------------------------------------------------- |
| `dry_run` | `false` | If `true`, report what would be indexed without writing anything |

```
Run wiki_reindex() to pick up new pages I added in Obsidian
```

```
Run wiki_reindex(dry_run=true) to preview what will be indexed
```

---

## Workflow

### First-time setup

```
1. wiki_init()                      ← create vault structure
```

### After each working session (saving new knowledge)

```
2. wiki_ingest(content, source)     ← find related candidate pages
3. wiki_read_page(path, 'full')     ← read pages to update (if needed)
4. wiki_write_page(path, content)   ← write the synthesized result
```

### Looking something up

```
5. wiki_query("your question")      ← search → synthesize answer
6. wiki_read_page(path, 'full')     ← read full detail if needed
```

### Importing an existing .md file into the wiki

```
1. wiki_import("/path/to/file.md")          ← server reads file, finds candidates, returns draft
2. wiki_read_page(candidate, 'full')        ← compare with existing page (if needed)
3. wiki_write_page("_wiki/…/page.md", …)   ← write with proper frontmatter + TL;DR + Detail
```

### After manually creating files in Obsidian

```
wiki_reindex()                              ← rebuild indexes so new files are searchable
```

### Periodic maintenance

```
wiki_lint_scan()                    ← check vault health
wiki_apply_fix(issue_id)            ← fix detected issues
```

---

## Troubleshooting

### MCP server fails to connect (`Failed to reconnect`)

**Most common cause:** a vault path containing spaces gets split incorrectly in `~/.claude.json`.

Inspect your config:

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

If the `--vault` value is split across two entries in the `args` array:

```json
// WRONG — path was split at the space
"args": ["dist/index.js", "--vault", "/Users/name/Library/Mobile", "Documents/..."]

// CORRECT
"args": ["dist/index.js", "--vault", "/Users/name/Library/Mobile Documents/..."]
```

Fix by editing `~/.claude.json` directly, or remove and re-add the server using a quoted path.

---

### Vault not initialized

```
[obsidian-wiki-mcp] WARN: Vault not initialized (no _schema.md found)
```

The server still starts, but `wiki_ingest` and `wiki_write_page` will return a `VAULT_NOT_INIT` error. Run `wiki_init()` to fix.



## License

MIT
