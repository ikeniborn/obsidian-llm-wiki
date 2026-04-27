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

  it("pauses on ask_user and resumes after sendToolResult", async () => {
    const PRE = resolve(FIXTURE_DIR, "stream-ask-user-pre.jsonl");
    const POST = resolve(FIXTURE_DIR, "stream-ask-user-post.jsonl");
    const MOCK_I = resolve(FIXTURE_DIR, "mock-iclaude-interactive.sh");

    const runner = new IclaudeRunner({
      iclaudePath: MOCK_I,
      allowedTools: [],
      extraArgsForFixture: [PRE, POST],
    });

    const events: RunEvent[] = [];
    for await (const ev of runner.run({
      operation: "ingest",
      args: ["x"],
      cwd: process.cwd(),
      signal: new AbortController().signal,
      timeoutMs: 10_000,
    })) {
      events.push(ev);
      if (ev.kind === "ask_user") {
        const ok = runner.sendToolResult(ev.toolUseId, "подтвердить");
        expect(ok).toBe(true);
      }
    }

    expect(events.some(e => e.kind === "ask_user")).toBe(true);
    expect(events.some(e => e.kind === "system" && (e as Extract<RunEvent, { kind: "system" }>).message === "got_answer")).toBe(true);
    const askEv = events.find(e => e.kind === "ask_user") as Extract<RunEvent, { kind: "ask_user" }>;
    expect(askEv.question).toBe("Подтвердить конфигурацию?");
    expect(askEv.options).toEqual(["подтвердить", "отменить"]);
    expect(askEv.toolUseId).toBe("aq1");
    expect(events.some(e => e.kind === "result")).toBe(true);
    const result = events.find(e => e.kind === "result") as Extract<RunEvent, { kind: "result" }>;
    expect(result.text).toBe("Домен настроен");
    const exit = events[events.length - 1] as Extract<RunEvent, { kind: "exit" }>;
    expect(exit.code).toBe(0);
  });
});
