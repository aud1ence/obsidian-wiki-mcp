# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- CI/CD workflows (test on push/PR, publish on tag)
- ESLint + Prettier configuration
- `.npmignore` to exclude source files from published package
- GitHub issue templates (bug report, feature request)
- Pull request template
- `CONTRIBUTING.md` guide

## [0.1.0] - 2026-04-11

### Added
- Initial release with 9 MCP tools: `wiki_init`, `wiki_ingest`, `wiki_write_page`, `wiki_query`, `wiki_read_page`, `wiki_lint_scan`, `wiki_apply_fix`, `wiki_import`, `wiki_reindex`
- In-memory BM25 index with custom implementation (no external NLP dependency)
- Backlink index for `[[wikilink]]` tracking
- Lockfile-based safe concurrent writes
- Append-only `_log.md` with LAST_LINT anchor
- Integration test suite (9 suites, real MCP server process)
