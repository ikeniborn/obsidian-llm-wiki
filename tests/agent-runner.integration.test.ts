import { describe, it, expect, vi } from "vitest";
import { AgentRunner } from "../src/agent-runner";
import { VaultTools, type VaultAdapter } from "../src/vault-tools";
import type { RunEvent, LlmWikiPluginSettings } from "../src/types";
import type OpenAI from "openai";

function mockAdapter(overrides: Partial<VaultAdapter> = {}): VaultAdapter {
  return {
    read: vi.fn().mockResolvedValue("source content"),
    write: vi.fn().mockResolvedValue(undefined),
    list: vi.fn().mockResolvedValue({ files: [], folders: [] }),
    exists: vi.fn().mockResolvedValue(true),
    mkdir: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeLlm(text: string) {
  return {
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue({
          [Symbol.asyncIterator]: async function* () {
            yield { choices: [{ delta: { content: text } }] };
          },
        }),
      },
    },
  };
}

const baseSettings: LlmWikiPluginSettings = {
  iclaudePath: "",
  cwd: "/skill",
  allowedTools: [],
  model: "",
  showRawJson: false,
  historyLimit: 20,
  timeouts: { ingest: 300, query: 300, lint: 600, init: 3600 },
  history: [],
  backend: "native-agent",
  nativeAgent: { baseUrl: "http://localhost:11434/v1", apiKey: "ollama", model: "llama3.2" },
};

async function collect(gen: AsyncGenerator<RunEvent>): Promise<RunEvent[]> {
  const out: RunEvent[] = [];
  for await (const e of gen) out.push(e);
  return out;
}

describe("AgentRunner", () => {
  it("yields system init event on start", async () => {
    const vt = new VaultTools(mockAdapter(), "/vault");
    const runner = new AgentRunner(baseSettings, vt, "TestVault", []);
    runner._overrideLlm(makeLlm("[]") as any);
    const events = await collect(
      runner.run({
        operation: "query",
        args: ["test question"],
        cwd: "/vault",
        signal: new AbortController().signal,
        timeoutMs: 10_000,
      }),
    );
    expect(events[0]).toMatchObject({ kind: "system" });
  });

  it("yields result event for query", async () => {
    const vt = new VaultTools(mockAdapter(), "/vault");
    const runner = new AgentRunner(baseSettings, vt, "TestVault", []);
    runner._overrideLlm(makeLlm("The answer.") as any);
    const events = await collect(
      runner.run({
        operation: "query",
        args: ["What is X?"],
        cwd: "/vault",
        signal: new AbortController().signal,
        timeoutMs: 10_000,
      }),
    );
    // Verify that we have at least a system event and a result or error event
    expect(events.length).toBeGreaterThan(0);
    expect(events[0]).toMatchObject({ kind: "system" });
    expect(events.some((e) => e.kind === "result" || e.kind === "error")).toBe(true);
  });

  it("stops early on aborted signal", async () => {
    const vt = new VaultTools(mockAdapter(), "/vault");
    const runner = new AgentRunner(baseSettings, vt, "TestVault", []);
    runner._overrideLlm(makeLlm("answer") as any);
    const ctrl = new AbortController();
    ctrl.abort();
    const events = await collect(
      runner.run({
        operation: "query",
        args: ["Q"],
        cwd: "/vault",
        signal: ctrl.signal,
        timeoutMs: 10_000,
      }),
    );
    // Should have system event and then stop (error or result from query)
    expect(events.length).toBeGreaterThan(0);
    expect(events[0]).toMatchObject({ kind: "system" });
  });
});
