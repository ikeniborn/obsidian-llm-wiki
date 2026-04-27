import { spawn, type ChildProcess } from "node:child_process";
import { createInterface } from "node:readline";
import { parseStreamLine } from "./stream";
import type { RunEvent, RunRequest } from "./types";
import { buildPrompt } from "./prompt";

interface RunnerConfig {
  iclaudePath: string;
  allowedTools: string[];
  /** Модель claude (--model). Пусто = не передавать флаг. */
  model?: string;
  /** Test-only: extra args appended after the prompt (used to drive mock-iclaude.sh). */
  extraArgsForFixture?: string[];
}

const STDERR_BUFFER_BYTES = 64 * 1024;
const SIGTERM_GRACE_MS = 3000;

export class IclaudeRunner {
  private stdin: import("node:stream").Writable | null = null;

  constructor(private cfg: RunnerConfig) {}

  sendToolResult(toolUseId: string, answer: string): boolean {
    if (!this.stdin || this.stdin.destroyed) return false;
    const payload = JSON.stringify({
      type: "user",
      message: {
        role: "user",
        content: [{ type: "tool_result", tool_use_id: toolUseId, content: answer }],
      },
    });
    this.stdin.write(payload + "\n");
    return true;
  }

  async *run(req: RunRequest): AsyncGenerator<RunEvent, void, void> {
    if (this.stdin !== null) {
      throw new Error("IclaudeRunner: concurrent run() calls are not supported");
    }

    const prompt = buildPrompt({ operation: req.operation, args: req.args });
    const claudeArgs: string[] = [
      "--",
      "-p",
      prompt,
      "--output-format",
      "stream-json",
      "--verbose",
      "--allowed-tools",
      this.cfg.allowedTools.join(","),
    ];
    if (this.cfg.model) claudeArgs.push("--model", this.cfg.model);
    const args = this.cfg.extraArgsForFixture ? [...this.cfg.extraArgsForFixture] : claudeArgs;

    const child: ChildProcess = spawn(this.cfg.iclaudePath, args, {
      cwd: req.cwd,
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    if (!child.stdout || !child.stderr || !child.stdin) {
      throw new Error("spawn did not open expected stdio pipes");
    }
    this.stdin = child.stdin;

    const stderrBuf: Buffer[] = [];
    let stderrBytes = 0;
    child.stderr.on("data", (chunk: Buffer) => {
      stderrBytes += chunk.length;
      stderrBuf.push(chunk);
      while (stderrBytes > STDERR_BUFFER_BYTES && stderrBuf.length > 1) {
        const dropped = stderrBuf.shift()!;
        stderrBytes -= dropped.length;
      }
    });

    const onAbort = () => {
      if (child.exitCode !== null) return;
      child.kill("SIGTERM");
      setTimeout(() => {
        if (child.exitCode === null) child.kill("SIGKILL");
      }, SIGTERM_GRACE_MS);
    };
    if (req.signal.aborted) onAbort();
    else req.signal.addEventListener("abort", onAbort, { once: true });

    const timeoutHandle = setTimeout(() => {
      if (child.exitCode === null) {
        child.kill("SIGTERM");
        setTimeout(() => {
          if (child.exitCode === null) child.kill("SIGKILL");
        }, SIGTERM_GRACE_MS);
      }
    }, req.timeoutMs);

    const queue: RunEvent[] = [];
    let resolveNext: ((v: void) => void) | null = null;
    const wake = () => {
      if (resolveNext) {
        resolveNext();
        resolveNext = null;
      }
    };

    const rl = createInterface({ input: child.stdout });
    rl.on("line", (line) => {
      const ev = parseStreamLine(line);
      if (ev) queue.push(ev);
      wake();
    });

    let exited = false;
    let exitCode = 0;
    child.on("error", (err) => {
      queue.push({ kind: "error", message: `spawn error: ${err.message}` });
      exited = true;
      exitCode = -1;
      this.stdin = null;
      wake();
    });
    child.on("close", (code) => {
      if (stderrBuf.length > 0 && code !== 0) {
        const tail = Buffer.concat(stderrBuf).toString("utf-8").slice(-4096);
        queue.push({ kind: "error", message: `stderr: ${tail}` });
      }
      exited = true;
      exitCode = code ?? -1;
      this.stdin = null;
      wake();
    });

    try {
      while (true) {
        if (queue.length > 0) {
          yield queue.shift()!;
          continue;
        }
        if (exited) break;
        await new Promise<void>((r) => (resolveNext = r));
      }
      yield { kind: "exit", code: exitCode };
    } finally {
      clearTimeout(timeoutHandle);
      req.signal.removeEventListener("abort", onAbort);
      rl.close();
      this.stdin = null;
    }
  }
}
