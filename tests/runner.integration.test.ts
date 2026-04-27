import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { IclaudeRunner } from "../src/runner";
import type { RunEvent } from "../src/types";

const FIXTURE_DIR = resolve(__dirname, "fixtures");
const MOCK = resolve(FIXTURE_DIR, "mock-iclaude.sh");

async function collect(iter: AsyncIterable<RunEvent>): Promise<RunEvent[]> {
  const out: RunEvent[] = [];
  for await (const e of iter) out.push(e);
  return out;
}

describe("IclaudeRunner (integration)", () => {
  it("streams events from mock script and emits exit:0", async () => {
    const runner = new IclaudeRunner({
      iclaudePath: MOCK,
      allowedTools: ["Read", "Edit"],
      extraArgsForFixture: [resolve(FIXTURE_DIR, "stream-ingest.jsonl")],
    });
    const events = await collect(runner.run({
      operation: "ingest",
      args: ["vaults/Work/x.md"],
      cwd: process.cwd(),
      signal: new AbortController().signal,
      timeoutMs: 10_000,
    }));
    const kinds = events.map(e => e.kind);
    expect(kinds).toContain("system");
    expect(kinds).toContain("tool_use");
    expect(kinds).toContain("result");
    expect(kinds[kinds.length - 1]).toBe("exit");
    const exit = events[events.length - 1] as Extract<RunEvent, { kind: "exit" }>;
    expect(exit.code).toBe(0);
  });

  it("emits error event when script exits non-zero", async () => {
    const runner = new IclaudeRunner({
      iclaudePath: MOCK,
      allowedTools: [],
      extraArgsForFixture: [resolve(FIXTURE_DIR, "stream-error.jsonl"), "2"],
    });
    const events = await collect(runner.run({
      operation: "lint",
      args: [],
      cwd: process.cwd(),
      signal: new AbortController().signal,
      timeoutMs: 10_000,
    }));
    const exit = events[events.length - 1] as Extract<RunEvent, { kind: "exit" }>;
    expect(exit.code).toBe(2);
  });

  it("aborts running process on signal", async () => {
    const ctrl = new AbortController();
    const runner = new IclaudeRunner({
      iclaudePath: MOCK,
      allowedTools: [],
      extraArgsForFixture: [resolve(FIXTURE_DIR, "stream-ingest.jsonl"), "0", "0.5"],
    });
    const iter = runner.run({
      operation: "ingest",
      args: ["x"],
      cwd: process.cwd(),
      signal: ctrl.signal,
      timeoutMs: 10_000,
    });
    setTimeout(() => ctrl.abort(), 50);
    const events = await collect(iter);
    const exit = events[events.length - 1] as Extract<RunEvent, { kind: "exit" }>;
    expect(exit.code).not.toBe(0);
  });
});
