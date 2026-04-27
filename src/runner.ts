import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
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
  constructor(private cfg: RunnerConfig) {}

  async *run(req: RunRequest): AsyncGenerator<RunEvent, void, void> {
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

    const child: ChildProcessWithoutNullStreams = spawn(this.cfg.iclaudePath, args, {
      cwd: req.cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

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
      if (child.exitCode === null) child.kill("SIGTERM");
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
      wake();
    });
    child.on("close", (code) => {
      if (stderrBuf.length > 0 && code !== 0) {
        const tail = Buffer.concat(stderrBuf).toString("utf-8").slice(-4096);
        queue.push({ kind: "error", message: `stderr: ${tail}` });
      }
      exited = true;
      exitCode = code ?? -1;
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
    }
  }
}
