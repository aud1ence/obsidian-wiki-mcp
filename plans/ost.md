# Opportunity Solution Tree — obsidian-wiki-mcp

## Desired Outcome

> An LLM can autonomously maintain a structured knowledge base in Obsidian — capturing, retrieving, and keeping pages fresh — without manual human intervention.

---

## Current State (v0.1.2)

**Implemented:**

- 9 MCP tools over stdio: `wiki_init`, `wiki_ingest`, `wiki_write_page`, `wiki_query`, `wiki_read_page`, `wiki_lint_scan`, `wiki_apply_fix`, `wiki_import`, `wiki_reindex`
- Custom in-memory BM25 index (no external NLP dependency)
- Backlink index tracking `[[wikilink]]` forward/back maps
- Lockfile-based safe concurrent writes
- Integration test suite running against a real MCP server process
- Documentation site (6 guides under `docs/`)
- OSS hygiene: CI/CD, ESLint, Prettier, issue templates, CONTRIBUTING

**Known gaps:**

- Search is keyword-only (BM25) — no semantic understanding
- `wiki_lint_scan` stores issues in a module-level array → state lost on server restart
- No page history or versioning
- No auto-capture — `wiki_ingest` must be called manually after each session

---

## Opportunity Tree

### ✅ Core write / read / search / lint loop

All 9 tools implemented and tested. Foundation is stable.

---

### Opportunity 1 — Lint state is fragile

**Status: open → [#15](https://github.com/aud1ence/obsidian-wiki-mcp/issues/15)**

`wiki_lint_scan` stores detected issues in a module-level array exported to `wiki_apply_fix`. If the server restarts between the two calls, or if `wiki_lint_scan` is called a second time, all prior issue IDs are invalidated and `wiki_apply_fix` returns `ISSUE_NOT_FOUND`.

| Solution                                                                       | Effort | Notes                                         |
| ------------------------------------------------------------------------------ | ------ | --------------------------------------------- |
| **A — Stateless params** `wiki_apply_fix({ page, type })` instead of opaque ID | Low    | Idempotent, no persistence needed. Preferred. |
| B — Persist issues to `_lint.json` after each scan                             | Medium | Survives restart but adds file management     |

**Recommendation:** Solution A. `wiki_apply_fix` re-checks the page before fixing — no stored state required.

---

### Opportunity 2 — No auto-capture after sessions

**Status: open → [#16](https://github.com/aud1ence/obsidian-wiki-mcp/issues/16)**

The biggest UX gap: knowledge from AI sessions is lost unless the user manually calls `wiki_ingest`. This undermines the core promise of automatic drift prevention.

| Solution                                   | Effort | Token overhead                   | Notes                             |
| ------------------------------------------ | ------ | -------------------------------- | --------------------------------- |
| A — `PostToolUse` hook on every Write/Edit | Low    | ~30,000 tokens/session (N fires) | Interrupts mid-session, expensive |
| **B — `Stop` hook once per session turn**  | Low    | ~800 tokens/session (1 fire)     | Preferred                         |

**Mechanism (Solution B):**
A `Stop` hook fires once when Claude finishes a turn. A script extracts valuable content from the session transcript (decisions, incidents, configs — skipping raw tool output), then calls `wiki_ingest` once. BM25 finds candidate pages; Claude decides what to write. ~97% token reduction vs. per-edit triggering.

```json
// .claude/settings.json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [{ "type": "command", "command": "wiki-end-session.sh" }]
      }
    ]
  }
}
```

No server changes needed — existing `wiki_ingest` handles the rest.

---

### Opportunity 3 — DATE_CONFLICT lint type missing

**Status: deferred (v2)**

Two pages describing the same incident but written on different dates cannot be detected by structural rules alone — semantic matching is required. Deferred until vault reaches ~200 pages and duplicates become observable.

| Solution                                        | Effort | Notes                                     |
| ----------------------------------------------- | ------ | ----------------------------------------- |
| Fuzzy title matching + date proximity heuristic | Medium | No LLM needed; catches obvious duplicates |
| Embedding-based similarity                      | High   | Accurate but requires model dependency    |

**Signal to watch:** User-reported duplicates or stale incident pages that overlap.

---

### Opportunity 4 — Semantic search

**Status: deferred (v2)**

BM25 misses synonyms and concept-level queries. No concrete user complaints yet — defer until signal is clear.

| Solution                                    | Effort | Notes                              |
| ------------------------------------------- | ------ | ---------------------------------- |
| Hybrid BM25 + local embeddings (sqlite-vec) | High   | Requires embedding model selection |
| Query expansion via tag/synonym mapping     | Medium | Approximation; lower quality       |

**Signal to watch:** User reports BM25 returning irrelevant or empty results for natural-language queries.

---

### Opportunity 5 — BacklinkIndex cold start cost

**Status: deferred (v2)**

Current behavior: full rebuild on every startup. Acceptable up to ~500 pages (~1.5s). Beyond that, startup becomes noticeable.

| Solution                                              | Effort | Notes                                  |
| ----------------------------------------------------- | ------ | -------------------------------------- |
| Cache to `_wiki/.backlinks.json`, invalidate on write | Low    | Straightforward; already noted in plan |

**Signal to watch:** Startup time exceeds 2 seconds.

---

### ✅ Opportunity 6 — kiro-cli adapter

**Status: resolved (v0.1.2)**

The original plan anticipated a separate code adapter. In practice, kiro-cli speaks standard MCP over stdio — no adapter code was needed. The "adapter" reduced to documentation only, which has been shipped:

- `README.md` — `kiro mcp add` install command
- `docs/configuration.md` — 3 config options: CLI, per-project `.kiro/settings/mcp.json`, global config
- `wiki_ingest` and `wiki_write_page` — `source` field schema already accepts `kiro-session-X`

No further work required.

---

## Priority Summary

| Opportunity             | In original plan? | Effort | Signal present?  | Action          |
| ----------------------- | ----------------- | ------ | ---------------- | --------------- |
| Lint stateless (#15)    | No                | Low    | Yes (active bug) | **Do now**      |
| Session Stop hook (#16) | Yes (v2)          | Low    | Yes (UX pain)    | **Do next**     |
| DATE_CONFLICT lint      | Yes (v2)          | Medium | Not yet          | Wait for data   |
| BacklinkIndex cache     | Yes (v2)          | Low    | Not yet          | Wait for data   |
| Semantic search         | Yes (v2)          | High   | Not yet          | Wait for signal |
| ✅ kiro-cli adapter     | Yes (v2)          | None   | Resolved via docs | Done (v0.1.2)  |
