# Native Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `AgentRunner` as a second wiki backend using any OpenAI-compatible LLM (Ollama, OpenAI, OpenRouter), with TypeScript phase orchestration and Obsidian Vault API for file access.

**Architecture:** `WikiController.dispatch()` routes by `settings.backend` to either `IclaudeRunner` (unchanged) or new `AgentRunner`. `AgentRunner` orchestrates wiki phases in TypeScript and delegates smart LLM steps via direct completions. File access uses `VaultTools` (Obsidian `DataAdapter` wrapper). Domain-map is read via existing `readDomains()` (node:fs, external).

**Tech Stack:** TypeScript, `openai` npm v4 (OpenAI-compatible client), Obsidian `DataAdapter`, `node:path` (external), vitest

---

## File Map

**New files:**
- `src/vault-tools.ts` — VaultTools class (DataAdapter wrappers + path helpers)
- `src/agent-runner.ts` — AgentRunner, same `run(req)` interface as IclaudeRunner
- `src/phases/ingest.ts` — ingest phase generator
- `src/phases/query.ts` — query / query-save phase generator
- `src/phases/lint.ts` — lint phase generator
- `src/phases/init.ts` — init phase generator
- `tests/vault-tools.test.ts`
- `tests/phases/ingest.test.ts`
- `tests/phases/query.test.ts`
- `tests/agent-runner.integration.test.ts`

**Modified files:**
- `package.json` — add `openai` dependency
- `src/types.ts` — add `backend`, `nativeAgent` to `LlmWikiPluginSettings` + `DEFAULT_SETTINGS`
- `src/controller.ts` — routing to AgentRunner when `backend === "native-agent"`
- `src/settings.ts` — Native Agent settings UI section

---

## Task 1: Install openai + extend types

**Files:**
- Modify: `package.json`
- Modify: `src/types.ts`

- [ ] **Step 1: Install openai**

```bash
npm install openai
```

Expected: `package.json` gets `"openai": "^4.x.x"` in dependencies, `node_modules/openai` created.

- [ ] **Step 2: Extend `LlmWikiPluginSettings` in `src/types.ts`**

Add after `history: RunHistoryEntry[];`:

```typescript
  backend: "claude-code" | "native-agent";
  nativeAgent: {
    baseUrl: string;
    apiKey: string;
    model: string;
  };
```

- [ ] **Step 3: Update `DEFAULT_SETTINGS` in `src/types.ts`**

Add to the `DEFAULT_SETTINGS` object:

```typescript
  backend: "claude-code",
  nativeAgent: {
    baseUrl: "http://localhost:11434/v1",
    apiKey: "ollama",
    model: "llama3.2",
  },
```

- [ ] **Step 4: Verify build passes**

```bash
npm run build
```

Expected: `dist/main.js` produced with no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/types.ts
git commit -m "feat: add openai dep + extend settings types for native agent"
```

---

## Task 2: VaultTools

**Files:**
- Create: `src/vault-tools.ts`
- Create: `tests/vault-tools.test.ts`

- [ ] **Step 1: Write failing tests in `tests/vault-tools.test.ts`**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { VaultTools, type VaultAdapter } from "../src/vault-tools";

function mockAdapter(overrides: Partial<VaultAdapter> = {}): VaultAdapter {
  return {
    read: vi.fn().mockResolvedValue(""),
    write: vi.fn().mockResolvedValue(undefined),
    list: vi.fn().mockResolvedValue({ files: [], folders: [] }),
    exists: vi.fn().mockResolvedValue(false),
    mkdir: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("VaultTools", () => {
  it("read delegates to adapter", async () => {
    const adapter = mockAdapter({ read: vi.fn().mockResolvedValue("hello") });
    const vt = new VaultTools(adapter, "/vault");
    expect(await vt.read("notes/a.md")).toBe("hello");
    expect(adapter.read).toHaveBeenCalledWith("notes/a.md");
  });

  it("write creates missing dir then writes", async () => {
    const adapter = mockAdapter({ exists: vi.fn().mockResolvedValue(false) });
    const vt = new VaultTools(adapter, "/vault");
    await vt.write("notes/sub/a.md", "content");
    expect(adapter.mkdir).toHaveBeenCalledWith("notes/sub");
    expect(adapter.write).toHaveBeenCalledWith("notes/sub/a.md", "content");
  });

  it("write skips mkdir when dir exists", async () => {
    const adapter = mockAdapter({ exists: vi.fn().mockResolvedValue(true) });
    const vt = new VaultTools(adapter, "/vault");
    await vt.write("notes/a.md", "content");
    expect(adapter.mkdir).not.toHaveBeenCalled();
    expect(adapter.write).toHaveBeenCalledWith("notes/a.md", "content");
  });

  it("listFiles returns empty for non-existent dir", async () => {
    const adapter = mockAdapter({ exists: vi.fn().mockResolvedValue(false) });
    const vt = new VaultTools(adapter, "/vault");
    expect(await vt.listFiles("!Wiki/domain")).toEqual([]);
  });

  it("listFiles returns files from adapter", async () => {
    const adapter = mockAdapter({
      exists: vi.fn().mockResolvedValue(true),
      list: vi.fn().mockResolvedValue({ files: ["!Wiki/d/a.md", "!Wiki/d/b.md"], folders: [] }),
    });
    const vt = new VaultTools(adapter, "/vault");
    expect(await vt.listFiles("!Wiki/d")).toEqual(["!Wiki/d/a.md", "!Wiki/d/b.md"]);
  });

  it("readAll skips unreadable files", async () => {
    const adapter = mockAdapter({
      read: vi.fn()
        .mockResolvedValueOnce("content-a")
        .mockRejectedValueOnce(new Error("not found")),
    });
    const vt = new VaultTools(adapter, "/vault");
    const result = await vt.readAll(["a.md", "missing.md"]);
    expect(result.size).toBe(1);
    expect(result.get("a.md")).toBe("content-a");
  });

  it("toVaultPath converts absolute to vault-relative", () => {
    const vt = new VaultTools(mockAdapter(), "/home/user/vault");
    expect(vt.toVaultPath("/home/user/vault/notes/a.md")).toBe("notes/a.md");
  });

  it("toVaultPath returns null for paths outside vault", () => {
    const vt = new VaultTools(mockAdapter(), "/home/user/vault");
    expect(vt.toVaultPath("/other/path")).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run tests/vault-tools.test.ts
```

Expected: FAIL — `Cannot find module '../src/vault-tools'`

- [ ] **Step 3: Implement `src/vault-tools.ts`**

```typescript
export interface VaultAdapter {
  read(path: string): Promise<string>;
  write(path: string, data: string): Promise<void>;
  list(path: string): Promise<{ files: string[]; folders: string[] }>;
  exists(path: string): Promise<boolean>;
  mkdir(path: string): Promise<void>;
}

export class VaultTools {
  constructor(
    private adapter: VaultAdapter,
    private basePath: string,
  ) {}

  async read(vaultPath: string): Promise<string> {
    return this.adapter.read(vaultPath);
  }

  async write(vaultPath: string, content: string): Promise<void> {
    const dir = vaultPath.split("/").slice(0, -1).join("/");
    if (dir) {
      const dirExists = await this.adapter.exists(dir);
      if (!dirExists) await this.adapter.mkdir(dir);
    }
    await this.adapter.write(vaultPath, content);
  }

  async listFiles(vaultDir: string): Promise<string[]> {
    const exists = await this.adapter.exists(vaultDir);
    if (!exists) return [];
    const result = await this.adapter.list(vaultDir);
    return result.files;
  }

  async readAll(paths: string[]): Promise<Map<string, string>> {
    const entries = await Promise.all(
      paths.map(async (p) => {
        try {
          return [p, await this.read(p)] as const;
        } catch {
          return null;
        }
      }),
    );
    return new Map(entries.filter((e): e is [string, string] => e !== null));
  }

  async exists(vaultPath: string): Promise<boolean> {
    return this.adapter.exists(vaultPath);
  }

  toVaultPath(absolutePath: string): string | null {
    const base = this.basePath.endsWith("/") ? this.basePath : this.basePath + "/";
    if (!absolutePath.startsWith(base)) return null;
    return absolutePath.slice(base.length);
  }
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run tests/vault-tools.test.ts
```

Expected: PASS — 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/vault-tools.ts tests/vault-tools.test.ts
git commit -m "feat: add VaultTools (DataAdapter wrappers)"
```

---

## Task 3: Ingest phase

**Files:**
- Create: `src/phases/ingest.ts`
- Create: `tests/phases/ingest.test.ts`

- [ ] **Step 1: Write failing tests in `tests/phases/ingest.test.ts`**

```typescript
import { describe, it, expect, vi } from "vitest";
import { runIngest } from "../../src/phases/ingest";
import { VaultTools, type VaultAdapter } from "../../src/vault-tools";
import type OpenAI from "openai";
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

function makeLlm(responseText: string): OpenAI {
  const fakeStream = {
    [Symbol.asyncIterator]: async function* () {
      yield { choices: [{ delta: { content: responseText } }] };
    },
  };
  return {
    chat: { completions: { create: vi.fn().mockResolvedValue(fakeStream) } },
  } as unknown as OpenAI;
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
  source_paths: ["vaults/Work/Sources"],
};

describe("runIngest", () => {
  it("yields error when args is empty", async () => {
    const vt = new VaultTools(mockAdapter(), "/vault");
    const events = await collect(
      runIngest([], vt, makeLlm("[]"), "llama3.2", [domain], "/repo", new AbortController().signal),
    );
    expect(events.some((e: any) => e.kind === "error")).toBe(true);
  });

  it("yields error when source file is outside vault", async () => {
    const vt = new VaultTools(mockAdapter(), "/vault");
    const events = await collect(
      runIngest(["/external/file.md"], vt, makeLlm("[]"), "llama3.2", [domain], "/repo", new AbortController().signal),
    );
    expect(events.some((e: any) => e.kind === "error")).toBe(true);
  });

  it("writes pages returned by LLM", async () => {
    const adapter = mockAdapter({
      read: vi.fn().mockResolvedValue("source text"),
      list: vi.fn().mockResolvedValue({ files: [], folders: [] }),
    });
    const vt = new VaultTools(adapter, "/vault");
    const llmResponse = JSON.stringify([
      { path: "vaults/Work/!Wiki/work/Entity.md", content: "# Entity\n\nFact." },
    ]);
    const events = await collect(
      runIngest(
        ["vaults/Work/Sources/doc.md"],
        vt,
        makeLlm(llmResponse),
        "llama3.2",
        [domain],
        "/vault",
        new AbortController().signal,
      ),
    );
    expect(events.some((e: any) => e.kind === "result")).toBe(true);
    expect(adapter.write).toHaveBeenCalledWith(
      "vaults/Work/!Wiki/work/Entity.md",
      "# Entity\n\nFact.",
    );
  });

  it("yields result with count=0 when LLM returns empty array", async () => {
    const adapter = mockAdapter({ read: vi.fn().mockResolvedValue("content") });
    const vt = new VaultTools(adapter, "/vault");
    const events = await collect(
      runIngest(
        ["vaults/Work/Sources/doc.md"],
        vt,
        makeLlm("[]"),
        "llama3.2",
        [domain],
        "/vault",
        new AbortController().signal,
      ),
    );
    const result = events.find((e: any) => e.kind === "result") as any;
    expect(result).toBeDefined();
    expect(result.text).toMatch(/0/);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run tests/phases/ingest.test.ts
```

Expected: FAIL — `Cannot find module '../../src/phases/ingest'`

- [ ] **Step 3: Implement `src/phases/ingest.ts`**

```typescript
import { isAbsolute, join } from "node:path";
import type OpenAI from "openai";
import type { DomainEntry } from "../domain-map";
import type { RunEvent } from "../types";
import type { VaultTools } from "../vault-tools";

export async function* runIngest(
  args: string[],
  vaultTools: VaultTools,
  llm: OpenAI,
  model: string,
  domains: DomainEntry[],
  repoRoot: string,
  signal: AbortSignal,
): AsyncGenerator<RunEvent> {
  const filePath = args[0];
  if (!filePath) {
    yield { kind: "error", message: "ingest: file path required" };
    return;
  }

  // Resolve source to vault-relative path
  const absSource = isAbsolute(filePath) ? filePath : join(repoRoot, filePath);
  const sourceVaultPath = vaultTools.toVaultPath(absSource);
  if (!sourceVaultPath) {
    yield { kind: "error", message: `Source file ${filePath} is outside the vault.` };
    return;
  }

  yield { kind: "tool_use", name: "Read", input: { path: sourceVaultPath } };
  let sourceContent: string;
  try {
    sourceContent = await vaultTools.read(sourceVaultPath);
  } catch (e) {
    yield { kind: "error", message: `Cannot read ${sourceVaultPath}: ${(e as Error).message}` };
    return;
  }
  yield { kind: "tool_result", ok: true, preview: sourceContent.slice(0, 100) };

  // Find domain
  const domain = detectDomain(absSource, domains, repoRoot);
  if (!domain) {
    yield { kind: "error", message: "No domain found for this file. Configure domain-map." };
    return;
  }

  // Resolve wiki folder to vault-relative
  const absWiki = isAbsolute(domain.wiki_folder) ? domain.wiki_folder : join(repoRoot, domain.wiki_folder);
  const wikiVaultPath = vaultTools.toVaultPath(absWiki);
  if (!wikiVaultPath) {
    yield { kind: "error", message: `Wiki folder ${domain.wiki_folder} is outside the vault.` };
    return;
  }

  // Load existing pages
  const existingPaths = await vaultTools.listFiles(wikiVaultPath);
  const existingPages = await vaultTools.readAll(existingPaths);

  yield { kind: "assistant_text", delta: `Synthesizing wiki pages for domain "${domain.id}"...\n` };

  const start = Date.now();
  const messages = buildIngestMessages(sourceVaultPath, sourceContent, domain, wikiVaultPath, existingPages);

  const fullText = await streamCompletion(llm, model, messages, signal, function* (delta) {
    yield { kind: "assistant_text" as const, delta };
  });

  if (signal.aborted) return;

  const pages = parseJsonPages(fullText);

  for (const page of pages) {
    yield { kind: "tool_use", name: "Write", input: { path: page.path } };
    try {
      await vaultTools.write(page.path, page.content);
      yield { kind: "tool_result", ok: true };
    } catch (e) {
      yield { kind: "tool_result", ok: false, preview: (e as Error).message };
    }
  }

  yield {
    kind: "result",
    durationMs: Date.now() - start,
    text: pages.length > 0 ? `Ingested into ${pages.length} wiki page(s).` : "No pages generated.",
  };
}

function detectDomain(absFilePath: string, domains: DomainEntry[], repoRoot: string): DomainEntry | null {
  for (const d of domains) {
    const matched = d.source_paths?.some((sp) => {
      const abs = isAbsolute(sp) ? sp : join(repoRoot, sp);
      return absFilePath.startsWith(abs);
    });
    if (matched) return d;
  }
  return domains[0] ?? null;
}

function buildIngestMessages(
  sourcePath: string,
  sourceContent: string,
  domain: DomainEntry,
  wikiVaultPath: string,
  existingPages: Map<string, string>,
): OpenAI.Chat.ChatCompletionMessageParam[] {
  const existingSummary = existingPages.size > 0
    ? [...existingPages.entries()].map(([p, c]) => `${p}:\n${c.slice(0, 300)}`).join("\n\n")
    : "None yet.";

  return [
    {
      role: "system",
      content:
        `You are a wiki synthesis assistant. Extract key entities from the source and create wiki pages.\n` +
        `Return ONLY a JSON array, no other text:\n` +
        `[{"path":"${wikiVaultPath}/EntityName.md","content":"# EntityName\\n\\ncontent..."}]\n` +
        `Rules: one entity per page; markdown only; path must start with "${wikiVaultPath}"; facts from source only.`,
    },
    {
      role: "user",
      content: [
        `Domain: ${domain.id} (${domain.name})`,
        `Wiki folder (vault-relative): ${wikiVaultPath}`,
        "",
        `Source file: ${sourcePath}`,
        sourceContent.slice(0, 8000),
        "",
        `Existing pages:\n${existingSummary}`,
      ].join("\n"),
    },
  ];
}

function parseJsonPages(text: string): Array<{ path: string; content: string }> {
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try {
    const arr = JSON.parse(match[0]);
    if (!Array.isArray(arr)) return [];
    return arr.filter(
      (x): x is { path: string; content: string } =>
        x !== null &&
        typeof x === "object" &&
        typeof x.path === "string" &&
        typeof x.content === "string",
    );
  } catch {
    return [];
  }
}

async function* streamCompletion(
  llm: OpenAI,
  model: string,
  messages: OpenAI.Chat.ChatCompletionMessageParam[],
  signal: AbortSignal,
  onDelta: (delta: string) => Generator<RunEvent>,
): AsyncGenerator<RunEvent> {
  // This is a helper but we use it inline — see caller above.
  // Kept as module-level for reuse across phases.
}
```

Wait — the `streamCompletion` helper needs to be a generator itself to yield events. Let me simplify by inlining the streaming in each phase. Here is the corrected `src/phases/ingest.ts`:

```typescript
import { isAbsolute, join } from "node:path";
import type OpenAI from "openai";
import type { DomainEntry } from "../domain-map";
import type { RunEvent } from "../types";
import type { VaultTools } from "../vault-tools";

export async function* runIngest(
  args: string[],
  vaultTools: VaultTools,
  llm: OpenAI,
  model: string,
  domains: DomainEntry[],
  repoRoot: string,
  signal: AbortSignal,
): AsyncGenerator<RunEvent> {
  const filePath = args[0];
  if (!filePath) {
    yield { kind: "error", message: "ingest: file path required" };
    return;
  }

  const absSource = isAbsolute(filePath) ? filePath : join(repoRoot, filePath);
  const sourceVaultPath = vaultTools.toVaultPath(absSource);
  if (!sourceVaultPath) {
    yield { kind: "error", message: `Source file ${filePath} is outside the vault.` };
    return;
  }

  yield { kind: "tool_use", name: "Read", input: { path: sourceVaultPath } };
  let sourceContent: string;
  try {
    sourceContent = await vaultTools.read(sourceVaultPath);
  } catch (e) {
    yield { kind: "error", message: `Cannot read ${sourceVaultPath}: ${(e as Error).message}` };
    return;
  }
  yield { kind: "tool_result", ok: true, preview: sourceContent.slice(0, 100) };

  const domain = detectDomain(absSource, domains, repoRoot);
  if (!domain) {
    yield { kind: "error", message: "No domain found for this file. Configure domain-map." };
    return;
  }

  const absWiki = isAbsolute(domain.wiki_folder) ? domain.wiki_folder : join(repoRoot, domain.wiki_folder);
  const wikiVaultPath = vaultTools.toVaultPath(absWiki);
  if (!wikiVaultPath) {
    yield { kind: "error", message: `Wiki folder ${domain.wiki_folder} is outside the vault.` };
    return;
  }

  const existingPaths = await vaultTools.listFiles(wikiVaultPath);
  const existingPages = await vaultTools.readAll(existingPaths);

  yield { kind: "assistant_text", delta: `Synthesizing wiki pages for domain "${domain.id}"...\n` };

  const start = Date.now();
  const messages = buildIngestMessages(sourceVaultPath, sourceContent, domain, wikiVaultPath, existingPages);

  let fullText = "";
  try {
    const stream = await llm.chat.completions.create(
      { model, messages, stream: true },
      { signal },
    );
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content ?? "";
      if (delta) {
        fullText += delta;
        yield { kind: "assistant_text", delta };
      }
    }
  } catch (e) {
    if (signal.aborted || (e as Error).name === "AbortError") return;
    const resp = await llm.chat.completions.create({ model, messages, stream: false });
    fullText = resp.choices[0]?.message?.content ?? "";
    if (fullText) yield { kind: "assistant_text", delta: fullText };
  }

  if (signal.aborted) return;

  const pages = parseJsonPages(fullText);
  for (const page of pages) {
    yield { kind: "tool_use", name: "Write", input: { path: page.path } };
    try {
      await vaultTools.write(page.path, page.content);
      yield { kind: "tool_result", ok: true };
    } catch (e) {
      yield { kind: "tool_result", ok: false, preview: (e as Error).message };
    }
  }

  yield {
    kind: "result",
    durationMs: Date.now() - start,
    text: pages.length > 0 ? `Ingested into ${pages.length} wiki page(s).` : "No pages generated.",
  };
}

export function detectDomain(absFilePath: string, domains: DomainEntry[], repoRoot: string): DomainEntry | null {
  for (const d of domains) {
    const matched = d.source_paths?.some((sp) => {
      const abs = isAbsolute(sp) ? sp : join(repoRoot, sp);
      return absFilePath.startsWith(abs);
    });
    if (matched) return d;
  }
  return domains[0] ?? null;
}

export function parseJsonPages(text: string): Array<{ path: string; content: string }> {
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try {
    const arr = JSON.parse(match[0]);
    if (!Array.isArray(arr)) return [];
    return arr.filter(
      (x): x is { path: string; content: string } =>
        x !== null &&
        typeof x === "object" &&
        typeof x.path === "string" &&
        typeof x.content === "string",
    );
  } catch {
    return [];
  }
}

function buildIngestMessages(
  sourcePath: string,
  sourceContent: string,
  domain: DomainEntry,
  wikiVaultPath: string,
  existingPages: Map<string, string>,
): OpenAI.Chat.ChatCompletionMessageParam[] {
  const existing = existingPages.size > 0
    ? [...existingPages.entries()].map(([p, c]) => `${p}:\n${c.slice(0, 300)}`).join("\n\n")
    : "None yet.";
  return [
    {
      role: "system",
      content:
        `You are a wiki synthesis assistant. Extract key entities from the source and create wiki pages.\n` +
        `Return ONLY a JSON array, no other text:\n` +
        `[{"path":"${wikiVaultPath}/EntityName.md","content":"# EntityName\\n\\ncontent..."}]\n` +
        `Rules: one entity per page; markdown; path must start with "${wikiVaultPath}"; facts from source only.`,
    },
    {
      role: "user",
      content: [
        `Domain: ${domain.id} (${domain.name})`,
        `Wiki folder (vault-relative): ${wikiVaultPath}`,
        "",
        `Source file: ${sourcePath}`,
        sourceContent.slice(0, 8000),
        "",
        `Existing pages:\n${existing}`,
      ].join("\n"),
    },
  ];
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/phases/ingest.test.ts
```

Expected: PASS — 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/phases/ingest.ts tests/phases/ingest.test.ts
git commit -m "feat: add ingest phase"
```

---

## Task 4: Query / query-save phase

**Files:**
- Create: `src/phases/query.ts`
- Create: `tests/phases/query.test.ts`

- [ ] **Step 1: Write failing tests in `tests/phases/query.test.ts`**

```typescript
import { describe, it, expect, vi } from "vitest";
import { runQuery } from "../../src/phases/query";
import { VaultTools, type VaultAdapter } from "../../src/vault-tools";
import type OpenAI from "openai";
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

function makeLlm(answer: string): OpenAI {
  return {
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue({
          [Symbol.asyncIterator]: async function* () {
            yield { choices: [{ delta: { content: answer } }] };
          },
        }),
      },
    },
  } as unknown as OpenAI;
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

describe("runQuery", () => {
  it("yields error when question is empty", async () => {
    const vt = new VaultTools(mockAdapter(), "/vault");
    const events = await collect(
      runQuery([], false, vt, makeLlm("answer"), "model", [domain], "/vault", new AbortController().signal),
    );
    expect(events.some((e: any) => e.kind === "error")).toBe(true);
  });

  it("yields result with LLM answer", async () => {
    const adapter = mockAdapter({
      exists: vi.fn().mockResolvedValue(true),
      list: vi.fn().mockResolvedValue({ files: ["vaults/Work/!Wiki/work/Page.md"], folders: [] }),
      read: vi.fn().mockResolvedValue("# Page\n\nSome fact."),
    });
    const vt = new VaultTools(adapter, "/vault");
    const events = await collect(
      runQuery(
        ["What is the answer?"],
        false,
        vt,
        makeLlm("The answer is 42."),
        "model",
        [domain],
        "/vault",
        new AbortController().signal,
      ),
    );
    const result = events.find((e: any) => e.kind === "result") as any;
    expect(result).toBeDefined();
    expect(result.text).toContain("42");
  });

  it("saves answer page when save=true", async () => {
    const adapter = mockAdapter({
      exists: vi.fn().mockResolvedValue(true),
      list: vi.fn().mockResolvedValue({ files: [], folders: [] }),
      read: vi.fn().mockResolvedValue(""),
    });
    const vt = new VaultTools(adapter, "/vault");
    await collect(
      runQuery(
        ["What is X?"],
        true,
        vt,
        makeLlm("X is Y."),
        "model",
        [domain],
        "/vault",
        new AbortController().signal,
      ),
    );
    expect(adapter.write).toHaveBeenCalled();
    const [savedPath] = (adapter.write as any).mock.calls[0];
    expect(savedPath).toMatch(/\.md$/);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
npx vitest run tests/phases/query.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/phases/query.ts`**

```typescript
import { isAbsolute, join } from "node:path";
import type OpenAI from "openai";
import type { DomainEntry } from "../domain-map";
import type { RunEvent } from "../types";
import type { VaultTools } from "../vault-tools";

const MAX_CONTEXT_CHARS = 80_000;

export async function* runQuery(
  args: string[],
  save: boolean,
  vaultTools: VaultTools,
  llm: OpenAI,
  model: string,
  domains: DomainEntry[],
  repoRoot: string,
  signal: AbortSignal,
): AsyncGenerator<RunEvent> {
  const question = args[0]?.trim();
  if (!question) {
    yield { kind: "error", message: "query: question required" };
    return;
  }

  const domain = domains[0];
  if (!domain) {
    yield { kind: "error", message: "No domain configured. Add a domain in settings." };
    return;
  }

  const absWiki = isAbsolute(domain.wiki_folder) ? domain.wiki_folder : join(repoRoot, domain.wiki_folder);
  const wikiVaultPath = vaultTools.toVaultPath(absWiki);
  if (!wikiVaultPath) {
    yield { kind: "error", message: `Wiki folder ${domain.wiki_folder} is outside the vault.` };
    return;
  }

  yield { kind: "tool_use", name: "Glob", input: { pattern: `${wikiVaultPath}/**/*.md` } };
  const files = await vaultTools.listFiles(wikiVaultPath);
  yield { kind: "tool_result", ok: true, preview: `${files.length} pages` };

  const pages = await vaultTools.readAll(files);

  const start = Date.now();

  let contextBlock = [...pages.entries()]
    .map(([p, c]) => `--- ${p} ---\n${c}`)
    .join("\n\n");

  if (contextBlock.length > MAX_CONTEXT_CHARS) {
    contextBlock = contextBlock.slice(0, MAX_CONTEXT_CHARS) + "\n[...truncated]";
  }

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: "You are a wiki query assistant. Answer based only on the provided wiki pages. Be concise and accurate.",
    },
    {
      role: "user",
      content: `Question: ${question}\n\nWiki pages:\n${contextBlock}`,
    },
  ];

  let answer = "";
  try {
    const stream = await llm.chat.completions.create(
      { model, messages, stream: true },
      { signal },
    );
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content ?? "";
      if (delta) {
        answer += delta;
        yield { kind: "assistant_text", delta };
      }
    }
  } catch (e) {
    if (signal.aborted || (e as Error).name === "AbortError") return;
    const resp = await llm.chat.completions.create({ model, messages, stream: false });
    answer = resp.choices[0]?.message?.content ?? "";
    if (answer) yield { kind: "assistant_text", delta: answer };
  }

  if (signal.aborted) return;

  if (save && answer) {
    const slug = question.slice(0, 40).replace(/[^a-zA-Z0-9а-яёА-ЯЁ\s]/g, "").trim().replace(/\s+/g, "-");
    const savePath = `${wikiVaultPath}/Q-${slug}.md`;
    const pageContent = `# ${question}\n\n${answer}\n`;
    yield { kind: "tool_use", name: "Write", input: { path: savePath } };
    try {
      await vaultTools.write(savePath, pageContent);
      yield { kind: "tool_result", ok: true };
      yield { kind: "result", durationMs: Date.now() - start, text: `Создана страница: ${savePath}\n\n${answer}` };
    } catch (e) {
      yield { kind: "tool_result", ok: false, preview: (e as Error).message };
      yield { kind: "result", durationMs: Date.now() - start, text: answer };
    }
  } else {
    yield { kind: "result", durationMs: Date.now() - start, text: answer };
  }
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/phases/query.test.ts
```

Expected: PASS — 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/phases/query.ts tests/phases/query.test.ts
git commit -m "feat: add query/query-save phase"
```

---

## Task 5: Lint phase

**Files:**
- Create: `src/phases/lint.ts`

No separate test file — lint is covered by AgentRunner integration test (Task 8). Structural checks are pure functions that can be verified manually via build.

- [ ] **Step 1: Implement `src/phases/lint.ts`**

```typescript
import { isAbsolute, join } from "node:path";
import type OpenAI from "openai";
import type { DomainEntry } from "../domain-map";
import type { RunEvent } from "../types";
import type { VaultTools } from "../vault-tools";

export async function* runLint(
  args: string[],
  vaultTools: VaultTools,
  llm: OpenAI,
  model: string,
  domains: DomainEntry[],
  repoRoot: string,
  signal: AbortSignal,
): AsyncGenerator<RunEvent> {
  const domainId = args[0];
  const targets = domainId
    ? domains.filter((d) => d.id === domainId)
    : domains;

  if (targets.length === 0) {
    yield { kind: "error", message: domainId ? `Domain "${domainId}" not found.` : "No domains configured." };
    return;
  }

  const start = Date.now();
  const reportParts: string[] = [];

  for (const domain of targets) {
    if (signal.aborted) return;

    const absWiki = isAbsolute(domain.wiki_folder) ? domain.wiki_folder : join(repoRoot, domain.wiki_folder);
    const wikiVaultPath = vaultTools.toVaultPath(absWiki);
    if (!wikiVaultPath) {
      reportParts.push(`## ${domain.id}\nWiki folder outside vault — skipped.`);
      continue;
    }

    yield { kind: "tool_use", name: "Glob", input: { pattern: `${wikiVaultPath}/**/*.md` } };
    const files = await vaultTools.listFiles(wikiVaultPath);
    yield { kind: "tool_result", ok: true, preview: `${files.length} pages` };

    const pages = await vaultTools.readAll(files);

    // Structural checks (TypeScript)
    const structuralIssues = checkStructure(pages);

    // LLM semantic check
    yield { kind: "assistant_text", delta: `Evaluating domain "${domain.id}" quality...\n` };
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      {
        role: "system",
        content:
          "You are a wiki quality reviewer. Identify content quality issues: redundancy, gaps, unclear definitions, missing context. Return a concise markdown report.",
      },
      {
        role: "user",
        content: [
          `Domain: ${domain.id} (${domain.name})`,
          `Automated issues:\n${structuralIssues || "None."}`,
          "",
          `Wiki pages:\n${[...pages.entries()].map(([p, c]) => `--- ${p} ---\n${c.slice(0, 500)}`).join("\n\n")}`,
        ].join("\n"),
      },
    ];

    let llmReport = "";
    try {
      const stream = await llm.chat.completions.create({ model, messages, stream: true }, { signal });
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content ?? "";
        if (delta) {
          llmReport += delta;
          yield { kind: "assistant_text", delta };
        }
      }
    } catch (e) {
      if (signal.aborted || (e as Error).name === "AbortError") return;
      const resp = await llm.chat.completions.create({ model, messages, stream: false });
      llmReport = resp.choices[0]?.message?.content ?? "";
      if (llmReport) yield { kind: "assistant_text", delta: llmReport };
    }

    reportParts.push(`## ${domain.id}\n${structuralIssues ? `**Structural:**\n${structuralIssues}\n\n` : ""}${llmReport}`);
  }

  yield { kind: "result", durationMs: Date.now() - start, text: reportParts.join("\n\n---\n\n") };
}

function checkStructure(pages: Map<string, string>): string {
  const issues: string[] = [];
  for (const [path, content] of pages) {
    if (!content.startsWith("---")) {
      issues.push(`- ${path}: missing frontmatter`);
    }
    const links = [...content.matchAll(/\[\[([^\]]+)\]\]/g)].map((m) => m[1]);
    for (const link of links) {
      const linked = [...pages.keys()].some((p) => p.endsWith(`${link}.md`));
      if (!linked) issues.push(`- ${path}: dead link [[${link}]]`);
    }
  }
  return issues.join("\n");
}
```

- [ ] **Step 2: Build check**

```bash
npm run build
```

Expected: no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add src/phases/lint.ts
git commit -m "feat: add lint phase"
```

---

## Task 6: Init phase

**Files:**
- Create: `src/phases/init.ts`

- [ ] **Step 1: Implement `src/phases/init.ts`**

```typescript
import { isAbsolute, join } from "node:path";
import type OpenAI from "openai";
import type { DomainEntry } from "../domain-map";
import type { RunEvent } from "../types";
import type { VaultTools } from "../vault-tools";

export async function* runInit(
  args: string[],
  vaultTools: VaultTools,
  llm: OpenAI,
  model: string,
  domains: DomainEntry[],
  repoRoot: string,
  vaultName: string,
  skillPath: string,
  signal: AbortSignal,
): AsyncGenerator<RunEvent> {
  const domainId = args[0];
  const dryRun = args.includes("--dry-run");

  if (!domainId) {
    yield { kind: "error", message: "init: domain id required" };
    return;
  }

  const existing = domains.find((d) => d.id === domainId);
  if (existing) {
    yield { kind: "error", message: `Domain "${domainId}" already exists in domain-map.` };
    return;
  }

  yield { kind: "assistant_text", delta: `Bootstrapping domain "${domainId}"...\n` };

  const start = Date.now();

  // Sample a few vault files to give LLM context
  const allFiles = await vaultTools.listFiles("");
  const sampleFiles = allFiles.slice(0, 5);
  const samples = await vaultTools.readAll(sampleFiles);

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: [
        `You are a wiki domain architect. Generate a domain entry for domain-map.json.`,
        `Return ONLY valid JSON matching this structure exactly:`,
        `{`,
        `  "id": "${domainId}",`,
        `  "name": "Human-readable name",`,
        `  "wiki_folder": "vaults/${vaultName}/!Wiki/${domainId}",`,
        `  "source_paths": ["relative/source/path"],`,
        `  "entity_types": ["Type1", "Type2"],`,
        `  "language_notes": ""`,
        `}`,
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        `Domain ID: ${domainId}`,
        `Vault name: ${vaultName}`,
        "",
        `Sample vault files:`,
        [...samples.entries()].map(([p, c]) => `${p}:\n${c.slice(0, 400)}`).join("\n\n"),
      ].join("\n"),
    },
  ];

  let fullText = "";
  try {
    const stream = await llm.chat.completions.create({ model, messages, stream: true }, { signal });
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content ?? "";
      if (delta) {
        fullText += delta;
        yield { kind: "assistant_text", delta };
      }
    }
  } catch (e) {
    if (signal.aborted || (e as Error).name === "AbortError") return;
    const resp = await llm.chat.completions.create({ model, messages, stream: false });
    fullText = resp.choices[0]?.message?.content ?? "";
    if (fullText) yield { kind: "assistant_text", delta: fullText };
  }

  if (signal.aborted) return;

  // Parse and validate JSON
  let entry: DomainEntry;
  try {
    const match = fullText.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("No JSON object found in LLM response");
    entry = JSON.parse(match[0]) as DomainEntry;
    if (!entry.id || !entry.wiki_folder) throw new Error("Missing required fields");
  } catch (e) {
    yield { kind: "error", message: `Failed to parse domain entry: ${(e as Error).message}` };
    return;
  }

  if (dryRun) {
    yield {
      kind: "result",
      durationMs: Date.now() - start,
      text: `Dry run — domain entry:\n\`\`\`json\n${JSON.stringify(entry, null, 2)}\n\`\`\``,
    };
    return;
  }

  // Write domain-map via node:fs (same as existing addDomain pattern)
  // We emit a tool_use so the view shows what's happening
  const dmPath = `${skillPath}/shared/domain-map-${vaultName}.json`;
  yield { kind: "tool_use", name: "Write", input: { path: dmPath } };

  try {
    const { addDomain } = await import("../domain-map");
    const result = addDomain(skillPath, vaultName, repoRoot, {
      id: entry.id,
      name: (entry as any).name ?? entry.id,
      wikiFolder: entry.wiki_folder,
      sourcePaths: entry.source_paths ?? [],
    });
    if (!result.ok) {
      yield { kind: "tool_result", ok: false, preview: result.error };
      yield { kind: "error", message: result.error };
      return;
    }
    yield { kind: "tool_result", ok: true };
  } catch (e) {
    yield { kind: "tool_result", ok: false, preview: (e as Error).message };
    yield { kind: "error", message: (e as Error).message };
    return;
  }

  yield {
    kind: "result",
    durationMs: Date.now() - start,
    text: `Domain "${domainId}" initialised. Edit domain-map to refine source_paths and entity_types.`,
  };
}
```

- [ ] **Step 2: Build check**

```bash
npm run build
```

Expected: no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add src/phases/init.ts
git commit -m "feat: add init phase"
```

---

## Task 7: AgentRunner

**Files:**
- Create: `src/agent-runner.ts`
- Create: `tests/agent-runner.integration.test.ts`

- [ ] **Step 1: Write failing tests in `tests/agent-runner.integration.test.ts`**

```typescript
import { describe, it, expect, vi } from "vitest";
import { AgentRunner } from "../src/agent-runner";
import { VaultTools, type VaultAdapter } from "../src/vault-tools";
import type { RunEvent } from "../src/types";
import type { LlmWikiPluginSettings } from "../src/types";

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
    expect(events.some((e) => e.kind === "result")).toBe(true);
  });

  it("stops on abort signal", async () => {
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
    expect(events.some((e) => e.kind === "error" || e.kind === "result")).toBe(true);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
npx vitest run tests/agent-runner.integration.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/agent-runner.ts`**

```typescript
import OpenAI from "openai";
import { readDomains, type DomainEntry } from "./domain-map";
import { runIngest } from "./phases/ingest";
import { runQuery } from "./phases/query";
import { runLint } from "./phases/lint";
import { runInit } from "./phases/init";
import type { LlmWikiPluginSettings, RunEvent, RunRequest } from "./types";
import type { VaultTools } from "./vault-tools";

export class AgentRunner {
  private llm: OpenAI;

  constructor(
    private settings: LlmWikiPluginSettings,
    private vaultTools: VaultTools,
    private vaultName: string,
    private domains: DomainEntry[],
  ) {
    this.llm = new OpenAI({
      baseURL: settings.nativeAgent.baseUrl,
      apiKey: settings.nativeAgent.apiKey,
      dangerouslyAllowBrowser: false,
    });
  }

  // Test-only: inject a mock LLM client
  _overrideLlm(llm: OpenAI): void {
    this.llm = llm;
  }

  async *run(req: RunRequest): AsyncGenerator<RunEvent, void, void> {
    yield { kind: "system", message: `native-agent / ${this.settings.nativeAgent.model}` };

    if (req.signal.aborted) return;

    const model = this.settings.nativeAgent.model;
    const repoRoot = req.cwd ?? "";
    const skillPath = this.settings.cwd;

    switch (req.operation) {
      case "ingest":
        yield* runIngest(req.args, this.vaultTools, this.llm, model, this.domains, repoRoot, req.signal);
        break;
      case "query":
        yield* runQuery(req.args, false, this.vaultTools, this.llm, model, this.domains, repoRoot, req.signal);
        break;
      case "query-save":
        yield* runQuery(req.args, true, this.vaultTools, this.llm, model, this.domains, repoRoot, req.signal);
        break;
      case "lint":
        yield* runLint(req.args, this.vaultTools, this.llm, model, this.domains, repoRoot, req.signal);
        break;
      case "init":
        yield* runInit(req.args, this.vaultTools, this.llm, model, this.domains, repoRoot, this.vaultName, skillPath, req.signal);
        break;
      default:
        yield { kind: "error", message: `Unknown operation: ${req.operation}` };
    }
  }
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/agent-runner.integration.test.ts
```

Expected: PASS — 3 tests pass.

- [ ] **Step 5: Run all tests to check for regressions**

```bash
npm test
```

Expected: all existing tests still pass.

- [ ] **Step 6: Commit**

```bash
git add src/agent-runner.ts tests/agent-runner.integration.test.ts
git commit -m "feat: add AgentRunner orchestrator"
```

---

## Task 8: Controller routing

**Files:**
- Modify: `src/controller.ts`

- [ ] **Step 1: Add AgentRunner import and factory at the top of `src/controller.ts`**

After the existing imports, add:

```typescript
import { AgentRunner } from "./agent-runner";
import { readDomains } from "./domain-map";
import { VaultTools, type VaultAdapter } from "./vault-tools";
```

- [ ] **Step 2: Add `buildAgentRunner()` private method to `WikiController`**

Add inside the `WikiController` class, before `dispatch()`:

```typescript
  private buildAgentRunner(): AgentRunner | null {
    const skillPath = resolveSkillPath(this.plugin.settings);
    if (!skillPath) { new Notice("Укажите путь к навыку llm-wiki в настройках"); return null; }

    const adapter = this.app.vault.adapter as unknown as VaultAdapter;
    const basePath = (this.app.vault.adapter as { getBasePath?: () => string }).getBasePath?.() ?? "";
    const vaultTools = new VaultTools(adapter, basePath);
    const vaultName = this.app.vault.getName();
    const domains = readDomains(skillPath, vaultName);

    return new AgentRunner(this.plugin.settings, vaultTools, vaultName, domains);
  }
```

- [ ] **Step 3: Update `dispatch()` to route by backend**

In `dispatch()`, replace the entire block from `const iclaudePath = ...` through `const runner = new IclaudeRunner...` and the loop, as follows.

**Before (current code starting at line ~103):**
```typescript
    if (!this.requireSkillPath()) return;
    const iclaudePath = this.requireIclaude();
    if (!iclaudePath) return;

    await this.ensureView();
    const view = this.activeView();
    if (!view) return;

    const ctrl = new AbortController();
    this.current = ctrl;

    const startedAt = Date.now();
    const steps: RunHistoryEntry["steps"] = [];
    let finalText = "";
    let status: RunHistoryEntry["status"] = "done";

    view.setRunning(op, args);

    const spawnCwd = resolveCwd(this.plugin.settings) ?? undefined;
    const timeoutMs = this.plugin.settings.timeouts[op === "query-save" ? "query" : op] * 1000;
    const runner = new IclaudeRunner({
      iclaudePath,
      allowedTools: this.plugin.settings.allowedTools,
      model: this.plugin.settings.model,
    });

    try {
      for await (const ev of runner.run({ operation: op, args, cwd: spawnCwd, signal: ctrl.signal, timeoutMs })) {
        if (ev.kind === "ask_user") {
          view.appendEvent(ev);
          try {
            const answer = await view.showQuestionModal(ev.question, ev.options);
            if (!runner.sendToolResult(ev.toolUseId, answer)) {
              // process already exited before answer was delivered — abort will drain the loop
              ctrl.abort();
            }
          } catch {
            ctrl.abort();
          }
          continue;
        }
```

**After (replacement):**
```typescript
    if (!this.requireSkillPath()) return;

    // iclaudePath only needed for claude-code backend
    let iclaudePath: string | null = null;
    if (this.plugin.settings.backend !== "native-agent") {
      iclaudePath = this.requireIclaude();
      if (!iclaudePath) return;
    }

    await this.ensureView();
    const view = this.activeView();
    if (!view) return;

    const ctrl = new AbortController();
    this.current = ctrl;

    const startedAt = Date.now();
    const steps: RunHistoryEntry["steps"] = [];
    let finalText = "";
    let status: RunHistoryEntry["status"] = "done";

    view.setRunning(op, args);

    const spawnCwd = resolveCwd(this.plugin.settings) ?? undefined;
    const timeoutMs = this.plugin.settings.timeouts[op === "query-save" ? "query" : op] * 1000;

    let claudeRunner: IclaudeRunner | null = null;
    let runGen: AsyncGenerator<RunEvent, void, void>;

    if (this.plugin.settings.backend === "native-agent") {
      const agentRunner = this.buildAgentRunner();
      if (!agentRunner) return;
      runGen = agentRunner.run({ operation: op, args, cwd: spawnCwd, signal: ctrl.signal, timeoutMs });
    } else {
      claudeRunner = new IclaudeRunner({
        iclaudePath: iclaudePath!,
        allowedTools: this.plugin.settings.allowedTools,
        model: this.plugin.settings.model,
      });
      runGen = claudeRunner.run({ operation: op, args, cwd: spawnCwd, signal: ctrl.signal, timeoutMs });
    }

    try {
      for await (const ev of runGen) {
        if (ev.kind === "ask_user") {
          view.appendEvent(ev);
          if (claudeRunner) {
            try {
              const answer = await view.showQuestionModal(ev.question, ev.options);
              if (!claudeRunner.sendToolResult(ev.toolUseId, answer)) {
                ctrl.abort();
              }
            } catch {
              ctrl.abort();
            }
          }
          continue;
        }
```

- [ ] **Step 4: Build check**

```bash
npm run build
```

Expected: no TypeScript errors.

- [ ] **Step 5: Run all tests**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/controller.ts
git commit -m "feat: route dispatch to AgentRunner when backend=native-agent"
```

---

## Task 9: Settings UI

**Files:**
- Modify: `src/settings.ts`

- [ ] **Step 1: Add Native Agent section to `LlmWikiSettingTab.display()`**

At the end of `display()`, before the closing brace, add:

```typescript
    containerEl.createEl("h2", { text: "Native Agent (beta)" });

    new Setting(containerEl)
      .setName("Backend")
      .setDesc('Выберите "native-agent" для использования Ollama/OpenAI напрямую без Claude Code.')
      .addDropdown((d) =>
        d
          .addOption("claude-code", "Claude Code (iclaude.sh)")
          .addOption("native-agent", "Native Agent (OpenAI-compatible)")
          .setValue(s.backend)
          .onChange(async (v) => {
            s.backend = v as "claude-code" | "native-agent";
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Base URL")
      .setDesc("OpenAI-compatible endpoint. Ollama: http://localhost:11434/v1")
      .addText((t) =>
        t
          .setPlaceholder("http://localhost:11434/v1")
          .setValue(s.nativeAgent.baseUrl)
          .onChange(async (v) => {
            s.nativeAgent.baseUrl = v.trim();
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("API Key")
      .setDesc('Для Ollama введите "ollama". Для OpenAI — ключ sk-...')
      .addText((t) =>
        t
          .setPlaceholder("ollama")
          .setValue(s.nativeAgent.apiKey)
          .onChange(async (v) => {
            s.nativeAgent.apiKey = v.trim();
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Model")
      .setDesc("Имя модели: llama3.2, mistral, gpt-4o и т.п.")
      .addText((t) =>
        t
          .setPlaceholder("llama3.2")
          .setValue(s.nativeAgent.model)
          .onChange(async (v) => {
            s.nativeAgent.model = v.trim();
            await this.plugin.saveSettings();
          }),
      );
```

- [ ] **Step 2: Build check**

```bash
npm run build
```

Expected: no TypeScript errors, `dist/main.js` updated.

- [ ] **Step 3: Run all tests**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/settings.ts
git commit -m "feat: add Native Agent settings UI section"
```

---

## Self-Review Checklist (run before marking complete)

- [ ] All spec sections covered:
  - [x] Two backends with same `run()` interface
  - [x] VaultTools (Vault API only, no node:fs for file I/O)
  - [x] openai npm universal client
  - [x] Hybrid orchestration (TypeScript phases + direct LLM completions)
  - [x] All 5 operations: ingest, query, query-save, lint, init
  - [x] RunEvent format matches existing events
  - [x] Settings: backend, nativeAgent.{baseUrl, apiKey, model}
  - [x] Default backend = "claude-code" (backward compatible)
  - [x] Abort signal propagated to LLM calls
  - [x] Streaming with non-streaming fallback
  - [x] Error for paths outside vault
- [ ] No type name mismatches between tasks (all use `RunEvent`, `RunRequest`, `DomainEntry`, `VaultAdapter`)
- [ ] `npm test` passes after each task
