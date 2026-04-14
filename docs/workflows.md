# Workflows

Common usage patterns. For tool details see [Tools Reference](tools.md).

---

## Setup

### Fresh vault

```
wiki_init()
```

Creates default folders (`systems/`, `guides/`, `topics/`, `work/`) and system files.

### Custom folder structure

```
wiki_init(folders=[
  {name: "research",  description: "papers, experiments, findings"},
  {name: "methods",   description: "procedures and protocols"},
  {name: "projects",  description: "active research projects"}
])
```

### Existing vault (your own folders already in place)

```
wiki_init(scan_existing=true)
  → detects existing folders, reports migration_candidates

wiki_import("/path/to/existing-file.md")   ← migrate files one by one
```

---

## Saving knowledge after a session

```
wiki_ingest(content, source, tags?)
  → returns candidate pages + schema_excerpt

wiki_read_page(candidate, 'full')          ← read page to update (if any)

wiki_write_page(path, content, source)
  → writes page, rebuilds index, appends log
```

The LLM decides whether to update an existing page or create a new one — the server never makes that choice.

---

## Looking something up

```
wiki_query("your question")
  → returns TL;DRs of top matching pages

wiki_read_page(path, 'full')               ← only if full detail is needed
```

Prefer `wiki_query` first. It loads only TL;DRs and is token-efficient. Escalate to `wiki_read_page(depth='full')` only when the detail layer is actually needed.

---

## Importing an existing file

```
wiki_import("/path/to/file.md")
  → raw_content + draft_frontmatter + candidates + available_folders

wiki_read_page(candidate, 'full')          ← if merging with existing page

wiki_write_page(
  path    = "_wiki/topics/my-notes.md",
  content = <filled draft + TL;DR + Detail>,
  source  = "import:my-notes.md"
)
```

---

## After editing files directly in Obsidian

```
wiki_reindex()
```

The server only indexes at startup and via `wiki_write_page`. Files created or edited outside the MCP are invisible to search until this is run.

---

## Periodic maintenance

```
wiki_lint_scan()
  → returns issues: ORPHAN, MISSING_TLDR, STALE, BROKEN_LINK

wiki_apply_fix(issue_id)                   ← fix one issue at a time
wiki_apply_fix(issue_id, resolution="remove")   ← for BROKEN_LINK
```

---

## Updating vault schema

When your organizational needs change:

```
wiki_init(force_reinit=true, folders=[...])
  → overwrites _schema.md only, pages untouched

wiki_reindex()
  → rebuild index after any manual changes
```
