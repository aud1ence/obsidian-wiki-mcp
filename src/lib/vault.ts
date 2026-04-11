import fs from "fs";
import path from "path";

/** Validate path nằm trong vault, chống path traversal */
export function validateVaultPath(
  userPath: string,
  vaultPath: string
): string {
  const abs = path.resolve(vaultPath, userPath);
  const vaultAbs = path.resolve(vaultPath);
  if (!abs.startsWith(vaultAbs + path.sep) && abs !== vaultAbs) {
    throw {
      code: "PATH_TRAVERSAL",
      message: `Path "${userPath}" nằm ngoài vault`,
    };
  }
  return abs;
}

/** Ghi file an toàn với lockfile + timeout */
export async function writePageSafe(
  absPath: string,
  content: string,
  lockTimeoutMs = 5000,
  staleLockTtlMs = 30000
): Promise<void> {
  const lockPath = absPath + ".lock";

  // Cleanup stale lock
  if (fs.existsSync(lockPath)) {
    const stat = fs.statSync(lockPath);
    const age = Date.now() - stat.mtimeMs;
    if (age > staleLockTtlMs) {
      fs.unlinkSync(lockPath);
    }
  }

  // Chờ lock tối đa lockTimeoutMs
  const deadline = Date.now() + lockTimeoutMs;
  while (fs.existsSync(lockPath)) {
    if (Date.now() > deadline) {
      throw {
        code: "LOCK_TIMEOUT",
        message: "Page đang được ghi bởi tool khác. Thử lại sau.",
      };
    }
    await sleep(100);
  }

  // Acquire → ghi → release
  fs.writeFileSync(lockPath, String(Date.now()));
  try {
    fs.mkdirSync(path.dirname(absPath), { recursive: true });
    fs.writeFileSync(absPath, content, "utf-8");
  } finally {
    if (fs.existsSync(lockPath)) fs.unlinkSync(lockPath);
  }
}

/** Xóa tất cả stale locks trong vault */
export function cleanupStaleLocks(
  vaultPath: string,
  staleLockTtlMs = 30000
): void {
  if (!fs.existsSync(vaultPath)) return;
  const cleanup = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        cleanup(full);
      } else if (entry.name.endsWith(".lock")) {
        const stat = fs.statSync(full);
        const age = Date.now() - stat.mtimeMs;
        if (age > staleLockTtlMs) {
          fs.unlinkSync(full);
        }
      }
    }
  };
  cleanup(vaultPath);
}

/** Kiểm tra vault đã init chưa */
export function isVaultInitialized(vaultPath: string): boolean {
  return fs.existsSync(path.join(vaultPath, "_schema.md"));
}

/** Đọc file trong vault, trả null nếu không tồn tại */
export function readFile(absPath: string): string | null {
  if (!fs.existsSync(absPath)) return null;
  return fs.readFileSync(absPath, "utf-8");
}

/** List tất cả .md files trong _wiki/ */
export function listWikiPages(vaultPath: string): string[] {
  const wikiDir = path.join(vaultPath, "_wiki");
  if (!fs.existsSync(wikiDir)) return [];
  const results: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith(".md") && !entry.name.startsWith(".")) {
        results.push(full);
      }
    }
  };
  walk(wikiDir);
  return results;
}

/** Relative path từ vault root */
export function relPath(absPath: string, vaultPath: string): string {
  return path.relative(vaultPath, absPath);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
