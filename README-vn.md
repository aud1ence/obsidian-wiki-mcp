# obsidian-wiki-mcp

MCP server triển khai [LLM Wiki pattern của Karpathy](https://x.com/karpathy/status/1863099529009164779) cho Obsidian vault.

Giải quyết vấn đề **document drift** — vault của bạn luôn được cập nhật khi kiến thức phát triển qua các phiên làm việc với AI.

> **Nguyên tắc thiết kế:** Server chỉ là lớp lưu trữ/truy xuất. Mọi quyết định nội dung (viết gì, tổng hợp ra sao) đều do LLM (Claude) thực hiện. Server không gọi AI model.

---

## Mục lục

- [Cài đặt](#cài-đặt)
- [Thêm vào Claude Code](#thêm-vào-claude-code)
- [Cấu hình](#cấu-hình)
- [Khởi tạo vault lần đầu](#khởi-tạo-vault-lần-đầu)
- [Cấu trúc vault](#cấu-trúc-vault)
- [Định dạng page](#định-dạng-page)
- [Danh sách tools](#danh-sách-tools)
- [Workflow sử dụng](#workflow-sử-dụng)
- [Troubleshooting](#troubleshooting)

---

## Cài đặt

### Cách 1: Dùng npx (khuyến nghị, không cần cài đặt)

```bash
claude mcp add obsidian-wiki -- npx -y obsidian-wiki-mcp --vault "/path/to/your/vault"
```

---

## Thêm vào Claude Code

> **Lưu ý quan trọng:** Nếu đường dẫn vault có **khoảng trắng**, hãy bọc trong dấu ngoặc kép `"`. Không dùng backslash escape (`\ `) vì sẽ bị parse sai.

### Đúng

```bash
claude mcp add obsidian-wiki -- npx -y obsidian-wiki-mcp --vault "/Users/yourname/Library/Mobile Documents/iCloud~md~obsidian/Documents/MyVault"
```

### Sai (path bị cắt tại khoảng trắng)

```bash
# ĐỪNG làm thế này — \  không hoạt động trong claude mcp add
claude mcp add obsidian-wiki -- npx -y obsidian-wiki-mcp --vault /Users/yourname/Library/Mobile\ Documents/...
```

Sau khi thêm, kiểm tra server kết nối thành công bằng lệnh `/mcp` trong Claude Code.

---

## Cấu hình

### Config file (`~/.obsidian-wiki-mcp.json`)

```json
{
  "vault_path": "~/Documents/MyVault",
  "log_level": "info",
  "lock_timeout_ms": 5000,
  "bm25_top_k": 5,
  "stale_lock_ttl_ms": 30000
}
```

| Tham số             | Mặc định     | Mô tả                                    |
| ------------------- | ------------ | ---------------------------------------- |
| `vault_path`        | _(bắt buộc)_ | Đường dẫn tới Obsidian vault             |
| `log_level`         | `"info"`     | Log level: `"info"` hoặc `"debug"`       |
| `lock_timeout_ms`   | `5000`       | Timeout khi chờ file lock (ms)           |
| `bm25_top_k`        | `5`          | Số kết quả tối đa trả về khi search      |
| `stale_lock_ttl_ms` | `30000`      | Thời gian để coi lock file là stale (ms) |

---

## Khởi tạo vault lần đầu

Sau khi MCP server kết nối thành công, yêu cầu Claude chạy:

```
Gọi wiki_init() để khởi tạo vault.
```

Lệnh này tạo ra:

- Các thư mục `_wiki/infra/`, `_wiki/ops/`, `_wiki/concepts/`, `_wiki/projects/`, `_sources/`
- File `_schema.md` — quy tắc hoạt động của vault
- File `_log.md` — log thay đổi tự động
- File `_index.md` — catalog dùng cho BM25 search

> Nếu vault đã được init trước đó, lệnh này sẽ báo `already_initialized` và không ghi đè gì cả.

---

## Cấu trúc vault

```
your-vault/
├── _wiki/
│   ├── infra/        ← servers, network, deployment
│   ├── ops/          ← incidents, runbooks, troubleshooting
│   ├── concepts/     ← khái niệm kỹ thuật, architecture
│   └── projects/     ← kiến thức theo từng project
├── _sources/         ← raw input, không edit thủ công
├── _schema.md        ← quy tắc vault — đọc trước khi làm gì
├── _log.md           ← append-only log — KHÔNG edit thủ công
└── _index.md         ← BM25 catalog — KHÔNG edit thủ công
```

### Quy tắc đặt tên file

- Dùng **kebab-case**: `redis-oom.md`, `server-35-setup.md`
- Incident pages: `ops/incident-YYYY-MM-DD-<slug>.md`

---

## Định dạng page

Mỗi page trong `_wiki/` **bắt buộc** có cấu trúc sau:

```markdown
---
tldr: "Mô tả ngắn gọn trong 1 câu, tối đa 100 tokens, plain text"
tags: [infra, redis, server-35]
related:
  ["[[_wiki/infra/redis-setup.md]]", "[[_wiki/ops/incident-2024-01-01.md]]"]
last_modified: "2024-01-15"
last_linted: "2024-01-15"
dirty: false
source: "claude-session-1"
---

## TL;DR

Tóm tắt ngắn, 2-4 câu. Đây là tầng thông tin nhanh.

---

## Detail

Nội dung đầy đủ: nguyên nhân, các bước xử lý, ví dụ, tài liệu tham khảo.
```

### Tag taxonomy gợi ý

| Nhóm     | Tags                                                               |
| -------- | ------------------------------------------------------------------ |
| Infra    | `infra`, `k8s`, `freeswitch`, `redis`, `mongodb`, `minio`, `mysql` |
| Ops      | `incident`, `runbook`, `troubleshoot`, `backup`, `deploy`          |
| Projects | `project-alpha`, `website-v2`, `mobile-app`                        |
| Scope    | `server-35`, `server-pbx1`, `prod`, `staging`                      |

---

## Danh sách tools

### `wiki_init`

Khởi tạo vault: tạo cấu trúc thư mục và các file hệ thống.

```
Gọi wiki_init()
```

Chạy **một lần duy nhất** khi mới setup. An toàn để gọi lại — không ghi đè file đã có.

---

### `wiki_ingest(content, source, tags?)`

Nhận raw content từ session, tìm pages liên quan, trả context để LLM quyết định action tiếp theo.

| Tham số   | Bắt buộc | Mô tả                                            |
| --------- | -------- | ------------------------------------------------ |
| `content` | Có       | Nội dung cần ingest (log, note, conversation...) |
| `source`  | Có       | Nguồn gốc: `claude-session-1`, `manual`, v.v.    |
| `tags`    | Không    | Tags gợi ý để cải thiện search                   |

**Ví dụ sử dụng:**

```
Ingest nội dung sau vào wiki:
"Redis trên server-35 bị OOM lúc 2:00 AM. Root cause là maxmemory chưa được set.
Fix: thêm maxmemory 4gb và maxmemory-policy allkeys-lru vào redis.conf."

Source: claude-session-1, tags: [redis, ops, server-35]
```

Tool sẽ trả về danh sách candidate pages liên quan và bước tiếp theo cần làm.

---

### `wiki_query(question)`

Tìm kiếm BM25 trong vault, trả raw TL;DRs. LLM tự tổng hợp câu trả lời.

```
Dùng wiki_query để tìm thông tin về "redis OOM server-35"
```

- Tự động fallback sang full-text scan nếu BM25 không có kết quả
- Trả về top 3 kết quả kèm TL;DR section

---

### `wiki_read_page(path, depth)`

Đọc nội dung một page.

| `depth`     | Trả về                              |
| ----------- | ----------------------------------- |
| `"shallow"` | Chỉ TL;DR (nhanh, tiết kiệm tokens) |
| `"full"`    | Toàn bộ nội dung page               |

```
Đọc full page _wiki/infra/redis-setup.md
```

---

### `wiki_write_page(path, content, source)`

Ghi page vào vault. LLM gọi sau khi đã quyết định nội dung.

| Tham số   | Mô tả                                     |
| --------- | ----------------------------------------- |
| `path`    | Relative path: `_wiki/infra/redis-oom.md` |
| `content` | Markdown với YAML frontmatter đầy đủ      |
| `source`  | Nguồn gốc: `claude-session-1`             |

Tự động:

- Thêm `last_modified` nếu chưa có
- Cập nhật BM25 index và `_index.md`
- Ghi log vào `_log.md`
- Dùng file locking để tránh conflict

---

### `wiki_lint_scan()`

Quét vault phát hiện vấn đề cấu trúc.

```
Chạy wiki_lint_scan() để kiểm tra sức khỏe vault
```

Phát hiện 4 loại vấn đề:

| Loại           | Mô tả                                      |
| -------------- | ------------------------------------------ |
| `ORPHAN`       | Page không có backlink sau 7 ngày          |
| `MISSING_TLDR` | Page thiếu section `## TL;DR`              |
| `STALE`        | `last_modified` > 90 ngày và `dirty: true` |
| `BROKEN_LINK`  | `[[link]]` trỏ đến page không tồn tại      |

---

### `wiki_apply_fix(issue_id)`

Áp dụng fix cho issue đã phát hiện từ `wiki_lint_scan`.

```
Dùng wiki_apply_fix để fix issue ORPHAN tại _wiki/infra/old-server.md
```

---

### `wiki_reindex(dry_run?)`

Rescan toàn bộ files trong `_wiki/` và rebuild BM25 index + `_index.md`.

**Khi nào dùng:** sau khi tạo hoặc sửa file `.md` trực tiếp trong Obsidian (không qua MCP). Server chỉ index file lúc khởi động và khi `wiki_write_page` được gọi — file tạo thủ công sẽ không xuất hiện trong search cho đến khi reindex.

| Tham số   | Mặc định | Mô tả                                              |
| --------- | -------- | -------------------------------------------------- |
| `dry_run` | `false`  | Nếu `true`, báo cáo sẽ index gì mà không ghi gì cả |

```
Chạy wiki_reindex() để cập nhật index sau khi tôi tạo page mới trong Obsidian
```

```
Chạy wiki_reindex(dry_run=true) để xem trước sẽ index những file nào
```

---

## Workflow sử dụng

### Lần đầu setup

```
1. wiki_init()                    ← tạo cấu trúc vault
```

### Sau mỗi phiên làm việc (lưu kiến thức mới)

```
2. wiki_ingest(content, source)   ← tìm pages liên quan
3. wiki_read_page(path, 'full')   ← đọc page sẽ cập nhật (nếu cần)
4. wiki_write_page(path, content) ← ghi nội dung đã tổng hợp
```

### Khi cần tra cứu

```
5. wiki_query("câu hỏi")          ← search → tổng hợp câu trả lời
6. wiki_read_page(path, 'full')   ← đọc chi tiết nếu cần
```

### Sau khi tạo file thủ công trong Obsidian

```
wiki_reindex()                    ← rebuild index để file mới xuất hiện trong search
```

### Bảo trì định kỳ

```
wiki_lint_scan()                  ← kiểm tra vault health
wiki_apply_fix(issue_id)          ← fix các vấn đề tìm được
```

---

## Troubleshooting

### MCP server không kết nối được (`Failed to reconnect`)

**Nguyên nhân phổ biến nhất:** đường dẫn vault có khoảng trắng bị parse sai trong `~/.claude.json`.

Kiểm tra config:

```bash
cat ~/.claude.json | python3 -c "
import json, sys
d = json.load(sys.stdin)
for k, v in d.get('projects', {}).items():
    if 'mcpServers' in v and 'obsidian-wiki' in v['mcpServers']:
        print(k)
        print(json.dumps(v['mcpServers']['obsidian-wiki'], indent=2))
"
```

Nếu thấy `--vault` arg bị tách thành 2 phần tử trong mảng `args`:

```json
// SAI
"args": ["dist/index.js", "--vault", "/Users/name/Library/Mobile", "Documents/..."]

// ĐÚNG
"args": ["dist/index.js", "--vault", "/Users/name/Library/Mobile Documents/..."]
```

Sửa bằng cách edit trực tiếp `~/.claude.json` hoặc xóa và thêm lại với path được bọc ngoặc kép.

---

### Vault chưa được khởi tạo

```
[obsidian-wiki-mcp] WARN: Vault chưa được khởi tạo (không có _schema.md)
```

Server vẫn khởi động bình thường nhưng các tool như `wiki_ingest` và `wiki_write_page` sẽ trả lỗi `VAULT_NOT_INIT`. Chạy `wiki_init()` để khắc phục.

## License

MIT
