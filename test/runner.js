/**
 * Test runner đơn giản — không cần Jest/Mocha.
 * Chạy: node test/runner.js
 */
import { McpTestClient } from "./mcp-client.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import os from "os";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Helpers ───────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, message) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function assertEquals(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`);
  }
}

function assertContains(obj, key, message) {
  if (!(key in obj)) {
    throw new Error(`${message}\n  key "${key}" not found in: ${JSON.stringify(obj)}`);
  }
}

async function test(name, fn) {
  process.stdout.write(`  ${name} ... `);
  try {
    await fn();
    console.log("\x1b[32m✓\x1b[0m");
    passed++;
  } catch (err) {
    console.log("\x1b[31m✗\x1b[0m");
    console.log(`    \x1b[31m${err.message}\x1b[0m`);
    failed++;
    failures.push({ name, error: err.message });
  }
}

function suite(name) {
  console.log(`\n\x1b[1m${name}\x1b[0m`);
}

// ─── Vault setup helper ────────────────────────────────────────────────────

function freshVaultPath() {
  return path.join(os.tmpdir(), `wiki-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
}

function cleanVault(vaultPath) {
  if (!fs.existsSync(vaultPath)) return;
  // Xóa từng file/dir thủ công
  const removeDir = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) removeDir(full);
      else fs.unlinkSync(full);
    }
    fs.rmdirSync(dir);
  };
  removeDir(vaultPath);
}

// Page content helpers
function makePage(tldr, tags = [], dirty = false, lastModifiedDaysAgo = 0, hasTldrSection = true, brokenLinks = []) {
  const date = new Date(Date.now() - lastModifiedDaysAgo * 86400_000);
  const dateStr = date.toISOString().slice(0, 10);
  const brokenLinksText = brokenLinks.map(l => `See also [[${l}]]`).join("\n");

  return `---
tldr: "${tldr}"
tags: [${tags.join(", ")}]
related: []
last_modified: "${dateStr}"
dirty: ${dirty}
source: "test"
---

${hasTldrSection ? `## TL;DR\n\n${tldr}\n\n---\n\n## Detail\n\nNội dung chi tiết.\n${brokenLinksText}` : `## Detail\n\nNội dung không có TL;DR.\n${brokenLinksText}`}
`;
}

// ─── Test Suites ──────────────────────────────────────────────────────────

async function runSuite1_WikiInit() {
  suite("Suite 1: wiki_init");
  const vaultPath = freshVaultPath();
  fs.mkdirSync(vaultPath, { recursive: true });
  const client = new McpTestClient(vaultPath);
  await client.start();

  await test("init fresh vault → success", async () => {
    const res = await client.call("wiki_init", {});
    assertEquals(res.status, "success", "status");
    assert(res.created.includes("_schema.md"), "created includes _schema.md");
    assert(res.created.includes("_log.md"), "created includes _log.md");
    assert(res.created.includes("_index.md"), "created includes _index.md");
    assert(fs.existsSync(path.join(vaultPath, "_schema.md")), "_schema.md tồn tại");
  });

  await test("init lần 2 → already_initialized", async () => {
    const res = await client.call("wiki_init", {});
    assertEquals(res.status, "already_initialized", "status");
    // Files không bị ghi đè
    assert(fs.existsSync(path.join(vaultPath, "_schema.md")), "_schema.md vẫn tồn tại");
  });

  await test("_wiki/ subdirs đã được tạo", async () => {
    for (const dir of ["infra", "ops", "concepts", "projects"]) {
      assert(
        fs.existsSync(path.join(vaultPath, "_wiki", dir)),
        `_wiki/${dir} tồn tại`
      );
    }
  });

  client.stop();
  cleanVault(vaultPath);
}

async function runSuite2_WritePage() {
  suite("Suite 2: wiki_write_page");
  const vaultPath = freshVaultPath();
  fs.mkdirSync(vaultPath, { recursive: true });
  const client = new McpTestClient(vaultPath);
  await client.start();
  await client.call("wiki_init", {});

  await test("ghi page mới → action=created", async () => {
    const res = await client.call("wiki_write_page", {
      path: "_wiki/infra/redis-oom.md",
      content: makePage("Redis OOM fix bằng allkeys-lru", ["redis", "infra"]),
      source: "test",
    });
    assertEquals(res.status, "success", "status");
    assertEquals(res.action, "created", "action");
    assertEquals(res.path, "_wiki/infra/redis-oom.md", "path");
    assert(fs.existsSync(path.join(vaultPath, "_wiki/infra/redis-oom.md")), "file tồn tại");
  });

  await test("_index.md được cập nhật sau write", async () => {
    const indexContent = fs.readFileSync(path.join(vaultPath, "_index.md"), "utf-8");
    assert(indexContent.includes("redis-oom.md"), "_index.md chứa path mới");
    assert(indexContent.includes("Redis OOM"), "_index.md chứa tldr");
  });

  await test("ghi lại page cũ → action=updated", async () => {
    const res = await client.call("wiki_write_page", {
      path: "_wiki/infra/redis-oom.md",
      content: makePage("Redis OOM — đã update", ["redis", "infra"]),
      source: "test",
    });
    assertEquals(res.action, "updated", "action");
  });

  await test("path traversal → lỗi PATH_TRAVERSAL", async () => {
    const res = await client.call("wiki_write_page", {
      path: "../../etc/passwd",
      content: "malicious",
      source: "test",
    });
    assertEquals(res.status, "error", "status");
    assertEquals(res.code, "PATH_TRAVERSAL", "code");
  });

  await test("vault chưa init → lỗi VAULT_NOT_INIT", async () => {
    const emptyPath = freshVaultPath();
    fs.mkdirSync(emptyPath, { recursive: true });
    const c2 = new McpTestClient(emptyPath);
    await c2.start();
    const res = await c2.call("wiki_write_page", {
      path: "_wiki/test.md",
      content: "test",
      source: "test",
    });
    assertEquals(res.code, "VAULT_NOT_INIT", "code");
    c2.stop();
    cleanVault(emptyPath);
  });

  client.stop();
  cleanVault(vaultPath);
}

async function runSuite3_Query() {
  suite("Suite 3: wiki_query");
  const vaultPath = freshVaultPath();
  fs.mkdirSync(vaultPath, { recursive: true });
  const client = new McpTestClient(vaultPath);
  await client.start();
  await client.call("wiki_init", {});

  // Seed 3 pages
  await client.call("wiki_write_page", {
    path: "_wiki/infra/redis-oom.md",
    content: makePage("Redis OOM do maxmemory-policy=noeviction", ["redis", "infra", "server-35"]),
    source: "test",
  });
  await client.call("wiki_write_page", {
    path: "_wiki/ops/deploy-xcall.md",
    content: makePage("Deploy xcall lên k8s bằng helm chart", ["xcall", "deploy", "k8s"]),
    source: "test",
  });
  await client.call("wiki_write_page", {
    path: "_wiki/concepts/mrcp.md",
    content: makePage("MRCP protocol dùng cho ASR/TTS trong xcall", ["mrcp", "xcall", "concepts"]),
    source: "test",
  });

  await test("query tìm thấy page phù hợp (redis)", async () => {
    const res = await client.call("wiki_query", { question: "redis oom maxmemory" });
    assert(Array.isArray(res.results), "results là array");
    assert(res.results.length > 0, "có kết quả");
    assert(res.results[0].path.includes("redis"), `result[0].path chứa 'redis': ${res.results[0].path}`);
    assertContains(res, "next_step", "có next_step");
  });

  await test("query trả tldr từ TL;DR section", async () => {
    const res = await client.call("wiki_query", { question: "xcall deploy helm" });
    assert(res.results.length > 0, "có kết quả");
    // tldr phải chứa text thực từ ## TL;DR section
    assert(res.results[0].tldr.length > 10, "tldr không rỗng");
  });

  await test("query không tìm thấy → status=not_found", async () => {
    const res = await client.call("wiki_query", { question: "zzz_nonexistent_topic_xyz" });
    assertEquals(res.status, "not_found", "status");
    assertEquals(res.results.length, 0, "results empty");
  });

  await test("query score nằm trong [0, 1]", async () => {
    const res = await client.call("wiki_query", { question: "redis" });
    for (const r of res.results) {
      assert(r.score >= 0 && r.score <= 1, `score ${r.score} nằm trong [0,1]`);
    }
  });

  client.stop();
  cleanVault(vaultPath);
}

async function runSuite4_ReadPage() {
  suite("Suite 4: wiki_read_page");
  const vaultPath = freshVaultPath();
  fs.mkdirSync(vaultPath, { recursive: true });
  const client = new McpTestClient(vaultPath);
  await client.start();
  await client.call("wiki_init", {});
  await client.call("wiki_write_page", {
    path: "_wiki/infra/redis-oom.md",
    content: makePage("Redis OOM fix", ["redis", "infra"]),
    source: "test",
  });

  await test("read shallow → có frontmatter + tldr_section", async () => {
    const res = await client.call("wiki_read_page", {
      path: "_wiki/infra/redis-oom.md",
      depth: "shallow",
    });
    assertEquals(res.depth, "shallow", "depth");
    assertContains(res, "frontmatter", "có frontmatter");
    assertContains(res, "tldr_section", "có tldr_section");
    assert(res.has_detail === true, "has_detail=true");
    assert(res.frontmatter.tldr.length > 0, "frontmatter.tldr không rỗng");
  });

  await test("read full → có content đầy đủ", async () => {
    const res = await client.call("wiki_read_page", {
      path: "_wiki/infra/redis-oom.md",
      depth: "full",
    });
    assertEquals(res.depth, "full", "depth");
    assertContains(res, "content", "có content");
    assert(res.content.includes("## TL;DR"), "content chứa ## TL;DR");
    assert(res.content.includes("## Detail"), "content chứa ## Detail");
  });

  await test("read page không tồn tại → PAGE_NOT_FOUND", async () => {
    const res = await client.call("wiki_read_page", {
      path: "_wiki/infra/nonexistent.md",
      depth: "full",
    });
    assertEquals(res.code, "PAGE_NOT_FOUND", "code");
  });

  await test("path traversal → PATH_TRAVERSAL", async () => {
    const res = await client.call("wiki_read_page", {
      path: "../../../etc/passwd",
      depth: "shallow",
    });
    assertEquals(res.code, "PATH_TRAVERSAL", "code");
  });

  client.stop();
  cleanVault(vaultPath);
}

async function runSuite5_Ingest() {
  suite("Suite 5: wiki_ingest");
  const vaultPath = freshVaultPath();
  fs.mkdirSync(vaultPath, { recursive: true });
  const client = new McpTestClient(vaultPath);
  await client.start();

  await test("vault chưa init → VAULT_NOT_INIT", async () => {
    const res = await client.call("wiki_ingest", {
      content: "Redis bị OOM trên server-35 lúc 08:30. maxmemory-policy=noeviction.",
      source: "test",
    });
    assertEquals(res.code, "VAULT_NOT_INIT", "code");
  });

  await client.call("wiki_init", {});

  await test("content quá ngắn (<50 tokens) → too_short", async () => {
    const res = await client.call("wiki_ingest", {
      content: "short",
      source: "test",
    });
    assertEquals(res.status, "too_short", "status");
  });

  await test("ingest content hợp lệ, vault rỗng → candidates=[]", async () => {
    // Content đủ dài (>200 chars = >50 tokens theo ước tính 0.25 tokens/char)
    const res = await client.call("wiki_ingest", {
      content: "Redis bị OOM trên server-35 lúc 08:30 sáng ngày hôm nay. Nguyên nhân chính là maxmemory-policy được cấu hình là noeviction, khiến Redis từ chối write mới khi RAM đầy thay vì evict key cũ. Cần đổi sang allkeys-lru để tự động evict key ít dùng nhất. Sau khi đổi policy cần restart Redis service và verify bằng redis-cli info memory.",
      source: "test",
    });
    assertEquals(res.status, "context_ready", "status");
    assertContains(res, "candidates", "có candidates");
    assertContains(res, "schema_excerpt", "có schema_excerpt");
    assertContains(res, "next_step", "có next_step");
  });

  // Seed một page rồi ingest lại
  await client.call("wiki_write_page", {
    path: "_wiki/infra/redis-oom.md",
    content: makePage("Redis OOM do maxmemory-policy=noeviction", ["redis", "infra"]),
    source: "test",
  });

  await test("ingest content liên quan → candidates có page phù hợp", async () => {
    const res = await client.call("wiki_ingest", {
      content: "Hôm nay Redis trên server-35 lại bị OOM lần nữa. maxmemory-policy vẫn còn là noeviction sau lần fix trước. Cần kiểm tra lại redis.conf và đảm bảo allkeys-lru đã được persist đúng cách sau khi restart service. Verify bằng CONFIG GET maxmemory-policy.",
      source: "test",
      tags: ["redis", "server-35"],
    });
    assertEquals(res.status, "context_ready", "status");
    assert(res.candidates.length > 0, "có candidates");
    assert(
      res.candidates.some((c) => c.path.includes("redis")),
      "candidates chứa redis page"
    );
  });

  await test("next_step khi không có candidates → gợi ý wiki_write_page", async () => {
    const res = await client.call("wiki_ingest", {
      content: "FreeSWITCH MRCP config bị lỗi trên server mới khi khởi động. Cần kiểm tra mrcp.conf và sofia profile để tìm nguyên nhân. Đây là lần đầu tiên gặp vấn đề này trong hệ thống xcall. Log báo connection timeout sau 5000ms khi ASR processing.",
      source: "test",
    });
    // BM25 có thể không match nếu vault chỉ có redis page
    if (res.candidates && res.candidates.length === 0) {
      assert(res.next_step.includes("wiki_write_page"), "next_step gợi ý wiki_write_page");
    } else {
      // Nếu match được thì cũng ok
      assertEquals(res.status, "context_ready", "status");
    }
  });

  client.stop();
  cleanVault(vaultPath);
}

async function runSuite6_LintScan() {
  suite("Suite 6: wiki_lint_scan");
  const vaultPath = freshVaultPath();
  fs.mkdirSync(vaultPath, { recursive: true });
  const client = new McpTestClient(vaultPath);
  await client.start();

  await test("vault chưa init → VAULT_NOT_INIT", async () => {
    const res = await client.call("wiki_lint_scan", {});
    assertEquals(res.code, "VAULT_NOT_INIT", "code");
  });

  await client.call("wiki_init", {});

  await test("vault không có pages → scanned=0, issues=[]", async () => {
    const res = await client.call("wiki_lint_scan", {});
    assertEquals(res.scanned, 0, "scanned=0");
    assertEquals(res.issues.length, 0, "issues empty");
  });

  // Seed page bình thường
  await client.call("wiki_write_page", {
    path: "_wiki/infra/redis-oom.md",
    content: makePage("Redis OOM fix", ["redis", "infra"]),
    source: "test",
  });

  await test("page hợp lệ → không có issues (hoặc chỉ ORPHAN vì mới tạo)", async () => {
    const res = await client.call("wiki_lint_scan", {});
    assertEquals(res.scanned, 1, "scanned=1");
    // Page mới tạo (mtimeAge=0) không bị ORPHAN vì < 7 ngày
    const nonOrphan = res.issues.filter(i => i.type !== "ORPHAN");
    assertEquals(nonOrphan.length, 0, "không có issues ngoài ORPHAN");
  });

  // Seed page thiếu TL;DR
  const noTldrPage = makePage("Page thiếu TL;DR", [], false, 0, false);
  await client.call("wiki_write_page", {
    path: "_wiki/ops/no-tldr.md",
    content: noTldrPage,
    source: "test",
  });

  await test("MISSING_TLDR được detect", async () => {
    const res = await client.call("wiki_lint_scan", {});
    const missingTldr = res.issues.filter(i => i.type === "MISSING_TLDR");
    assert(missingTldr.length > 0, "có ít nhất 1 MISSING_TLDR issue");
    assertEquals(missingTldr[0].severity, "low", "severity=low");
    assert(missingTldr[0].pages[0].includes("no-tldr"), "page đúng");
  });

  // Seed page với STALE (dirty=true, 100 ngày trước)
  await client.call("wiki_write_page", {
    path: "_wiki/ops/stale-page.md",
    content: makePage("Stale page cũ", ["ops"], true, 100),
    source: "test",
  });

  await test("STALE được detect (dirty=true + >90 ngày)", async () => {
    const res = await client.call("wiki_lint_scan", {});
    const stale = res.issues.filter(i => i.type === "STALE");
    assert(stale.length > 0, "có STALE issue");
    assertEquals(stale[0].severity, "medium", "severity=medium");
  });

  // Seed page với broken link
  await client.call("wiki_write_page", {
    path: "_wiki/ops/broken-links.md",
    content: makePage("Page có broken link", ["ops"], false, 0, true, ["nonexistent-page"]),
    source: "test",
  });

  await test("BROKEN_LINK được detect", async () => {
    const res = await client.call("wiki_lint_scan", {});
    const broken = res.issues.filter(i => i.type === "BROKEN_LINK");
    assert(broken.length > 0, "có BROKEN_LINK issue");
    assertEquals(broken[0].severity, "high", "severity=high");
    assert(broken[0].detail.includes("nonexistent-page"), "detail chứa tên link bị broken");
  });

  await test("issues đều có id, suggested_action", async () => {
    const res = await client.call("wiki_lint_scan", {});
    for (const issue of res.issues) {
      assert(issue.id.startsWith("issue-"), `id format đúng: ${issue.id}`);
      assert(issue.suggested_action.length > 0, `suggested_action không rỗng: ${issue.id}`);
    }
  });

  client.stop();
  cleanVault(vaultPath);
}

async function runSuite7_ApplyFix() {
  suite("Suite 7: wiki_apply_fix");
  const vaultPath = freshVaultPath();
  fs.mkdirSync(vaultPath, { recursive: true });
  const client = new McpTestClient(vaultPath);
  await client.start();
  await client.call("wiki_init", {});

  await test("issue_id không tồn tại → ISSUE_NOT_FOUND", async () => {
    const res = await client.call("wiki_apply_fix", { issue_id: "issue-999" });
    assertEquals(res.code, "ISSUE_NOT_FOUND", "code");
  });

  // Seed pages để lint
  await client.call("wiki_write_page", {
    path: "_wiki/ops/no-tldr.md",
    content: makePage("No TL;DR page", [], false, 0, false),
    source: "test",
  });
  await client.call("wiki_write_page", {
    path: "_wiki/ops/stale.md",
    content: makePage("Stale page", [], true, 100),
    source: "test",
  });
  await client.call("wiki_write_page", {
    path: "_wiki/ops/broken.md",
    content: makePage("Broken link page", [], false, 0, true, ["ghost-page"]),
    source: "test",
  });

  // Run lint để populate issues
  const lintRes = await client.call("wiki_lint_scan", {});
  const missingTldrIssue = lintRes.issues.find(i => i.type === "MISSING_TLDR");
  const staleIssue = lintRes.issues.find(i => i.type === "STALE");
  const brokenIssue = lintRes.issues.find(i => i.type === "BROKEN_LINK");

  await test("fix MISSING_TLDR → needs_content + trả content", async () => {
    assert(missingTldrIssue, "MISSING_TLDR issue tồn tại");
    const res = await client.call("wiki_apply_fix", { issue_id: missingTldrIssue.id });
    assertEquals(res.status, "needs_content", "status");
    assertContains(res, "content", "có content");
    assertContains(res, "instruction", "có instruction");
    assert(res.instruction.includes("wiki_write_page"), "instruction gợi ý wiki_write_page");
  });

  await test("fix STALE → fixed, dirty=false", async () => {
    assert(staleIssue, "STALE issue tồn tại");
    const res = await client.call("wiki_apply_fix", { issue_id: staleIssue.id });
    assertEquals(res.status, "fixed", "status");
    assert(res.changes.length > 0, "có changes");
    assert(res.changes[0].summary.includes("dirty=false"), "summary đề cập dirty=false");
    // Verify file thực sự được update
    const content = fs.readFileSync(path.join(vaultPath, "_wiki/ops/stale.md"), "utf-8");
    assert(content.includes("dirty: false"), "file đã set dirty=false");
  });

  await test("fix BROKEN_LINK không có resolution → needs_clarification", async () => {
    assert(brokenIssue, "BROKEN_LINK issue tồn tại");
    const res = await client.call("wiki_apply_fix", { issue_id: brokenIssue.id });
    assertEquals(res.status, "needs_clarification", "status");
    assertContains(res, "question", "có question");
  });

  await test("fix BROKEN_LINK với resolution='remove' → fixed", async () => {
    assert(brokenIssue, "BROKEN_LINK issue tồn tại");
    const res = await client.call("wiki_apply_fix", {
      issue_id: brokenIssue.id,
      resolution: "remove",
    });
    assertEquals(res.status, "fixed", "status");
    // Verify link đã bị remove
    const content = fs.readFileSync(path.join(vaultPath, "_wiki/ops/broken.md"), "utf-8");
    assert(!content.includes("[[ghost-page]]"), "broken link đã bị xóa");
    assert(content.includes("ghost-page"), "plain text vẫn còn");
  });

  client.stop();
  cleanVault(vaultPath);
}

async function runSuite8_Logging() {
  suite("Suite 8: _log.md và _index.md integrity");
  const vaultPath = freshVaultPath();
  fs.mkdirSync(vaultPath, { recursive: true });
  const client = new McpTestClient(vaultPath);
  await client.start();
  await client.call("wiki_init", {});

  await client.call("wiki_write_page", {
    path: "_wiki/infra/test-page.md",
    content: makePage("Test page", ["infra"]),
    source: "claude-session-001",
  });
  await client.call("wiki_query", { question: "test page infra" });
  await client.call("wiki_lint_scan", {});

  await test("_log.md ghi write entry", async () => {
    const log = fs.readFileSync(path.join(vaultPath, "_log.md"), "utf-8");
    assert(log.includes("write"), "_log.md có write entry");
    assert(log.includes("test-page.md"), "_log.md có tên page");
  });

  await test("_log.md ghi query entry", async () => {
    const log = fs.readFileSync(path.join(vaultPath, "_log.md"), "utf-8");
    assert(log.includes("query"), "_log.md có query entry");
    assert(log.includes("test page"), "_log.md có search term");
  });

  await test("_log.md ghi lint entry + LAST_LINT anchor", async () => {
    const log = fs.readFileSync(path.join(vaultPath, "_log.md"), "utf-8");
    assert(log.includes("lint"), "_log.md có lint entry");
    assert(log.includes("LAST_LINT"), "_log.md có LAST_LINT anchor");
  });

  await test("_index.md có đúng số pages", async () => {
    const idx = fs.readFileSync(path.join(vaultPath, "_index.md"), "utf-8");
    // Đếm data rows (không phải header/separator)
    const rows = idx.split("\n").filter(l => l.startsWith("| _wiki/"));
    assertEquals(rows.length, 1, "_index.md có 1 data row");
  });

  // Thêm page thứ 2
  await client.call("wiki_write_page", {
    path: "_wiki/ops/incident.md",
    content: makePage("Incident log", ["ops", "incident"]),
    source: "test",
  });

  await test("_index.md tăng lên 2 rows sau write thứ 2", async () => {
    const idx = fs.readFileSync(path.join(vaultPath, "_index.md"), "utf-8");
    const rows = idx.split("\n").filter(l => l.startsWith("| _wiki/"));
    assertEquals(rows.length, 2, "_index.md có 2 data rows");
  });

  client.stop();
  cleanVault(vaultPath);
}

async function runSuite9_EndToEnd() {
  suite("Suite 9: End-to-end workflow (ingest → query → lint → fix)");
  const vaultPath = freshVaultPath();
  fs.mkdirSync(vaultPath, { recursive: true });
  const client = new McpTestClient(vaultPath);
  await client.start();

  // Step 1: Init
  await test("Step 1 — wiki_init", async () => {
    const res = await client.call("wiki_init", {});
    assertEquals(res.status, "success", "init ok");
  });

  // Step 2: Ingest raw session content
  await test("Step 2 — wiki_ingest raw session content", async () => {
    const rawContent = `
      Hôm nay debug FreeSWITCH trên server-35. MRCP server bị timeout khi ASR request.
      Nguyên nhân: mrcp.conf có connection_timeout=5000ms nhưng ASR engine cần ~8000ms.
      Fix: tăng connection_timeout=15000, restart FreeSWITCH service.
      Lệnh: systemctl restart freeswitch
      Verify: fs_cli -x "sofia status" để check MRCP profile.
    `;
    const res = await client.call("wiki_ingest", {
      content: rawContent,
      source: "claude-session-e2e",
      tags: ["freeswitch", "mrcp", "server-35"],
    });
    assertEquals(res.status, "context_ready", "ingest ok");
  });

  // Step 3: Host LLM viết page (simulate)
  await test("Step 3 — wiki_write_page (host LLM decision)", async () => {
    const res = await client.call("wiki_write_page", {
      path: "_wiki/infra/freeswitch-mrcp-timeout.md",
      content: `---
tldr: "FreeSWITCH MRCP timeout do connection_timeout quá thấp. Fix: tăng lên 15000ms."
tags: [freeswitch, mrcp, server-35, infra]
related: []
last_modified: "${new Date().toISOString().slice(0, 10)}"
dirty: false
source: "claude-session-e2e"
---

## TL;DR

FreeSWITCH MRCP bị timeout khi ASR request vì connection_timeout=5000ms quá thấp.
ASR engine cần ~8000ms để process. Fix: tăng connection_timeout=15000ms trong mrcp.conf.

---

## Detail

### Triệu chứng

MRCP request timeout sau 5 giây, ASR không trả kết quả.

### Nguyên nhân

mrcp.conf: connection_timeout=5000 (mặc định) < ASR processing time (~8000ms).

### Fix

\`\`\`bash
# Sửa /etc/freeswitch/mrcp.conf
connection_timeout=15000

# Restart
systemctl restart freeswitch

# Verify
fs_cli -x "sofia status"
\`\`\`
`,
      source: "claude-session-e2e",
    });
    assertEquals(res.action, "created", "page created");
  });

  // Step 4: Query lại
  await test("Step 4 — wiki_query tìm thấy page vừa tạo", async () => {
    const res = await client.call("wiki_query", {
      question: "freeswitch mrcp timeout",
    });
    assert(res.results.length > 0, "tìm thấy kết quả");
    assert(
      res.results[0].path.includes("freeswitch"),
      `result đúng page: ${res.results[0].path}`
    );
  });

  // Step 5: Read full page
  await test("Step 5 — wiki_read_page full", async () => {
    const res = await client.call("wiki_read_page", {
      path: "_wiki/infra/freeswitch-mrcp-timeout.md",
      depth: "full",
    });
    assertEquals(res.depth, "full", "depth=full");
    assert(res.content.includes("connection_timeout=15000"), "content chứa fix");
  });

  // Step 6: Lint (page mới, ít vấn đề)
  await test("Step 6 — wiki_lint_scan không có MISSING_TLDR", async () => {
    const res = await client.call("wiki_lint_scan", {});
    assertEquals(res.scanned, 1, "scanned=1");
    const missing = res.issues.filter(i => i.type === "MISSING_TLDR");
    assertEquals(missing.length, 0, "không có MISSING_TLDR");
  });

  client.stop();
  cleanVault(vaultPath);
}

// ─── Main ─────────────────────────────────────────────────────────────────

async function main() {
  console.log("\x1b[1mobsidian-wiki-mcp — Test Suite\x1b[0m");
  console.log("=".repeat(50));

  const start = Date.now();

  try {
    await runSuite1_WikiInit();
    await runSuite2_WritePage();
    await runSuite3_Query();
    await runSuite4_ReadPage();
    await runSuite5_Ingest();
    await runSuite6_LintScan();
    await runSuite7_ApplyFix();
    await runSuite8_Logging();
    await runSuite9_EndToEnd();
  } catch (err) {
    console.error("\n\x1b[31mFATAL ERROR trong test runner:\x1b[0m", err.message);
  }

  const duration = ((Date.now() - start) / 1000).toFixed(1);

  console.log("\n" + "=".repeat(50));
  console.log(`\x1b[1mKết quả: \x1b[32m${passed} passed\x1b[0m, \x1b[31m${failed} failed\x1b[0m  (${duration}s)`);

  if (failures.length > 0) {
    console.log("\n\x1b[31mFailed tests:\x1b[0m");
    for (const f of failures) {
      console.log(`  • ${f.name}`);
      console.log(`    ${f.error}`);
    }
  }

  process.exit(failed > 0 ? 1 : 0);
}

main();
