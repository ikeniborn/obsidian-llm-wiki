import { describe, it, expect, vi } from "vitest";
import { runFix } from "../../src/phases/fix";
import { VaultTools, type VaultAdapter } from "../../src/vault-tools";
import type { LlmClient } from "../../src/types";
import type { DomainEntry } from "../../src/domain-map";

function mockAdapter(overrides: Partial<VaultAdapter> = {}): VaultAdapter {
  return {
    read: vi.fn().mockResolvedValue(""),
    write: vi.fn().mockResolvedValue(undefined),
    list: vi.fn().mockResolvedValue({ files: [], folders: [] }),
    exists: vi.fn().mockResolvedValue(true),
    mkdir: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeLlm(response: string): LlmClient {
  const stream = {
    [Symbol.asyncIterator]: async function* () {
      yield { choices: [{ delta: { content: response } }] };
    },
  };
  return {
    chat: { completions: { create: vi.fn().mockResolvedValue(stream) } },
  } as unknown as LlmClient;
}

async function collect<T>(gen: AsyncGenerator<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const e of gen) out.push(e);
  return out;
}

const domain: DomainEntry = {
  id: "work",
  name: "Work",
  wiki_folder: "vaults/Work/!Wiki/work",
  source_paths: [],
};

describe("runFix", () => {
  it("yields error when domain not found", async () => {
    const vt = new VaultTools(mockAdapter(), "/vault");
    const events = await collect(
      runFix(["unknown"], vt, makeLlm("[]"), "model", [domain], "/vault", new AbortController().signal),
    );
    expect(events.some((e: any) => e.kind === "error")).toBe(true);
  });

  it("yields result with 0 fixes when no pages exist", async () => {
    const vt = new VaultTools(mockAdapter(), "/vault");
    const events = await collect(
      runFix(["work"], vt, makeLlm("[]"), "model", [domain], "/vault", new AbortController().signal),
    );
    const result = events.find((e: any) => e.kind === "result") as any;
    expect(result).toBeDefined();
    expect(result.text).toMatch(/No wiki pages/);
  });

  it("writes fixed pages returned by LLM", async () => {
    const adapter = mockAdapter({
      list: vi.fn().mockResolvedValue({ files: ["vaults/Work/!Wiki/work/Page.md"], folders: [] }),
      read: vi.fn().mockResolvedValue("# Page\n\nContent with [[DeadLink]]."),
    });
    const vt = new VaultTools(adapter, "/vault");
    const fixed = JSON.stringify([
      { path: "vaults/Work/!Wiki/work/Page.md", content: "# Page\n\nContent without dead link." },
    ]);
    const events = await collect(
      runFix(["work"], vt, makeLlm(fixed), "model", [domain], "/vault", new AbortController().signal),
    );
    expect(adapter.write).toHaveBeenCalledWith(
      "vaults/Work/!Wiki/work/Page.md",
      "# Page\n\nContent without dead link.",
    );
    const result = events.find((e: any) => e.kind === "result") as any;
    expect(result.text).toMatch(/Fixed 1/);
  });
});
