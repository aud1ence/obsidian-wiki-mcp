# Contributing to obsidian-wiki-mcp

## Setup

```bash
git clone https://github.com/aud1ence/obsidian-wiki-mcp
cd obsidian-wiki-mcp
npm install
npm run build
npm test
```

## Development workflow

```bash
npm run dev    # run with tsx (no build needed, uses --vault flag)
npm run lint   # ESLint check
npm run build  # TypeScript compile → dist/
npm test       # integration test suite (spawns real MCP server)
```

## Project structure

```
src/
  index.ts          ← entry point, startup sequence
  config.ts         ← config resolution (CLI > env > file)
  lib/
    vault.ts        ← file I/O, locking, path validation
    index_manager.ts ← BM25 index + _index.md serialization
    backlink_index.ts ← [[wikilink]] forward/back maps
    log_manager.ts  ← _log.md append operations
  tools/
    index.ts        ← registerTools() + ToolContext
    wiki_*.ts       ← one file per MCP tool
test/
  runner.js         ← custom test runner (no framework)
  mcp-client.js     ← MCP client that spawns server subprocess
```

## Adding a new tool

1. Create `src/tools/wiki_<name>.ts` exporting a `register<Name>` function
2. Add `register<Name>(server, ctx)` to `src/tools/index.ts`
3. Add at least one test suite in `test/runner.js`
4. Document the tool's input schema, output shape, and side effects in the PR description

## Tool contract rules

- **Never change** an existing tool's output shape without a major version bump — host LLMs depend on stable contracts
- **Always** update `_index.md`, `_log.md`, and both in-memory indexes (`bm25Index`, `backlinkIndex`) when writing pages
- **Always** validate paths with `validateVaultPath()` before reading or writing
- **Return errors** as `{ status: "error", code: "SNAKE_CASE_CODE", message: "..." }` — never throw to the MCP transport layer

## Running a single suite

The test runner runs all suites sequentially. To isolate one suite, comment out the others in `test/runner.js`'s `main()` function.

## Commit style

```
type: short description

feat: add wiki_delete_page tool
fix: handle missing frontmatter in wiki_reindex
docs: update CONTRIBUTING with tool contract rules
chore: add CI workflow
```

## Before opening a PR

- [ ] `npm run lint` passes
- [ ] `npm run build` passes  
- [ ] `npm test` passes (all 9 suites)
- [ ] New behaviour has test coverage
- [ ] Tool contract changes are documented
