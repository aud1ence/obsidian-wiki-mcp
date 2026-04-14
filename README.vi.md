# obsidian-wiki-mcp

MCP server triển khai [LLM Wiki pattern của Karpathy](https://x.com/karpathy/status/1863099529009164779) cho Obsidian vault.

Giải quyết vấn đề **document drift** — vault luôn được cập nhật khi kiến thức phát triển qua các phiên làm việc với AI.

```
linh hoạt, không áp đặt  — dùng cấu trúc thư mục của bạn
lưu trữ, không xử lý     — server lưu; LLM quyết định nội dung
luôn tìm được            — BM25 index rebuild sau mỗi lần ghi
```

> **Nguyên tắc thiết kế:** Server chỉ là lớp lưu trữ/truy xuất. Mọi quyết định nội dung (viết gì, tổng hợp ra sao) đều do LLM (Claude) thực hiện. Server không gọi AI model.

---

## Bắt đầu nhanh

**1. Thêm vào Claude Code:**

```bash
claude mcp add obsidian-wiki -- npx -y obsidian-wiki-mcp --vault "/path/to/your/vault"
```

> Đường dẫn có khoảng trắng phải được bọc trong ngoặc kép. Xem [Cấu hình](docs/configuration.md) để biết tất cả tùy chọn cài đặt.

**2. Khởi tạo vault:**

```
Gọi wiki_init() để khởi tạo vault.
```

**3. Bắt đầu sử dụng:**

```
Ingest nội dung phiên này vào wiki: [dán nội dung]
Dùng wiki_query để tìm thông tin về [chủ đề]
```

---

## Tài liệu

Tài liệu chi tiết được viết bằng tiếng Anh tại thư mục [`docs/`](docs/):

| Tài liệu | Nội dung |
|----------|---------|
| [Getting Started](docs/getting-started.md) | Setup lần đầu, vault có sẵn, CLAUDE.md |
| [Vault Structure](docs/structure.md) | Cấu trúc thư mục, định dạng page, tags, đặt tên |
| [Tools Reference](docs/tools.md) | Tất cả MCP tools với tham số và ví dụ |
| [Workflows](docs/workflows.md) | Các pattern sử dụng phổ biến |
| [Configuration](docs/configuration.md) | Cài đặt Claude Code, file cấu hình server |
| [Troubleshooting](docs/troubleshooting.md) | Các lỗi thường gặp và cách khắc phục |

---

## License

MIT
