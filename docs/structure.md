# Vault Structure

## Layout

```
your-vault/
├── _wiki/
│   ├── systems/          ← tools, platforms, infrastructure, architecture
│   │   └── databases/    ← sub-folders created as needed
│   ├── guides/           ← how-to, runbooks, procedures, troubleshooting
│   ├── topics/           ← concepts, theory, background knowledge, patterns
│   └── work/             ← projects, initiatives, features, ongoing work
├── _sources/             ← raw immutable inputs (do not edit manually)
├── _schema.md            ← vault constitution — read before doing anything
├── _log.md               ← append-only log — DO NOT edit manually
└── _index.md             ← BM25 catalog — DO NOT edit manually
```

The four default folders are a starting point. Replace them entirely with `wiki_init(folders=[...])` or grow them with sub-folders at any depth. See [Getting Started](getting-started.md) for customization options.

### Naming convention

- Use **kebab-case**: `redis-oom.md`, `cluster-setup.md`
- Incident / event pages: `guides/incident-YYYY-MM-DD-<slug>.md`

---

## Page Format

Every page inside `_wiki/` **must** follow this structure:

```markdown
---
tldr: "One sentence, ≤ 100 tokens, plain text"
tags: [tag1, tag2]
related: ["[[_wiki/systems/redis-setup.md]]"]
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

### Frontmatter fields

| Field           | Required | Description |
|-----------------|----------|-------------|
| `tldr`          | Yes      | One-sentence summary, plain text, ≤ 100 tokens |
| `tags`          | Yes      | Free-form list — see below |
| `related`       | Yes      | Wikilink array to related pages (can be empty `[]`) |
| `last_modified` | Yes      | ISO date `YYYY-MM-DD` — set automatically by `wiki_write_page` |
| `last_linted`   | No       | Set by `wiki_lint_scan` |
| `dirty`         | Yes      | `true` if content needs review; `false` when settled |
| `source`        | Yes      | Origin label: `claude-session-X`, `import:file.md`, `manual` |

### Tags

Tags are free-form — use whatever fits your domain. Common patterns:

| What to tag | Examples |
|-------------|---------|
| Technology  | `redis`, `k8s`, `postgres`, `react` |
| Activity    | `incident`, `runbook`, `deploy`, `research` |
| Status      | `prod`, `staging`, `deprecated` |
| Scope       | `team-infra`, `project-alpha`, `q1-2025` |

### Two-layer content model

Every page has two layers:

```
## TL;DR      ← shallow read: fast, token-efficient, used by wiki_query
## Detail     ← deep read: full content, read with wiki_read_page(depth='full')
```

`wiki_query` returns TL;DRs so the LLM can synthesize an answer without loading full pages. Use `wiki_read_page(depth='full')` only when the detail layer is needed.

---

## Auto-managed files

`_log.md`, `_index.md`, and `_schema.md` are managed by the MCP server:

| File          | Managed by | Purpose |
|---------------|-----------|---------|
| `_index.md`   | `wiki_write_page`, `wiki_reindex` | BM25 search catalog — Markdown table of all pages |
| `_log.md`     | all write tools | Append-only change log |
| `_schema.md`  | `wiki_init` | Vault constitution — read by the LLM each session |

Do not edit these files manually. If `_index.md` gets out of sync, run `wiki_reindex()`.
