/**
 * Minimal MCP stdio client dùng trong test.
 * Spawn server process, gửi request, nhận response theo id.
 */
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_PATH = path.resolve(__dirname, "../dist/index.js");

export class McpTestClient {
  constructor(vaultPath) {
    this.vaultPath = vaultPath;
    this.proc = null;
    this.pending = new Map(); // id → { resolve, reject }
    this.buffer = "";
    this._idCounter = 0;
  }

  async start() {
    this.proc = spawn("node", [SERVER_PATH, "--vault", this.vaultPath], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    this.proc.stderr.on("data", () => {}); // suppress logs

    this.proc.stdout.on("data", (chunk) => {
      this.buffer += chunk.toString();
      const lines = this.buffer.split("\n");
      this.buffer = lines.pop(); // giữ lại phần chưa complete
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);
          const p = this.pending.get(msg.id);
          if (p) {
            this.pending.delete(msg.id);
            if (msg.error) p.reject(new Error(JSON.stringify(msg.error)));
            else p.resolve(msg.result);
          }
        } catch {
          // ignore non-JSON lines
        }
      }
    });

    this.proc.on("error", (err) => {
      for (const p of this.pending.values()) p.reject(err);
    });

    // Initialize
    await this._send("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "test-runner", version: "1" },
    });
  }

  stop() {
    if (this.proc) {
      this.proc.kill();
      this.proc = null;
    }
  }

  _nextId() {
    return ++this._idCounter;
  }

  _send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this._nextId();
      this.pending.set(id, { resolve, reject });
      const msg = JSON.stringify({ jsonrpc: "2.0", id, method, params });
      this.proc.stdin.write(msg + "\n");
      // Timeout 10s
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`Timeout waiting for response id=${id} method=${method}`));
        }
      }, 10_000);
    });
  }

  /** Gọi một MCP tool, trả parsed JSON từ content[0].text */
  async call(toolName, args = {}) {
    const result = await this._send("tools/call", {
      name: toolName,
      arguments: args,
    });
    const text = result?.content?.[0]?.text;
    if (!text) throw new Error(`Empty response from ${toolName}`);
    return JSON.parse(text);
  }
}
