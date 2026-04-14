# Getting Started

This guide covers vault initialization and first-use setup. For installation, see the [main README](../README.md#installation).

## Fresh Vault

Once the MCP server is connected, ask Claude to initialize:

```
Call wiki_init() to initialize the vault.
```

This creates the default structure:

```
_wiki/
  systems/    ← tools, platforms, infrastructure, architecture
  guides/     ← how-to, runbooks, procedures, troubleshooting
  topics/     ← concepts, theory, background knowledge, patterns
  work/       ← projects, initiatives, features, ongoing work
_sources/
_schema.md    ← vault constitution (generated from your folder config)
_log.md       ← append-only change log
_index.md     ← BM25 search catalog
```

**Custom folder structure:**

```
Call wiki_init(folders=[
  {name: "research",  description: "papers, experiments, findings"},
  {name: "methods",   description: "procedures and protocols"},
  {name: "projects",  description: "active research projects"}
])
```

The `_schema.md` file is generated from whichever folders you choose. The host LLM reads it to understand how to organize content — so the schema accurately reflects your actual layout.

Sub-folders are supported at any depth. Create them freely within any theme folder:

```
_wiki/systems/databases/redis-oom.md
_wiki/guides/deployment/k8s-blue-green.md
_wiki/work/feature-x/architecture.md
```

`wiki_write_page` creates intermediate directories automatically.

---

## Existing Vault

You already have a folder structure. Use `scan_existing` to detect it:

```
Call wiki_init(scan_existing=true)
```

The server scans all top-level directories (excluding `_*` and hidden), builds `_schema.md` from what it finds, and reports how many `.md` files are migration candidates:

```json
{
  "status": "success",
  "detected_structure": [
    { "folder": "notes",    "md_files": 32 },
    { "folder": "meetings", "md_files": 18 }
  ],
  "migration_candidates": 50
}
```

Existing files are **never moved or deleted**. Only `_schema.md`, `_log.md`, and `_index.md` are created. Use `wiki_import` to selectively migrate files into wiki format one by one.

---

## Changing Structure on an Initialized Vault

```
Call wiki_init(force_reinit=true, folders=[...])
```

Overwrites only `_schema.md`. Pages in `_wiki/` are untouched. Run `wiki_reindex()` afterward.

---

## CLAUDE.md

Adding a `CLAUDE.md` to your vault enforces correct tool usage across every Claude Code session — no need to remind Claude each time.

Without it, Claude defaults to generic file tools (`Write`, `Edit`, `Read`) when working in the vault, bypassing automatic indexing and backlink management. This causes `_index.md` to drift and breaks search.

### Recommended content

Create `CLAUDE.md` at the vault root:

```markdown
# CLAUDE.md

## Obsidian Wiki MCP — Required

When working with wiki pages in this vault, always use obsidian-wiki MCP tools.
Do NOT use Write, Edit, or Read directly on files inside `_wiki/`.

### Standard workflow for writing

1. `wiki_query` — search for related pages first (avoid duplicates, find backlinks)
2. `wiki_write_page` — write the page (auto-updates `_index.md` and backlinks)
3. Never manually edit `_index.md` or `_log.md`

### Tool mapping

| Instead of          | Use                |
|---------------------|--------------------|
| `Write` to `_wiki/` | `wiki_write_page`  |
| `Read` a wiki file  | `wiki_read_page`   |
| Searching in wiki   | `wiki_query`       |
| Importing raw file  | `wiki_ingest`      |
```

### What each rule prevents

| Rule | Without it |
|------|------------|
| `wiki_query` before writing | Duplicate pages with overlapping content |
| `wiki_write_page` instead of `Write` | `_index.md` and `_log.md` go out of sync |
| Never edit `_index.md` manually | BM25 index gets corrupted |
