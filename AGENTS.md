# Repository Guidelines

## Project Structure & Module Organization

- `src/` contains all TypeScript source code.
- `src/index.ts` is the MCP server entry point; `src/config.ts` handles config resolution.
- `src/lib/` contains core services (`vault`, `index_manager`, `backlink_index`, `log_manager`).
- `src/tools/` contains MCP tool implementations (`wiki_*.ts`) and tool registration in `src/tools/index.ts`.
- `test/` has the custom integration test runner (`runner.js`) and MCP test client (`mcp-client.js`).
- `dist/` is build output only; do not edit generated files directly.
- `docs/` holds user/developer documentation.

## Build, Test, and Development Commands

- Use `rtk` as the command prefix for shell execution in this repository.
- `rtk npm run dev`: run server from source via `tsx` for local development.
- `rtk npm run build`: compile TypeScript (`src/`) to `dist/`.
- `rtk npm run start`: run the built server from `dist/index.js`.
- `rtk npm test`: run integration tests against a spawned MCP server.
- `rtk npm run lint`: run ESLint on `src/`.
- `rtk npm run format`: run Prettier formatting on `src/`.

## Coding Style & Naming Conventions

- Language: TypeScript (`strict` mode, ES2022/NodeNext).
- Formatting: Prettier (`tabWidth: 2`, `printWidth: 100`, semicolons on, double quotes).
- Linting: ESLint with `@typescript-eslint` recommended rules.
- `any` is disallowed; unused args must be prefixed with `_`.
- `console` usage is restricted to `console.error`.
- New tools should follow `src/tools/wiki_<name>.ts` naming.

## Testing Guidelines

- Tests are integration-focused and executed by `node test/runner.js`.
- Add coverage for every behavior change, especially tool I/O shape and side effects.
- Keep test names descriptive by behavior (e.g., “wiki_reindex handles missing frontmatter”).
- Run `rtk npm run build && rtk npm test` before opening a PR.

## Commit & Pull Request Guidelines

- Follow conventional-style commits used in history: `feat: ...`, `fix: ...`, `docs: ...`, `chore: ...`, `refactor: ...`, `release: ...`.
- Keep one logical change per PR, targeting `master` from `feature/<name>`.
- PRs should include: summary, linked issue (`Closes #<id>` when applicable), testing notes, and docs updates for contract changes.
- For tool contract changes, clearly call out schema/output impacts and migration risk.

## Agent-Specific Notes

- Do not manually edit `dist/`; regenerate via `npm run build`.
- Preserve stable MCP tool output shapes unless intentionally versioning a breaking change.
- Follow `/Users/macbook/.codex/RTK.md`: prefix shell commands with `rtk` (for example, `rtk rg --files`).

## Release Checklist

- Start from updated `master` after merge: `rtk git checkout master && rtk git pull origin master`.
- Update `CHANGELOG.md` with version/date and user-visible changes.
- If tool output contracts change, update `README.md` and `docs/tools.md` in the same release PR.
- Run validation: `rtk npm run build && rtk npm test`.
- Bump version with npm (updates `package.json` and `package-lock.json`): `rtk npm version patch|minor|major`.
- Push commit and tag: `rtk git push origin master && rtk git push origin <tag>`.
- Publish GitHub release: `rtk gh release create <tag> --generate-notes`.
