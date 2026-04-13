# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Coding principles

**Think before coding.** When a request is ambiguous, surface the interpretations with tradeoffs and ask — don't pick silently. This matters most when modifying tool behavior, since changing a tool's response shape can silently break the host LLM's workflow.

**Simplicity first.** Minimum code that solves the problem. No speculative abstractions, no configurability that wasn't asked for. The BM25 implementation in `index_manager.ts` is intentionally self-contained (no external NLP library) — preserve that constraint unless there's a concrete reason to change it.

**Surgical changes.** Touch only what the task requires. `_log.md` and `_index.md` are auto-managed side effects of writes — don't clean them up or reformat them incidentally.

**Verify with tests.** For any change to a tool, run `npm run test` and confirm the relevant suite passes. Tests spin up a real MCP server process; a passing suite means the full request→response contract is intact.

## Commands

```bash
npm run build      # TypeScript compile → dist/
npm run dev        # Run directly with tsx (no build needed)
npm run test       # Integration test suite against a real MCP server process
```

Tests spin up a live `McpTestClient` subprocess per suite using a fresh temp vault — there is no mocking layer. The test runner is `test/runner.js` (plain Node, no framework).

## Architecture

This is an MCP (Model Context Protocol) server that exposes wiki tools over **stdio**. The server is a pure storage/retrieval layer — it never calls an AI model; all content decisions are delegated to the host LLM.

### Startup sequence (`src/index.ts`)

1. `resolveConfig()` — reads vault path from CLI `--vault`, `WIKI_VAULT_PATH` env, or `~/.obsidian-wiki-mcp.json`
2. Builds two in-memory indexes from `_index.md` and `_wiki/**/*.md`:
   - **BM25 index** (`src/lib/index_manager.ts`) — keyword scoring for `wiki_query` and `wiki_ingest`
   - **Backlink index** (`src/lib/backlink_index.ts`) — `[[wikilink]]` forward/back maps for lint and integrity
3. Registers all tools via `registerTools(server, ctx)` (`src/tools/index.ts`)
4. Connects an MCP `StdioServerTransport`

### Tool context (`ToolContext`)

Every tool receives `{ config, bm25Index, backlinkIndex }`. The BM25 and backlink indexes are updated **in-memory** as pages are written — they don't require a restart when `wiki_write_page` is called.

### Vault layout (enforced by the tools)

```
_wiki/          ← all pages; only path writable by wiki_write_page
_sources/       ← raw immutable inputs
_schema.md      ← vault "constitution"; presence signals initialization
_log.md         ← append-only log; auto-managed
_index.md       ← BM25 Markdown table; auto-managed
```

`isVaultInitialized()` checks for `_schema.md`. `wiki_ingest` and `wiki_write_page` return `VAULT_NOT_INIT` if it's missing.

### Key libs

| File                        | Responsibility                                                                                 |
| --------------------------- | ---------------------------------------------------------------------------------------------- |
| `src/lib/vault.ts`          | Path traversal validation, lockfile-based safe writes, `listWikiPages()`                       |
| `src/lib/index_manager.ts`  | Parse/serialize `_index.md` Markdown table; in-memory BM25 with `addDoc`/`removeDoc`/`rebuild` |
| `src/lib/backlink_index.ts` | Parse `[[wikilinks]]` from page content; maintain forward+back link maps                       |
| `src/lib/log_manager.ts`    | Append entries to `_log.md`                                                                    |

### Tool responsibilities

- `wiki_write_page` — writes file (via `writePageSafe` with `.lock` files), upserts `_index.md`, appends `_log.md`, updates both in-memory indexes
- `wiki_query` — BM25 search; falls back to full-text scan if no BM25 hits
- `wiki_ingest` — accepts raw session content, finds candidates via BM25, returns context for the LLM to decide what to write
- `wiki_lint_scan` — detects ORPHAN / MISSING_TLDR / STALE / BROKEN_LINK; stores issues in module-level state for `wiki_apply_fix`
- `wiki_import` — reads any `.md` file from disk (outside vault allowed), returns draft frontmatter + candidates
- `wiki_reindex` — rescans `_wiki/` and rebuilds both `_index.md` and the in-memory BM25 index; needed after manual edits in Obsidian

### Page format contract

Every `_wiki/` page must have YAML frontmatter with `tldr`, `tags`, `related`, `last_modified`, `dirty`, `source`, and a `## TL;DR` section followed by `## Detail`. Tools parse frontmatter with **gray-matter**.
