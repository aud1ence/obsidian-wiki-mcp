# Obsidian wiki MCP

MCP server implementing [Karpathy's LLM Wiki pattern](https://x.com/karpathy/status/1863099529009164779) for Obsidian vaults.

Solves **document drift** — your vault stays up-to-date as knowledge evolves across AI sessions.

```
fluid not opinionated   — bring your own folder structure
storage not intelligence — the server stores; the LLM decides
always searchable        — BM25 index rebuilt on every write
```

> **Design principle:** The server is a pure storage/retrieval layer. All content decisions (what to write, how to synthesize) are made by the host LLM (Claude). The server never calls an AI model.

---

## Quick Start

**1. Add to your AI client:**

**Claude Code**
```bash
claude mcp add obsidian-wiki -- npx -y obsidian-wiki-mcp --vault "/path/to/your/vault"
```

**Kiro CLI**
```bash
kiro mcp add obsidian-wiki -- npx -y obsidian-wiki-mcp --vault "/path/to/your/vault"
```

**OpenAI Codex CLI**
```bash
codex --mcp-config '{"obsidian-wiki":{"command":"npx","args":["-y","obsidian-wiki-mcp","--vault","/path/to/your/vault"]}}'
```

> Paths with spaces must be quoted. See [Configuration](docs/configuration.md) for all installation options.

**2. Initialize the vault:**

```
Call wiki_init() to initialize the vault.
```

**3. Start using:**

```
Ingest this session into the wiki: [paste content]
Use wiki_query to find information about [topic]
```

---

## Documentation

| Doc | Description |
|-----|-------------|
| [Getting Started](docs/getting-started.md) | First-time setup, existing vault migration, CLAUDE.md / AGENTS.md |
| [Vault Structure](docs/structure.md) | Folder layout, page format, tags, naming convention |
| [Tools Reference](docs/tools.md) | All MCP tools with parameters and examples |
| [Workflows](docs/workflows.md) | Common usage patterns |
| [Configuration](docs/configuration.md) | Claude Code setup, server config file |
| [Troubleshooting](docs/troubleshooting.md) | Common issues and fixes |

---

## License

MIT
