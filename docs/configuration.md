# Configuration

## Adding to Claude Code

### Option 1: CLI (recommended)

```bash
claude mcp add obsidian-wiki -- npx -y obsidian-wiki-mcp --vault "/path/to/your/vault"
```

> **Paths with spaces:** always wrap in double quotes `"`. Do not use backslash escaping (`\ `) — it is parsed incorrectly by `claude mcp add`.

**Correct:**
```bash
claude mcp add obsidian-wiki -- npx -y obsidian-wiki-mcp --vault "/Users/yourname/Library/Mobile Documents/MyVault"
```

**Incorrect:**
```bash
# backslash escaping does not work here
claude mcp add obsidian-wiki -- npx -y obsidian-wiki-mcp --vault /Users/yourname/Library/Mobile\ Documents/MyVault
```

After adding, verify with `/mcp` inside Claude Code.

### Option 2: `~/.claude.json` — per project

```json
{
  "projects": {
    "/path/to/your/project": {
      "mcpServers": {
        "obsidian-wiki": {
          "type": "stdio",
          "command": "npx",
          "args": ["-y", "obsidian-wiki-mcp", "--vault", "/path/to/your/vault"]
        }
      }
    }
  }
}
```

### Option 3: `~/.claude.json` — global (all projects)

```json
{
  "mcpServers": {
    "obsidian-wiki": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "obsidian-wiki-mcp", "--vault", "/path/to/your/vault"]
    }
  }
}
```

---

## Adding to Kiro CLI

### Option 1: CLI (recommended)

```bash
kiro mcp add obsidian-wiki -- npx -y obsidian-wiki-mcp --vault "/path/to/your/vault"
```

After adding, verify inside Kiro that the server appears in the MCP server list.

### Option 2: `.kiro/settings/mcp.json` — per project

```json
{
  "mcpServers": {
    "obsidian-wiki": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "obsidian-wiki-mcp", "--vault", "/path/to/your/vault"]
    }
  }
}
```

### Option 3: Global Kiro config

```json
{
  "mcpServers": {
    "obsidian-wiki": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "obsidian-wiki-mcp", "--vault", "/path/to/your/vault"]
    }
  }
}
```

Place this in your global Kiro MCP settings file (typically `~/.kiro/settings/mcp.json`).

---

## Adding to OpenAI Codex CLI

### Option 1: `--mcp-config` flag (one-off)

```bash
codex --mcp-config '{"obsidian-wiki":{"command":"npx","args":["-y","obsidian-wiki-mcp","--vault","/path/to/your/vault"]}}'
```

### Option 2: `~/.codex/config.json` — global

```json
{
  "mcpServers": {
    "obsidian-wiki": {
      "command": "npx",
      "args": ["-y", "obsidian-wiki-mcp", "--vault", "/path/to/your/vault"]
    }
  }
}
```

---

## Server config file

`~/.obsidian-wiki-mcp.json` — optional, read at startup.

```json
{
  "vault_path": "~/Documents/MyVault",
  "log_level": "info",
  "lock_timeout_ms": 5000,
  "bm25_top_k": 5,
  "stale_lock_ttl_ms": 30000
}
```

| Key                 | Default      | Description |
|---------------------|--------------|-------------|
| `vault_path`        | _(required)_ | Path to vault. Overridden by `--vault` CLI flag or `WIKI_VAULT_PATH` env var |
| `log_level`         | `"info"`     | `"info"` or `"debug"` |
| `lock_timeout_ms`   | `5000`       | Timeout waiting for file lock (ms) |
| `bm25_top_k`        | `5`          | Max results returned by `wiki_query` |
| `stale_lock_ttl_ms` | `30000`      | Age at which a `.lock` file is considered stale and cleaned up (ms) |

---

## Vault path resolution order

The server resolves the vault path in this priority order:

```
1. --vault CLI flag
2. WIKI_VAULT_PATH environment variable
3. vault_path in ~/.obsidian-wiki-mcp.json
```
