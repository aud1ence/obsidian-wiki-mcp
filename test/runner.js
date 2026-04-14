/**
 * Simple test runner — no Jest/Mocha needed.
 * Run: node test/runner.js
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
  // Manually delete each file/dir
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

${hasTldrSection ? `## TL;DR\n\n${tldr}\n\n---\n\n## Detail\n\nDetailed content.\n${brokenLinksText}` : `## Detail\n\nContent without TL;DR.\n${brokenLinksText}`}
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
    assert(fs.existsSync(path.join(vaultPath, "_schema.md")), "_schema.md exists");
  });

  await test("init 2nd time → already_initialized", async () => {
    const res = await client.call("wiki_init", {});
    assertEquals(res.status, "already_initialized", "status");
    // Files are not overwritten
    assert(fs.existsSync(path.join(vaultPath, "_schema.md")), "_schema.md still exists");
  });

  await test("_wiki/ subdirs were created", async () => {
    for (const dir of ["systems", "guides", "topics", "work"]) {
      assert(
        fs.existsSync(path.join(vaultPath, "_wiki", dir)),
        `_wiki/${dir} exists`
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

  await test("write new page → action=created", async () => {
    const res = await client.call("wiki_write_page", {
      path: "_wiki/systems/redis-oom.md",
      content: makePage("Redis OOM fix using allkeys-lru", ["redis", "systems"]),
      source: "test",
    });
    assertEquals(res.status, "success", "status");
    assertEquals(res.action, "created", "action");
    assertEquals(res.path, "_wiki/systems/redis-oom.md", "path");
    assert(fs.existsSync(path.join(vaultPath, "_wiki/systems/redis-oom.md")), "file exists");
  });

  await test("_index.md updated after write", async () => {
    const indexContent = fs.readFileSync(path.join(vaultPath, "_index.md"), "utf-8");
    assert(indexContent.includes("redis-oom.md"), "_index.md contains new path");
    assert(indexContent.includes("Redis OOM"), "_index.md contains tldr");
  });

  await test("write existing page → action=updated", async () => {
    const res = await client.call("wiki_write_page", {
      path: "_wiki/systems/redis-oom.md",
      content: makePage("Redis OOM — updated", ["redis", "systems"]),
      source: "test",
    });
    assertEquals(res.action, "updated", "action");
  });

  await test("path traversal → error PATH_TRAVERSAL", async () => {
    const res = await client.call("wiki_write_page", {
      path: "../../etc/passwd",
      content: "malicious",
      source: "test",
    });
    assertEquals(res.status, "error", "status");
    assertEquals(res.code, "PATH_TRAVERSAL", "code");
  });

  await test("vault not init → error VAULT_NOT_INIT", async () => {
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
    path: "_wiki/systems/redis-oom.md",
    content: makePage("Redis OOM due to maxmemory-policy=noeviction", ["redis", "systems", "server-35"]),
    source: "test",
  });
  await client.call("wiki_write_page", {
    path: "_wiki/guides/deploy-xcall.md",
    content: makePage("Deploy xcall on k8s using helm chart", ["xcall", "deploy", "k8s"]),
    source: "test",
  });
  await client.call("wiki_write_page", {
    path: "_wiki/topics/mrcp.md",
    content: makePage("MRCP protocol used for ASR/TTS in xcall", ["mrcp", "xcall", "concepts"]),
    source: "test",
  });

  await test("query finds relevant page (redis)", async () => {
    const res = await client.call("wiki_query", { question: "redis oom maxmemory" });
    assert(Array.isArray(res.results), "results is array");
    assert(res.results.length > 0, "has results");
    assert(res.results[0].path.includes("redis"), `result[0].path contains 'redis': ${res.results[0].path}`);
    assertContains(res, "next_step", "has next_step");
  });

  await test("query returns tldr from TL;DR section", async () => {
    const res = await client.call("wiki_query", { question: "xcall deploy helm" });
    assert(res.results.length > 0, "has results");
    // tldr must contain actual text from ## TL;DR section
    assert(res.results[0].tldr.length > 10, "tldr not empty");
  });

  await test("query not found → status=not_found", async () => {
    const res = await client.call("wiki_query", { question: "zzz_nonexistent_topic_xyz" });
    assertEquals(res.status, "not_found", "status");
    assertEquals(res.results.length, 0, "results empty");
  });

  await test("query score is within [0, 1]", async () => {
    const res = await client.call("wiki_query", { question: "redis" });
    for (const r of res.results) {
      assert(r.score >= 0 && r.score <= 1, `score ${r.score} is within [0,1]`);
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
    path: "_wiki/systems/redis-oom.md",
    content: makePage("Redis OOM fix", ["redis", "systems"]),
    source: "test",
  });

  await test("read shallow → has frontmatter + tldr_section", async () => {
    const res = await client.call("wiki_read_page", {
      path: "_wiki/systems/redis-oom.md",
      depth: "shallow",
    });
    assertEquals(res.depth, "shallow", "depth");
    assertContains(res, "frontmatter", "has frontmatter");
    assertContains(res, "tldr_section", "has tldr_section");
    assert(res.has_detail === true, "has_detail=true");
    assert(res.frontmatter.tldr.length > 0, "frontmatter.tldr is not empty");
  });

  await test("read full → has full content", async () => {
    const res = await client.call("wiki_read_page", {
      path: "_wiki/systems/redis-oom.md",
      depth: "full",
    });
    assertEquals(res.depth, "full", "depth");
    assertContains(res, "content", "has content");
    assert(res.content.includes("## TL;DR"), "content contains ## TL;DR");
    assert(res.content.includes("## Detail"), "content contains ## Detail");
  });

  await test("read non-existent page → PAGE_NOT_FOUND", async () => {
    const res = await client.call("wiki_read_page", {
      path: "_wiki/systems/nonexistent.md",
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

  await test("vault not init → VAULT_NOT_INIT", async () => {
    const res = await client.call("wiki_ingest", {
      content: "Redis hit OOM on server-35 at 08:30. maxmemory-policy=noeviction.",
      source: "test",
    });
    assertEquals(res.code, "VAULT_NOT_INIT", "code");
  });

  await client.call("wiki_init", {});

  await test("content too short (<50 tokens) → too_short", async () => {
    const res = await client.call("wiki_ingest", {
      content: "short",
      source: "test",
    });
    assertEquals(res.status, "too_short", "status");
  });

  await test("ingest valid content, empty vault → candidates=[]", async () => {
    // Content long enough (>200 chars = >50 tokens based on 0.25 tokens/char estimate)
    const res = await client.call("wiki_ingest", {
      content: "Redis OOM on server-35 at 08:30 AM today. The root cause is maxmemory-policy being set to noeviction, causing Redis to reject new writes when RAM is full instead of evicting old keys. Need to change to allkeys-lru to automatically evict least used keys. After changing policy, restart Redis service and verify with redis-cli info memory.",
      source: "test",
    });
    assertEquals(res.status, "context_ready", "status");
    assertContains(res, "candidates", "has candidates");
    assertContains(res, "schema_excerpt", "has schema_excerpt");
    assertContains(res, "next_step", "has next_step");
  });

  // Seed a page and ingest again
  await client.call("wiki_write_page", {
    path: "_wiki/systems/redis-oom.md",
    content: makePage("Redis OOM due to maxmemory-policy=noeviction", ["redis", "systems"]),
    source: "test",
  });

  await test("ingest related content → candidates has matching page", async () => {
    const res = await client.call("wiki_ingest", {
      content: "Today Redis on server-35 hit OOM again. maxmemory-policy was still noeviction after the previous fix. Need to double check redis.conf and ensure allkeys-lru was properly persisted after service restart. Verify with CONFIG GET maxmemory-policy.",
      source: "test",
      tags: ["redis", "server-35"],
    });
    assertEquals(res.status, "context_ready", "status");
    assert(res.candidates.length > 0, "has candidates");
    assert(
      res.candidates.some((c) => c.path.includes("redis")),
      "candidates contains redis page"
    );
  });

  await test("next_step when no candidates → suggests wiki_write_page", async () => {
    const res = await client.call("wiki_ingest", {
      content: "FreeSWITCH MRCP config error on new server during startup. Need to check mrcp.conf and sofia profile to find root cause. This is the first time encountering this issue in xcall system. Log reports connection timeout after 5000ms during ASR processing.",
      source: "test",
    });
    // BM25 might not match if vault only has redis page
    if (res.candidates && res.candidates.length === 0) {
      assert(res.next_step.includes("wiki_write_page"), "next_step suggests wiki_write_page");
    } else {
      // If it matches, that's also ok
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

  await test("vault not init → VAULT_NOT_INIT", async () => {
    const res = await client.call("wiki_lint_scan", {});
    assertEquals(res.code, "VAULT_NOT_INIT", "code");
  });

  await client.call("wiki_init", {});

  await test("vault has no pages → scanned=0, issues=[]", async () => {
    const res = await client.call("wiki_lint_scan", {});
    assertEquals(res.scanned, 0, "scanned=0");
    assertEquals(res.issues.length, 0, "issues empty");
  });

  // Seed a normal page
  await client.call("wiki_write_page", {
    path: "_wiki/systems/redis-oom.md",
    content: makePage("Redis OOM fix", ["redis", "systems"]),
    source: "test",
  });

  await test("valid page → no issues (or only ORPHAN as just created)", async () => {
    const res = await client.call("wiki_lint_scan", {});
    assertEquals(res.scanned, 1, "scanned=1");
    // Page just created (mtimeAge=0) is not ORPHAN as < 7 days
    const nonOrphan = res.issues.filter(i => i.type !== "ORPHAN");
    assertEquals(nonOrphan.length, 0, "no issues besides ORPHAN");
  });

  // Seed page missing TL;DR
  const noTldrPage = makePage("Page missing TL;DR", [], false, 0, false);
  await client.call("wiki_write_page", {
    path: "_wiki/guides/no-tldr.md",
    content: noTldrPage,
    source: "test",
  });

  await test("MISSING_TLDR is detected", async () => {
    const res = await client.call("wiki_lint_scan", {});
    const missingTldr = res.issues.filter(i => i.type === "MISSING_TLDR");
    assert(missingTldr.length > 0, "has at least 1 MISSING_TLDR issue");
    assertEquals(missingTldr[0].severity, "low", "severity=low");
    assert(missingTldr[0].pages[0].includes("no-tldr"), "correct page");
  });

  // Seed page with STALE (dirty=true, 100 days ago)
  await client.call("wiki_write_page", {
    path: "_wiki/guides/stale-page.md",
    content: makePage("Old stale page", ["guides"], true, 100),
    source: "test",
  });

  await test("STALE is detected (dirty=true + >90 days)", async () => {
    const res = await client.call("wiki_lint_scan", {});
    const stale = res.issues.filter(i => i.type === "STALE");
    assert(stale.length > 0, "has STALE issue");
    assertEquals(stale[0].severity, "medium", "severity=medium");
  });

  // Seed page with broken link
  await client.call("wiki_write_page", {
    path: "_wiki/guides/broken-links.md",
    content: makePage("Page with broken link", ["guides"], false, 0, true, ["nonexistent-page"]),
    source: "test",
  });

  await test("BROKEN_LINK is detected", async () => {
    const res = await client.call("wiki_lint_scan", {});
    const broken = res.issues.filter(i => i.type === "BROKEN_LINK");
    assert(broken.length > 0, "has BROKEN_LINK issue");
    assertEquals(broken[0].severity, "high", "severity=high");
    assert(broken[0].detail.includes("nonexistent-page"), "detail contains broken link name");
  });

  await test("issues all have id, suggested_action", async () => {
    const res = await client.call("wiki_lint_scan", {});
    for (const issue of res.issues) {
      assert(issue.id.startsWith("issue-"), `id format is correct: ${issue.id}`);
      assert(issue.suggested_action.length > 0, `suggested_action is not empty: ${issue.id}`);
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

  await test("issue_id does not exist → ISSUE_NOT_FOUND", async () => {
    const res = await client.call("wiki_apply_fix", { issue_id: "issue-999" });
    assertEquals(res.code, "ISSUE_NOT_FOUND", "code");
  });

  // Seed pages for linting
  await client.call("wiki_write_page", {
    path: "_wiki/guides/no-tldr.md",
    content: makePage("No TL;DR page", [], false, 0, false),
    source: "test",
  });
  await client.call("wiki_write_page", {
    path: "_wiki/guides/stale.md",
    content: makePage("Stale page", [], true, 100),
    source: "test",
  });
  await client.call("wiki_write_page", {
    path: "_wiki/guides/broken.md",
    content: makePage("Broken link page", [], false, 0, true, ["ghost-page"]),
    source: "test",
  });

  // Run lint to populate issues
  const lintRes = await client.call("wiki_lint_scan", {});
  const missingTldrIssue = lintRes.issues.find(i => i.type === "MISSING_TLDR");
  const staleIssue = lintRes.issues.find(i => i.type === "STALE");
  const brokenIssue = lintRes.issues.find(i => i.type === "BROKEN_LINK");

  await test("fix MISSING_TLDR → needs_content + return content", async () => {
    assert(missingTldrIssue, "MISSING_TLDR issue exists");
    const res = await client.call("wiki_apply_fix", { issue_id: missingTldrIssue.id });
    assertEquals(res.status, "needs_content", "status");
    assertContains(res, "content", "has content");
    assertContains(res, "instruction", "has instruction");
    assert(res.instruction.includes("wiki_write_page"), "instruction suggests wiki_write_page");
  });

  await test("fix STALE → fixed, dirty=false", async () => {
    assert(staleIssue, "STALE issue exists");
    const res = await client.call("wiki_apply_fix", { issue_id: staleIssue.id });
    assertEquals(res.status, "fixed", "status");
    assert(res.changes.length > 0, "has changes");
    assert(res.changes[0].summary.includes("dirty=false"), "summary mentions dirty=false");
    // Verify file is actually updated
    const content = fs.readFileSync(path.join(vaultPath, "_wiki/guides/stale.md"), "utf-8");
    assert(content.includes("dirty: false"), "file has set dirty=false");
  });

  await test("fix BROKEN_LINK without resolution → needs_clarification", async () => {
    assert(brokenIssue, "BROKEN_LINK issue exists");
    const res = await client.call("wiki_apply_fix", { issue_id: brokenIssue.id });
    assertEquals(res.status, "needs_clarification", "status");
    assertContains(res, "question", "has question");
  });

  await test("fix BROKEN_LINK with resolution='remove' → fixed", async () => {
    assert(brokenIssue, "BROKEN_LINK issue exists");
    const res = await client.call("wiki_apply_fix", {
      issue_id: brokenIssue.id,
      resolution: "remove",
    });
    assertEquals(res.status, "fixed", "status");
    // Verify link is removed
    const content = fs.readFileSync(path.join(vaultPath, "_wiki/guides/broken.md"), "utf-8");
    assert(!content.includes("[[ghost-page]]"), "broken link removed");
    assert(content.includes("ghost-page"), "plain text remains");
  });

  client.stop();
  cleanVault(vaultPath);
}

async function runSuite8_Logging() {
  suite("Suite 8: _log.md and _index.md integrity");
  const vaultPath = freshVaultPath();
  fs.mkdirSync(vaultPath, { recursive: true });
  const client = new McpTestClient(vaultPath);
  await client.start();
  await client.call("wiki_init", {});

  await client.call("wiki_write_page", {
    path: "_wiki/systems/test-page.md",
    content: makePage("Test page", ["systems"]),
    source: "claude-session-001",
  });
  await client.call("wiki_query", { question: "test page infra" });
  await client.call("wiki_lint_scan", {});

  await test("_log.md records write entry", async () => {
    const log = fs.readFileSync(path.join(vaultPath, "_log.md"), "utf-8");
    assert(log.includes("write"), "_log.md has write entry");
    assert(log.includes("test-page.md"), "_log.md has page name");
  });

  await test("_log.md records query entry", async () => {
    const log = fs.readFileSync(path.join(vaultPath, "_log.md"), "utf-8");
    assert(log.includes("query"), "_log.md has query entry");
    assert(log.includes("test page"), "_log.md has search term");
  });

  await test("_log.md records lint entry + LAST_LINT anchor", async () => {
    const log = fs.readFileSync(path.join(vaultPath, "_log.md"), "utf-8");
    assert(log.includes("lint"), "_log.md has lint entry");
    assert(log.includes("LAST_LINT"), "_log.md has LAST_LINT anchor");
  });

  await test("_index.md has correct number of pages", async () => {
    const idx = fs.readFileSync(path.join(vaultPath, "_index.md"), "utf-8");
    // Count data rows (not header/separator)
    const rows = idx.split("\n").filter(l => l.startsWith("| _wiki/"));
    assertEquals(rows.length, 1, "_index.md has 1 data row");
  });

  // Add second page
  await client.call("wiki_write_page", {
    path: "_wiki/guides/incident.md",
    content: makePage("Incident log", ["guides", "incident"]),
    source: "test",
  });

  await test("_index.md increases to 2 rows after second write", async () => {
    const idx = fs.readFileSync(path.join(vaultPath, "_index.md"), "utf-8");
    const rows = idx.split("\n").filter(l => l.startsWith("| _wiki/"));
    assertEquals(rows.length, 2, "_index.md has 2 data rows");
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
      Today debug FreeSWITCH on server-35. MRCP server timeout on ASR request.
      Cause: mrcp.conf has connection_timeout=5000ms but ASR engine needs ~8000ms.
      Fix: increase connection_timeout=15000, restart FreeSWITCH service.
      Command: systemctl restart freeswitch
      Verify: fs_cli -x "sofia status" to check MRCP profile.
    `;
    const res = await client.call("wiki_ingest", {
      content: rawContent,
      source: "claude-session-e2e",
      tags: ["freeswitch", "mrcp", "server-35"],
    });
    assertEquals(res.status, "context_ready", "ingest ok");
  });

  // Step 3: Host LLM writes page (simulate)
  await test("Step 3 — wiki_write_page (host LLM decision)", async () => {
    const res = await client.call("wiki_write_page", {
      path: "_wiki/systems/freeswitch-mrcp-timeout.md",
      content: `---
tldr: "FreeSWITCH MRCP timeout due to low connection_timeout. Fix: increase to 15000ms."
tags: [freeswitch, mrcp, server-35, systems]
related: []
last_modified: "${new Date().toISOString().slice(0, 10)}"
dirty: false
source: "claude-session-e2e"
---

## TL;DR

FreeSWITCH MRCP timed out during ASR request because connection_timeout=5000ms is too low.
ASR engine needs ~8000ms to process. Fix: increase connection_timeout=15000ms in mrcp.conf.

---

## Detail

### Symptoms

MRCP request timeout after 5 seconds, ASR returns no results.

### Cause

mrcp.conf: connection_timeout=5000 (default) < ASR processing time (~8000ms).

### Fix

\`\`\`bash
# Edit /etc/freeswitch/mrcp.conf
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

  // Step 4: Query again
  await test("Step 4 — wiki_query finds the newly created page", async () => {
    const res = await client.call("wiki_query", {
      question: "freeswitch mrcp timeout",
    });
    assert(res.results.length > 0, "found results");
    assert(
      res.results[0].path.includes("freeswitch"),
      `result is the correct page: ${res.results[0].path}`
    );
  });

  // Step 5: Read full page
  await test("Step 5 — wiki_read_page full", async () => {
    const res = await client.call("wiki_read_page", {
      path: "_wiki/systems/freeswitch-mrcp-timeout.md",
      depth: "full",
    });
    assertEquals(res.depth, "full", "depth=full");
    assert(res.content.includes("connection_timeout=15000"), "content contains fix");
  });

  // Step 6: Lint (new page, few issues)
  await test("Step 6 — wiki_lint_scan has no MISSING_TLDR", async () => {
    const res = await client.call("wiki_lint_scan", {});
    assertEquals(res.scanned, 1, "scanned=1");
    const missing = res.issues.filter(i => i.type === "MISSING_TLDR");
    assertEquals(missing.length, 0, "no MISSING_TLDR");
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
    console.error("\n\x1b[31mFATAL ERROR in test runner:\x1b[0m", err.message);
  }

  const duration = ((Date.now() - start) / 1000).toFixed(1);

  console.log("\n" + "=".repeat(50));
  console.log(`\x1b[1mResult: \x1b[32m${passed} passed\x1b[0m, \x1b[31m${failed} failed\x1b[0m  (${duration}s)`);

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
