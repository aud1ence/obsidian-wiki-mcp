# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.4] - 2026-04-29

### Changed
- Documentation synchronized with tool contract updates from `v0.1.3`.
- `README.md` now notes unified diff support in write responses.
- `docs/tools.md` now documents `diff` response behavior for `wiki_write_page` and `wiki_apply_fix`.

## [0.1.3] - 2026-04-29

### Added
- `wiki_write_page` now returns a `diff` field (unified diff) when updating an existing page, giving hosts direct visibility into before/after changes.
- `wiki_apply_fix` now returns a `diff` field for write paths in `STALE` and `BROKEN_LINK` (`remove`) resolutions.
- New `unified_diff` helper added to generate compact before/after hunk output for tool responses.

## [0.1.2] - 2026-04-14

### Added
- **Configurable vault folder structure**: `wiki_init` now uses a `DEFAULT_FOLDERS` array (`systems`, `guides`, `topics`, `work`) instead of hardcoded categories, making the folder layout easy to extend.
- **Smart import path suggestion**: `wiki_import` reads actual `_wiki/` subdirectories and maps the source file's parent folder to the closest matching wiki folder; falls back to `topics`.
- **Documentation site**: `docs/` directory added with 6 guides — getting-started, structure, tools, workflows, configuration, and troubleshooting.
- **MIT LICENSE file**: `LICENSE` added to satisfy OSS requirements; GitHub now auto-detects the license.
- **OSS hygiene scaffolding**: CI/CD workflows (test on push/PR, publish on tag), ESLint + Prettier configuration, `.npmignore`, GitHub issue templates, PR template, and `CONTRIBUTING.md`.

## [0.1.1] - 2026-04-14

### Fixed
- **`wiki_ingest` chunk processing**: each chunk now runs BM25 search independently; candidates are aggregated (highest score per path) across all chunks, then sorted and sliced to `bm25TopK`. Previously only the first chunk was searched and remaining chunks were delegated to the host LLM.
- **Startup `_index.md` sync validation**: on startup, `_index.md` is now compared against actual `_wiki/` pages. If mismatched (unindexed pages or orphaned entries), the index is rebuilt automatically before the server accepts connections.
- **`wiki_query` question type detection**: queries are now classified as `procedural`, `factual`, or `exploratory`. Procedural queries (containing keywords like `how`, `setup`, `fix`, `troubleshoot`, etc.) trigger a re-rank step that boosts pages with operational tags (`runbook`, `troubleshoot`, `incident`, `ops`, `deploy`, etc.) before returning results.

### Changed
- `Bm25Index` interface gains a `getRow(path)` method to allow callers to inspect the raw `IndexRow` for a given page path.
- `validateAndRebuildIndex(vaultPath, bm25Index)` added to `index_manager.ts` as a public utility called during server startup.

## [0.1.0] - 2026-04-11

### Added
- Initial release with 9 MCP tools: `wiki_init`, `wiki_ingest`, `wiki_write_page`, `wiki_query`, `wiki_read_page`, `wiki_lint_scan`, `wiki_apply_fix`, `wiki_import`, `wiki_reindex`
- In-memory BM25 index with custom implementation (no external NLP dependency)
- Backlink index for `[[wikilink]]` tracking
- Lockfile-based safe concurrent writes
- Append-only `_log.md` with LAST_LINT anchor
- Integration test suite (9 suites, real MCP server process)
