# Tools Reference

All tools are exposed over MCP stdio. The host LLM (Claude) calls them — you instruct Claude in natural language.

---

## `wiki_init`

Initialize the vault: create directory structure and system files.

| Parameter       | Default                         | Description |
|-----------------|---------------------------------|-------------|
| `vault_path`    | config                          | Override vault path for this call |
| `folders`       | `systems, guides, topics, work` | Custom folder definitions (`{name, description}[]`) |
| `scan_existing` | `false`                         | Detect existing top-level dirs instead of using defaults |
| `force_reinit`  | `false`                         | Overwrite `_schema.md` on an already-initialized vault |

```
# Default
wiki_init()

# Custom folders
wiki_init(folders=[{name: "research", description: "papers and experiments"}, ...])

# Detect existing structure
wiki_init(scan_existing=true)

# Re-generate schema without touching pages
wiki_init(force_reinit=true, folders=[...])
```

Safe to call on an initialized vault without `force_reinit` — returns `already_initialized` and changes nothing.

---

## `wiki_ingest`

Accept raw session content, find related pages, return context for the LLM to decide what to write.

| Parameter | Required | Description |
|-----------|----------|-------------|
| `content` | Yes      | Raw text: log output, notes, conversation excerpts, ... |
| `source`  | Yes      | Origin label: `claude-session-1`, `manual`, etc. |
| `tags`    | No       | Suggested tags to improve BM25 candidate search |

**Returns:** `candidates` (related pages), `schema_excerpt` (from `_schema.md`), `next_step`.

The LLM uses the candidates to decide: update an existing page, create a new one, or both.

---

## `wiki_query`

BM25 keyword search across the vault. Returns raw TL;DRs — the LLM synthesizes the answer.

| Parameter  | Required | Description |
|------------|----------|-------------|
| `question` | Yes      | Natural language question or keyword string |

- Falls back to full-text scan if BM25 returns no results
- Returns up to `bm25_top_k` results (default: 5) with path, tldr, score

---

## `wiki_read_page`

Read a single page.

| Parameter | Required | Description |
|-----------|----------|-------------|
| `path`    | Yes      | Vault-relative path, e.g. `_wiki/systems/redis-oom.md` |
| `depth`   | Yes      | `"shallow"` (TL;DR only) or `"full"` (entire content) |

Use `shallow` first — it's token-efficient. Escalate to `full` only when the detail layer is needed.

---

## `wiki_write_page`

Write a page to the vault. Called by the LLM after deciding on content and path.

| Parameter | Required | Description |
|-----------|----------|-------------|
| `path`    | Yes      | Vault-relative path: `_wiki/systems/redis-oom.md` |
| `content` | Yes      | Full Markdown with YAML frontmatter |
| `source`  | Yes      | Origin label |

**Side effects (automatic):**
- Sets `last_modified` if missing from frontmatter
- Upserts the row in `_index.md`
- Appends to `_log.md`
- Updates in-memory BM25 and backlink indexes
- Creates intermediate sub-directories
- Acquires a `.lock` file to prevent write conflicts

---

## `wiki_lint_scan`

Scan all pages in `_wiki/` for structural issues.

No parameters.

**Issue types:**

| Type           | Severity | Condition |
|----------------|----------|-----------|
| `BROKEN_LINK`  | high     | `[[link]]` pointing to a non-existent page |
| `STALE`        | medium   | `last_modified` > 90 days and `dirty: true` |
| `ORPHAN`       | low      | Page with no backlinks after 7 days |
| `MISSING_TLDR` | low      | Page missing `## TL;DR` section |

Each issue gets a unique `id` (e.g. `issue-001`) used by `wiki_apply_fix`.

---

## `wiki_apply_fix`

Apply a fix for an issue detected by `wiki_lint_scan`.

| Parameter    | Required | Description |
|--------------|----------|-------------|
| `issue_id`   | Yes      | ID from `wiki_lint_scan`, e.g. `issue-001` |
| `resolution` | No       | For `BROKEN_LINK`: `"remove"` to strip the link |

**Behavior by issue type:**

| Type           | Result |
|----------------|--------|
| `STALE`        | Sets `dirty: false` in frontmatter — marks as acknowledged |
| `MISSING_TLDR` | Returns page content so LLM can add the section, then call `wiki_write_page` |
| `BROKEN_LINK`  | If no `resolution`: returns `needs_clarification`. With `resolution="remove"`: strips the broken link, leaves plain text |
| `ORPHAN`       | Returns content + suggestion to add backlinks from related pages |

---

## `wiki_import`

Read a `.md` file from any path on disk and prepare it for wiki ingestion.

| Parameter             | Required | Description |
|-----------------------|----------|-------------|
| `file_path`           | Yes      | Absolute or `~`-relative path to any `.md` file |
| `suggested_wiki_path` | No       | Target path, e.g. `_wiki/systems/redis-tips.md`. Auto-suggested if omitted |
| `tags`                | No       | Tags to improve candidate search |

**Path suggestion logic:** maps the source file's parent folder name to a matching top-level folder in `_wiki/`. Falls back to `_wiki/topics/` if no match.

**Returns:**
- `raw_content` — file content (truncated at ~4000 tokens if large)
- `draft_frontmatter` — template with `tldr`, `tags`, `related` placeholders
- `candidates` — related pages already in the wiki
- `available_folders` — top-level folders in `_wiki/` to choose the right destination
- `next_steps` — instructions for the LLM

**Typical flow:**
```
wiki_import("~/notes/redis-tips.md")
  → review raw_content + candidates

wiki_read_page(candidate, 'full')   ← if merging with an existing page

wiki_write_page(
  path    = "_wiki/systems/redis-tips.md",
  content = <filled frontmatter + TL;DR + Detail>,
  source  = "import:redis-tips.md"
)
```

---

## `wiki_reindex`

Rescan `_wiki/` and rebuild the BM25 index and `_index.md`.

| Parameter | Default | Description |
|-----------|---------|-------------|
| `dry_run` | `false` | Report what would be indexed without writing |

**When to use:** after creating or editing `.md` files directly in Obsidian. The server only indexes at startup and via `wiki_write_page` — files created outside the MCP are invisible to search until reindexed.
