# Claude-Agent Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Заменить backend `claude-code` (IclaudeRunner + skillPath) на `claude-agent`, который использует процесс `claude`/`iclaude.sh` как LLM через `AgentRunner` фазы без привязки к навыкам.

**Architecture:** Добавляется `ClaudeCliClient` — адаптер к `claude` subprocess с интерфейсом OpenAI-клиента. `AgentRunner` принимает `LlmClient` (новый type alias) вместо создания `OpenAI` внутри. `IclaudeRunner`, `runner.ts`, `prompt.ts` удаляются.

**Tech Stack:** TypeScript, Obsidian Plugin API, `openai` npm (client + types), `node:child_process`, vitest

---

## File Map

| Файл | Действие |
|---|---|
| `src/types.ts` | Добавить `LlmClient`; `claudeAgent` settings; убрать `iclaudePath`/`cwd`/`allowedTools`/`model`/`showRawJson` |
| `src/claude-cli-client.ts` | Создать — spawn claude, парсинг stream-json, OpenAI chunk format |
| `src/agent-runner.ts` | Принимать `llm: LlmClient` + `domainMapDir: string` в конструктор; `buildOpts()` backend-aware |
| `src/phases/ingest.ts` | `llm: OpenAI` → `llm: LlmClient` |
| `src/phases/query.ts` | `llm: OpenAI` → `llm: LlmClient` |
| `src/phases/lint.ts` | `llm: OpenAI` → `llm: LlmClient` |
| `src/phases/init.ts` | `llm: OpenAI` → `llm: LlmClient`; `skillPath` → `domainMapDir` |
| `src/controller.ts` | Заменить IclaudeRunner-ветку; упростить helpers |
| `src/settings.ts` | Убрать секцию claude-code; добавить секцию claude-agent |
| `src/main.ts` | Обновить `loadSettings`: убрать старые поля, добавить миграцию |
| `tests/claude-cli-client.test.ts` | Создать — spawn mock, streaming, abort |
| `tests/agent-runner.integration.test.ts` | Обновить конструктор и settings |
| `tests/phases/init.test.ts` | Обновить: `skillPath` → `domainMapDir` |
| `tests/phases/ingest.test.ts` | Тип `makeLlm` |
| `tests/phases/query.test.ts` | Тип `makeLlm` |
| `tests/phases/lint.test.ts` | Тип `makeLlm` |
| `src/runner.ts` | Удалить |
| `src/prompt.ts` | Удалить |
| `tests/runner.integration.test.ts` | Удалить |
| `tests/prompt.test.ts` | Удалить |

---

## Task 1: Обновить `types.ts` — `LlmClient` и новые settings

**Files:**
- Modify: `src/types.ts`

- [ ] **Шаг 1: Заменить содержимое `src/types.ts`**

```typescript
import type OpenAI from "openai";

export type WikiOperation =
  | "ingest"
  | "query"
  | "query-save"
  | "lint"
  | "init";

export type WikiDomain = string;

export interface RunRequest {
  operation: WikiOperation;
  args: string[];
  cwd: string | undefined;
  signal: AbortSignal;
  timeoutMs: number;
  domainId?: string;
}

export type RunEvent =
  | { kind: "system"; message: string }
  | { kind: "tool_use"; name: string; input: unknown }
  | { kind: "tool_result"; ok: boolean; preview?: string }
  | { kind: "assistant_text"; delta: string; isReasoning?: boolean }
  | { kind: "result"; durationMs: number; usdCost?: number; text: string }
  | { kind: "error"; message: string }
  | { kind: "exit"; code: number }
  | { kind: "ask_user"; question: string; options: string[]; toolUseId: string };

export interface RunHistoryEntry {
  id: string;
  operation: WikiOperation;
  args: string[];
  startedAt: number;
  finishedAt: number;
  status: "done" | "error" | "cancelled";
  finalText: string;
  steps: Array<{ kind: "tool_use" | "tool_result"; label: string }>;
}

export interface LlmCallOptions {
  temperature?: number;
  maxTokens?: number;
  topP?: number | null;
  systemPrompt?: string;
  numCtx?: number | null;
}

/** Минимальный интерфейс OpenAI-клиента, используемый фазами. */
export type LlmClient = {
  chat: {
    completions: {
      create(
        params: OpenAI.Chat.ChatCompletionCreateParamsStreaming,
        opts?: { signal?: AbortSignal },
      ): Promise<AsyncIterable<OpenAI.Chat.ChatCompletionChunk>>;
      create(
        params: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming,
        opts?: { signal?: AbortSignal },
      ): Promise<OpenAI.Chat.ChatCompletion>;
    };
  };
};

export interface LlmWikiPluginSettings {
  backend: "claude-agent" | "native-agent";
  agentLogPath: string;
  historyLimit: number;
  timeouts: {
    ingest: number;
    query: number;
    lint: number;
    init: number;
  };
  history: RunHistoryEntry[];
  claudeAgent: {
    iclaudePath: string;
    model: string;
    domainMapDir: string;
    systemPrompt: string;
    maxTokens: number;
    requestTimeoutSec: number;
  };
  nativeAgent: {
    baseUrl: string;
    apiKey: string;
    model: string;
    temperature: number;
    maxTokens: number;
    requestTimeoutSec: number;
    topP: number | null;
    systemPrompt: string;
    numCtx: number | null;
    domainMapDir: string;
  };
}

export const DEFAULT_SETTINGS: LlmWikiPluginSettings = {
  backend: "claude-agent",
  agentLogPath: "",
  historyLimit: 20,
  timeouts: { ingest: 300, query: 300, lint: 600, init: 3600 },
  history: [],
  claudeAgent: {
    iclaudePath: "",
    model: "",
    domainMapDir: "",
    systemPrompt: "",
    maxTokens: 4096,
    requestTimeoutSec: 300,
  },
  nativeAgent: {
    baseUrl: "http://localhost:11434/v1",
    apiKey: "ollama",
    model: "llama3.2",
    temperature: 0.2,
    maxTokens: 4096,
    requestTimeoutSec: 300,
    topP: null,
    systemPrompt: "You are a wiki assistant for a technical knowledge base. Be precise, factual, and concise. Use only the provided sources.",
    numCtx: null,
    domainMapDir: "",
  },
};
```

- [ ] **Шаг 2: Проверить, что TypeScript видит новый тип**

```bash
npx tsc --noEmit 2>&1 | head -40
```

Ожидаем ошибки в файлах, которые ещё используют старые поля — это нормально на данном этапе.

- [ ] **Шаг 3: Коммит**

```bash
git add src/types.ts
git commit -m "feat: update settings types — LlmClient, claudeAgent, drop claude-code fields"
```

---

## Task 2: Создать `ClaudeCliClient`

**Files:**
- Create: `src/claude-cli-client.ts`
- Create: `tests/claude-cli-client.test.ts`

- [ ] **Шаг 1: Написать тест (TDD — сначала упадёт)**

Создать `tests/claude-cli-client.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";

vi.mock("node:child_process", () => ({ spawn: vi.fn() }));
vi.mock("node:readline", async (importOriginal) => {
  const orig = await importOriginal<typeof import("node:readline")>();
  return orig;
});

import { spawn } from "node:child_process";
import { ClaudeCliClient } from "../src/claude-cli-client";

function makeMockProcess(lines: string[]) {
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const proc = Object.assign(new EventEmitter(), {
    stdout,
    stderr,
    stdin: null,
    exitCode: null as number | null,
    kill: vi.fn(),
  });
  process.nextTick(() => {
    for (const line of lines) stdout.write(line + "\n");
    stdout.end();
    (proc as any).exitCode = 0;
    proc.emit("close", 0);
  });
  return proc;
}

const cfg = { iclaudePath: "/usr/bin/claude", model: "sonnet", maxTokens: 1024, requestTimeoutSec: 30 };

describe("ClaudeCliClient", () => {
  beforeEach(() => vi.clearAllMocks());

  it("yields text chunks from assistant_text stream-json lines", async () => {
    const lines = [
      JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "hello" }] } }),
      JSON.stringify({ type: "result", duration_ms: 100, total_cost_usd: 0, result: "hello", is_error: false }),
    ];
    (spawn as any).mockReturnValue(makeMockProcess(lines));

    const client = new ClaudeCliClient(cfg);
    const stream = await client.chat.completions.create(
      { model: "sonnet", messages: [{ role: "user", content: "hi" }], stream: true } as any,
      { signal: new AbortController().signal },
    );

    const chunks: string[] = [];
    for await (const chunk of stream) {
      const c = (chunk as any).choices[0]?.delta?.content;
      if (c) chunks.push(c);
    }
    expect(chunks).toContain("hello");
  });

  it("non-streaming returns ChatCompletion with accumulated text", async () => {
    const lines = [
      JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "world" }] } }),
      JSON.stringify({ type: "result", duration_ms: 100, total_cost_usd: 0, result: "world", is_error: false }),
    ];
    (spawn as any).mockReturnValue(makeMockProcess(lines));

    const client = new ClaudeCliClient(cfg);
    const resp = await client.chat.completions.create(
      { model: "sonnet", messages: [{ role: "user", content: "hi" }], stream: false } as any,
    );
    expect((resp as any).choices[0].message.content).toBe("world");
  });

  it("passes --system flag when system message present", async () => {
    (spawn as any).mockReturnValue(makeMockProcess([]));

    const client = new ClaudeCliClient(cfg);
    await client.chat.completions.create(
      {
        model: "sonnet",
        messages: [
          { role: "system", content: "be helpful" },
          { role: "user", content: "hello" },
        ],
        stream: false,
      } as any,
    );

    const args: string[] = (spawn as any).mock.calls[0][1];
    expect(args).toContain("--system");
    const sysIdx = args.indexOf("--system");
    expect(args[sysIdx + 1]).toContain("be helpful");
  });

  it("aborts subprocess on signal", async () => {
    const proc = makeMockProcess([]);
    (spawn as any).mockReturnValue(proc);
    const ctrl = new AbortController();
    ctrl.abort();

    const client = new ClaudeCliClient(cfg);
    await client.chat.completions.create(
      { model: "sonnet", messages: [{ role: "user", content: "hi" }], stream: false } as any,
      { signal: ctrl.signal },
    );
    expect(proc.kill).toHaveBeenCalledWith("SIGTERM");
  });
});
```

- [ ] **Шаг 2: Запустить тест — убедиться, что падает с "Cannot find module"**

```bash
npx vitest run tests/claude-cli-client.test.ts 2>&1 | tail -20
```

Ожидаем: `Cannot find module '../src/claude-cli-client'`

- [ ] **Шаг 3: Создать `src/claude-cli-client.ts`**

```typescript
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import type OpenAI from "openai";
import { parseStreamLine } from "./stream";
import type { LlmClient } from "./types";

export interface ClaudeCliConfig {
  iclaudePath: string;
  model: string;
  maxTokens: number;
  requestTimeoutSec: number;
}

const SIGTERM_GRACE_MS = 3000;

export class ClaudeCliClient implements LlmClient {
  constructor(private cfg: ClaudeCliConfig) {}

  readonly chat = {
    completions: {
      create: (
        params:
          | OpenAI.Chat.ChatCompletionCreateParamsStreaming
          | OpenAI.Chat.ChatCompletionCreateParamsNonStreaming,
        opts?: { signal?: AbortSignal },
      ) => this._create(params, opts),
    },
  };

  private _create(
    params:
      | OpenAI.Chat.ChatCompletionCreateParamsStreaming
      | OpenAI.Chat.ChatCompletionCreateParamsNonStreaming,
    opts?: { signal?: AbortSignal },
  ): Promise<AsyncIterable<OpenAI.Chat.ChatCompletionChunk> | OpenAI.Chat.ChatCompletion> {
    const messages = params.messages as OpenAI.Chat.ChatCompletionMessageParam[];
    const systemContent = messages
      .filter((m) => m.role === "system")
      .map((m) => (typeof m.content === "string" ? m.content : ""))
      .join("\n\n");
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    const userText = typeof lastUser?.content === "string" ? lastUser.content : "";

    const { iclaudePath, model, maxTokens, requestTimeoutSec } = this.cfg;
    const args: string[] = ["-p", userText, "--output-format", "stream-json", "--verbose"];
    if (model) args.push("--model", model);
    if (maxTokens) args.push("--max-tokens", String(maxTokens));
    if (systemContent) args.push("--system", systemContent);

    if ((params as { stream?: boolean }).stream) {
      return Promise.resolve(this._makeIterable(args, opts?.signal, requestTimeoutSec));
    }
    return this._collect(args, requestTimeoutSec);
  }

  private _makeIterable(
    args: string[],
    signal: AbortSignal | undefined,
    timeoutSec: number,
  ): AsyncIterable<OpenAI.Chat.ChatCompletionChunk> {
    return { [Symbol.asyncIterator]: () => this._generate(args, signal, timeoutSec) };
  }

  private async *_generate(
    args: string[],
    signal: AbortSignal | undefined,
    timeoutSec: number,
  ): AsyncGenerator<OpenAI.Chat.ChatCompletionChunk> {
    const child = spawn(this.cfg.iclaudePath, args, { stdio: ["ignore", "pipe", "pipe"] });
    if (!child.stdout || !child.stderr) throw new Error("spawn: missing stdio");
    child.stderr.resume();

    const onAbort = () => {
      child.kill("SIGTERM");
      setTimeout(() => { if (child.exitCode === null) child.kill("SIGKILL"); }, SIGTERM_GRACE_MS);
    };
    if (signal?.aborted) { onAbort(); return; }
    signal?.addEventListener("abort", onAbort, { once: true });

    const timeoutHandle = setTimeout(() => {
      child.kill("SIGTERM");
      setTimeout(() => { if (child.exitCode === null) child.kill("SIGKILL"); }, SIGTERM_GRACE_MS);
    }, timeoutSec * 1000);

    const queue: OpenAI.Chat.ChatCompletionChunk[] = [];
    let resolveNext: ((v: void) => void) | null = null;
    const wake = () => { if (resolveNext) { resolveNext(); resolveNext = null; } };

    let id = 0;
    const rl = createInterface({ input: child.stdout });
    rl.on("line", (line) => {
      const ev = parseStreamLine(line);
      if (ev?.kind === "assistant_text") {
        const delta: Record<string, unknown> = ev.isReasoning
          ? { reasoning: ev.delta }
          : { content: ev.delta };
        queue.push({
          id: `cc-${++id}`,
          object: "chat.completion.chunk",
          model: "",
          created: 0,
          choices: [{ index: 0, delta: delta as OpenAI.Chat.ChatCompletionChunk.Choice.Delta, finish_reason: null }],
        });
        wake();
      }
    });

    let exited = false;
    child.on("close", () => { exited = true; wake(); });
    child.on("error", () => { exited = true; wake(); });

    try {
      while (true) {
        if (queue.length > 0) { yield queue.shift()!; continue; }
        if (exited) break;
        await new Promise<void>((r) => (resolveNext = r));
      }
      yield {
        id: `cc-${++id}`,
        object: "chat.completion.chunk",
        model: "",
        created: 0,
        choices: [{ index: 0, delta: {} as OpenAI.Chat.ChatCompletionChunk.Choice.Delta, finish_reason: "stop" }],
      };
    } finally {
      clearTimeout(timeoutHandle);
      signal?.removeEventListener("abort", onAbort);
      rl.close();
    }
  }

  private async _collect(
    args: string[],
    timeoutSec: number,
  ): Promise<OpenAI.Chat.ChatCompletion> {
    let text = "";
    for await (const chunk of this._generate(args, undefined, timeoutSec)) {
      text += (chunk.choices[0]?.delta as { content?: string })?.content ?? "";
    }
    return {
      id: "cc-0",
      object: "chat.completion",
      model: "",
      created: 0,
      choices: [{ index: 0, message: { role: "assistant", content: text }, finish_reason: "stop", logprobs: null }],
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    };
  }
}
```

- [ ] **Шаг 4: Запустить тесты — все должны пройти**

```bash
npx vitest run tests/claude-cli-client.test.ts 2>&1 | tail -30
```

Ожидаем: `4 passed`

- [ ] **Шаг 5: Коммит**

```bash
git add src/claude-cli-client.ts tests/claude-cli-client.test.ts
git commit -m "feat: add ClaudeCliClient — spawn claude subprocess as LLM adapter"
```

---

## Task 3: Обновить `AgentRunner`

**Files:**
- Modify: `src/agent-runner.ts`

- [ ] **Шаг 1: Заменить содержимое `src/agent-runner.ts`**

```typescript
import OpenAI from "openai";
import type { DomainEntry } from "./domain-map";
import { runIngest } from "./phases/ingest";
import { runQuery } from "./phases/query";
import { runLint } from "./phases/lint";
import { runInit } from "./phases/init";
import type { LlmCallOptions, LlmClient, LlmWikiPluginSettings, RunEvent, RunRequest } from "./types";
import type { VaultTools } from "./vault-tools";

export class AgentRunner {
  constructor(
    private llm: LlmClient,
    private settings: LlmWikiPluginSettings,
    private vaultTools: VaultTools,
    private vaultName: string,
    private domains: DomainEntry[],
    private domainMapDir: string = "",
  ) {}

  private buildOpts(): LlmCallOptions {
    if (this.settings.backend === "claude-agent") {
      const ca = this.settings.claudeAgent;
      return {
        maxTokens: ca.maxTokens,
        systemPrompt: ca.systemPrompt || undefined,
      };
    }
    const na = this.settings.nativeAgent;
    return {
      temperature: na.temperature,
      maxTokens: na.maxTokens,
      topP: na.topP,
      systemPrompt: na.systemPrompt || undefined,
      numCtx: na.numCtx,
    };
  }

  async *run(req: RunRequest): AsyncGenerator<RunEvent, void, void> {
    const modelLabel =
      this.settings.backend === "claude-agent"
        ? this.settings.claudeAgent.model || "claude"
        : this.settings.nativeAgent.model;
    yield { kind: "system", message: `${this.settings.backend} / ${modelLabel}` };

    if (req.signal.aborted) return;

    const model =
      this.settings.backend === "claude-agent"
        ? this.settings.claudeAgent.model
        : this.settings.nativeAgent.model;
    const repoRoot = req.cwd ?? "";
    const opts = this.buildOpts();

    const domains = req.domainId
      ? this.domains.filter((d) => d.id === req.domainId)
      : this.domains;

    switch (req.operation) {
      case "ingest":
        yield* runIngest(req.args, this.vaultTools, this.llm, model, domains, repoRoot, req.signal, opts);
        break;
      case "query":
        yield* runQuery(req.args, false, this.vaultTools, this.llm, model, domains, repoRoot, req.signal, opts);
        break;
      case "query-save":
        yield* runQuery(req.args, true, this.vaultTools, this.llm, model, domains, repoRoot, req.signal, opts);
        break;
      case "lint":
        yield* runLint(req.args, this.vaultTools, this.llm, model, domains, repoRoot, req.signal, opts);
        break;
      case "init":
        yield* runInit(req.args, this.vaultTools, this.llm, model, domains, repoRoot, this.vaultName, this.domainMapDir, req.signal, opts);
        break;
      default: {
        const start = Date.now();
        yield { kind: "error", message: `Unknown operation: ${req.operation}` };
        yield { kind: "result", durationMs: Date.now() - start, text: "" };
      }
    }
  }
}
```

- [ ] **Шаг 2: Обновить тест `tests/agent-runner.integration.test.ts`**

```typescript
import { describe, it, expect, vi } from "vitest";
import { AgentRunner } from "../src/agent-runner";
import { VaultTools, type VaultAdapter } from "../src/vault-tools";
import type { RunEvent, LlmWikiPluginSettings, LlmClient } from "../src/types";
import { DEFAULT_SETTINGS } from "../src/types";

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

function makeLlm(text: string): LlmClient {
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
  } as unknown as LlmClient;
}

const baseSettings: LlmWikiPluginSettings = {
  ...DEFAULT_SETTINGS,
  backend: "native-agent",
};

async function collect(gen: AsyncGenerator<RunEvent>): Promise<RunEvent[]> {
  const out: RunEvent[] = [];
  for await (const e of gen) out.push(e);
  return out;
}

describe("AgentRunner", () => {
  it("yields system init event on start", async () => {
    const vt = new VaultTools(mockAdapter(), "/vault");
    const runner = new AgentRunner(makeLlm("[]"), baseSettings, vt, "TestVault", []);
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
    const runner = new AgentRunner(makeLlm("The answer."), baseSettings, vt, "TestVault", []);
    const events = await collect(
      runner.run({
        operation: "query",
        args: ["What is X?"],
        cwd: "/vault",
        signal: new AbortController().signal,
        timeoutMs: 10_000,
      }),
    );
    expect(events.length).toBeGreaterThan(0);
    expect(events[0]).toMatchObject({ kind: "system" });
    expect(events.some((e) => e.kind === "result" || e.kind === "error")).toBe(true);
  });

  it("stops early on aborted signal", async () => {
    const vt = new VaultTools(mockAdapter(), "/vault");
    const runner = new AgentRunner(makeLlm("answer"), baseSettings, vt, "TestVault", []);
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
    expect(events.length).toBeGreaterThan(0);
    expect(events[0]).toMatchObject({ kind: "system" });
  });
});
```

- [ ] **Шаг 3: Запустить тесты AgentRunner**

```bash
npx vitest run tests/agent-runner.integration.test.ts 2>&1 | tail -20
```

Ожидаем: `3 passed`

- [ ] **Шаг 4: Коммит**

```bash
git add src/agent-runner.ts tests/agent-runner.integration.test.ts
git commit -m "refactor: AgentRunner accepts LlmClient + domainMapDir; backend-aware buildOpts"
```

---

## Task 4: Обновить фазы — `llm: OpenAI` → `llm: LlmClient`

**Files:**
- Modify: `src/phases/ingest.ts`, `src/phases/query.ts`, `src/phases/lint.ts`, `src/phases/init.ts`

- [ ] **Шаг 1: `src/phases/ingest.ts` — добавить `LlmClient`, изменить тип `llm`**

После строки `import type OpenAI from "openai";` добавить:
```typescript
import type { LlmClient } from "../types";
```

В сигнатуре `runIngest` (строка 9) заменить:
```typescript
  llm: OpenAI,
```
на:
```typescript
  llm: LlmClient,
```

Импорт `OpenAI` ОСТАВИТЬ — он используется для типов сообщений (`OpenAI.Chat.ChatCompletionMessageParam[]`).

- [ ] **Шаг 2: `src/phases/query.ts` — добавить `LlmClient`, изменить тип `llm`**

После строки `import type OpenAI from "openai";` добавить:
```typescript
import type { LlmClient } from "../types";
```

В сигнатуре `runQuery` (строка 15) заменить:
```typescript
  llm: OpenAI,
```
на:
```typescript
  llm: LlmClient,
```

Импорт `OpenAI` ОСТАВИТЬ.

- [ ] **Шаг 3: `src/phases/lint.ts` — добавить `LlmClient`, изменить тип `llm`**

После строки `import type OpenAI from "openai";` добавить:
```typescript
import type { LlmClient } from "../types";
```

В сигнатуре `runLint` (строка 12) заменить:
```typescript
  llm: OpenAI,
```
на:
```typescript
  llm: LlmClient,
```

Импорт `OpenAI` ОСТАВИТЬ.

- [ ] **Шаг 4: `src/phases/init.ts` — заменить тип и параметр `skillPath` → `domainMapDir`**

После строки `import type OpenAI from "openai";` добавить `import type { LlmClient }`. Импорт `OpenAI` ОСТАВИТЬ. Изменить сигнатуру:

```typescript
import type OpenAI from "openai";
import type { LlmClient } from "../types";
// ...
export async function* runInit(
  args: string[],
  vaultTools: VaultTools,
  llm: LlmClient,
  model: string,
  domains: DomainEntry[],
  repoRoot: string,
  vaultName: string,
  domainMapDir: string,     // было: skillPath
  signal: AbortSignal,
  opts: LlmCallOptions = {},
): AsyncGenerator<RunEvent> {
```

Строки 122–127 в `runInit` (запись domain-map) — заменить:

Было:
```typescript
  const dmPath = `${skillPath}/shared/domain-map-${vaultName}.json`;
  yield { kind: "tool_use", name: "Write", input: { path: dmPath } };

  try {
    const { addDomain } = await import("../domain-map");
    const result = addDomain(skillPath, vaultName, repoRoot, {
```

Заменить на:
```typescript
  const { domainMapPath, addDomain } = await import("../domain-map");
  const dmPath = domainMapPath(domainMapDir, vaultName);
  yield { kind: "tool_use", name: "Write", input: { path: dmPath } };

  try {
    const result = addDomain(domainMapDir, vaultName, repoRoot, {
```

- [ ] **Шаг 5: Обновить тесты фаз — заменить тип `makeLlm`**

В `tests/phases/ingest.test.ts`, `tests/phases/query.test.ts`, `tests/phases/lint.test.ts`:

Было:
```typescript
import type OpenAI from "openai";
// ...
function makeLlm(json: string): OpenAI {
  return { ... } as unknown as OpenAI;
}
```

Заменить на:
```typescript
import type { LlmClient } from "../../src/types";
// ...
function makeLlm(json: string): LlmClient {
  return { ... } as unknown as LlmClient;
}
```

- [ ] **Шаг 6: Обновить `tests/phases/init.test.ts`**

Поменять `makeLlm` тип + параметр `"/skill"` → `"/domainMapDir"` во всех вызовах `runInit`:

Было:
```typescript
import type OpenAI from "openai";
// ...
function makeLlm(json: string): OpenAI {
  return { ... } as unknown as OpenAI;
}
// ...
runInit([], vt, makeLlm("{}"), "model", [], "/vault", "TestVault", "/skill", ...)
```

Заменить на:
```typescript
import type { LlmClient } from "../../src/types";
// ...
function makeLlm(json: string): LlmClient {
  return { ... } as unknown as LlmClient;
}
// ...
runInit([], vt, makeLlm("{}"), "model", [], "/vault", "TestVault", "/domainMapDir", ...)
```

Применить к трём вызовам `runInit` в тестах.

- [ ] **Шаг 7: Запустить все тесты фаз**

```bash
npx vitest run tests/phases/ 2>&1 | tail -20
```

Ожидаем: все passed (4 файла × несколько тестов).

- [ ] **Шаг 8: Коммит**

```bash
git add src/phases/ tests/phases/
git commit -m "refactor: phases accept LlmClient; init uses domainMapDir instead of skillPath"
```

---

## Task 5: Обновить `controller.ts`

**Files:**
- Modify: `src/controller.ts`

- [ ] **Шаг 1: Заменить содержимое `src/controller.ts`**

```typescript
import { App, Notice, TFile } from "obsidian";
import { existsSync, appendFileSync, statSync } from "node:fs";
import { relative, isAbsolute, join } from "node:path";
import { LLM_WIKI_VIEW_TYPE, LlmWikiView } from "./view";
import { readDomains, addDomain, type DomainEntry, type AddDomainInput } from "./domain-map";
import type LlmWikiPlugin from "./main";
import type { RunEvent, RunHistoryEntry, WikiOperation } from "./types";
import { AgentRunner } from "./agent-runner";
import { VaultTools, type VaultAdapter } from "./vault-tools";
import { ClaudeCliClient } from "./claude-cli-client";
import OpenAI from "openai";

export class WikiController {
  private current: AbortController | null = null;
  constructor(private app: App, private plugin: LlmWikiPlugin) {}

  isBusy(): boolean { return this.current !== null; }

  cancelCurrent(): void {
    if (this.current) {
      this.current.abort();
      new Notice("Отмена…");
    }
  }

  async ingestActive(domainId?: string): Promise<void> {
    const file = this.app.workspace.getActiveFile();
    if (!file) { new Notice("Нет активного файла"); return; }
    const abs = (this.app.vault.adapter as { getFullPath: (p: string) => string }).getFullPath(file.path);
    await this.dispatch("ingest", [abs], domainId);
  }

  async query(question: string, save: boolean, domainId?: string): Promise<void> {
    if (!question.trim()) return;
    const op: WikiOperation = save ? "query-save" : "query";
    await this.dispatch(op, [question.trim()], domainId);
  }

  async lint(domain: string | "all"): Promise<void> {
    const args = domain === "all" ? [] : [domain];
    await this.dispatch("lint", args);
  }

  async init(domain: string, dryRun: boolean): Promise<void> {
    const args = dryRun ? [domain, "--dry-run"] : [domain];
    await this.dispatch("init", args);
  }

  private resolveDomainMapDir(): string {
    const s = this.plugin.settings;
    const dir = s.backend === "claude-agent"
      ? s.claudeAgent.domainMapDir
      : s.nativeAgent.domainMapDir;
    if (dir) return dir;
    const base = (this.app.vault.adapter as { getBasePath?: () => string }).getBasePath?.() ?? "";
    return join(base, ".obsidian", "plugins", "llm-wiki");
  }

  loadDomains(): DomainEntry[] {
    return readDomains(this.resolveDomainMapDir(), this.app.vault.getName());
  }

  registerDomain(input: AddDomainInput): { ok: true } | { ok: false; error: string } {
    const vaultBase = (this.app.vault.adapter as { getBasePath?: () => string }).getBasePath?.() ?? "";
    const r = addDomain(this.resolveDomainMapDir(), this.app.vault.getName(), vaultBase, input);
    if (r.ok) new Notice(`Домен «${input.id}» добавлен`);
    else new Notice(`Не удалось добавить домен: ${r.error}`);
    return r;
  }

  private requireClaudeAgent(): string | null {
    const p = this.plugin.settings.claudeAgent.iclaudePath;
    if (!p || !existsSync(p)) {
      new Notice("Укажите путь к Claude Code в настройках");
      return null;
    }
    return p;
  }

  private buildAgentRunner(): AgentRunner | null {
    const adapter = this.app.vault.adapter as unknown as VaultAdapter;
    const base = (this.app.vault.adapter as { getBasePath?: () => string }).getBasePath?.() ?? "";
    const vaultTools = new VaultTools(adapter, base);
    const vaultName = this.app.vault.getName();
    const domainMapDir = this.resolveDomainMapDir();
    const domains = readDomains(domainMapDir, vaultName);
    const s = this.plugin.settings;

    const llm = s.backend === "claude-agent"
      ? new ClaudeCliClient(s.claudeAgent)
      : new OpenAI({
          baseURL: s.nativeAgent.baseUrl,
          apiKey: s.nativeAgent.apiKey,
          timeout: s.nativeAgent.requestTimeoutSec * 1000,
          dangerouslyAllowBrowser: true,
        });

    return new AgentRunner(llm, s, vaultTools, vaultName, domains, domainMapDir);
  }

  private logEvent(sessionId: string, op: WikiOperation, domainId: string | undefined, ev: RunEvent): void {
    let logPath = this.plugin.settings.agentLogPath;
    if (!logPath) return;
    try {
      const stat = existsSync(logPath) ? statSync(logPath) : null;
      if (stat?.isDirectory() || (!logPath.includes(".") && !logPath.endsWith("/"))) {
        logPath = join(logPath, "agent.jsonl");
      }
      const line = JSON.stringify({ ts: new Date().toISOString(), session: sessionId, op, domainId, event: ev }) + "\n";
      appendFileSync(logPath, line, "utf-8");
    } catch { /* не блокируем операцию */ }
  }

  private async dispatch(op: WikiOperation, args: string[], domainId?: string): Promise<void> {
    if (this.isBusy()) {
      new Notice("Уже выполняется операция, отмените её сначала");
      return;
    }

    if (this.plugin.settings.backend === "claude-agent" && !this.requireClaudeAgent()) return;

    await this.ensureView();
    const view = this.activeView();
    if (!view) return;

    const agentRunner = this.buildAgentRunner();
    if (!agentRunner) return;

    const ctrl = new AbortController();
    this.current = ctrl;

    const startedAt = Date.now();
    const sessionId = String(startedAt);
    const steps: RunHistoryEntry["steps"] = [];
    let finalText = "";
    let status: RunHistoryEntry["status"] = "done";

    this.logEvent(sessionId, op, domainId, { kind: "system", message: `start op=${op} args=${JSON.stringify(args)} domainId=${domainId ?? ""}` });
    view.setRunning(op, args);

    const vaultBasePath = (this.app.vault.adapter as { getBasePath?: () => string }).getBasePath?.() ?? "";
    const vaultName = this.app.vault.getName();
    const vaultSuffix = `/vaults/${vaultName}`;
    const repoRoot = vaultBasePath.endsWith(vaultSuffix)
      ? vaultBasePath.slice(0, vaultBasePath.length - vaultSuffix.length)
      : vaultBasePath;

    const timeoutMs = this.plugin.settings.timeouts[op === "query-save" ? "query" : op] * 1000;
    const runGen = agentRunner.run({ operation: op, args, cwd: repoRoot, signal: ctrl.signal, timeoutMs, domainId });

    try {
      for await (const ev of runGen) {
        this.logEvent(sessionId, op, domainId, ev);
        view.appendEvent(ev);
        this.collectStep(ev, steps);
        if (ev.kind === "result") finalText = ev.text;
        if (ev.kind === "error") status = "error";
        if (ev.kind === "exit") {
          if (ev.code !== 0 && status === "done") status = "error";
          if (ctrl.signal.aborted) status = "cancelled";
        }
      }
    } catch (err) {
      status = "error";
      finalText = `Ошибка: ${(err as Error).message}`;
      this.logEvent(sessionId, op, domainId, { kind: "error", message: finalText });
    } finally {
      this.current = null;
    }
    this.logEvent(sessionId, op, domainId, { kind: "system", message: `finish status=${status} durationMs=${Date.now() - startedAt}` });

    const entry: RunHistoryEntry = {
      id: `${startedAt}`,
      operation: op,
      args,
      startedAt,
      finishedAt: Date.now(),
      status,
      finalText,
      steps,
    };
    this.plugin.settings.history.push(entry);
    while (this.plugin.settings.history.length > this.plugin.settings.historyLimit) {
      this.plugin.settings.history.shift();
    }
    await this.plugin.saveSettings();
    await view.finish(entry);

    if (op === "query-save" && status === "done") {
      const m = finalText.match(/Создана\s+страница:\s*([^\s`'"]+)/i);
      if (m) {
        const pathInVault = await this.toVaultPath(vaultBasePath, m[1]);
        if (pathInVault) await this.app.workspace.openLinkText(pathInVault, "");
      }
    }
  }

  private collectStep(ev: RunEvent, steps: RunHistoryEntry["steps"]): void {
    if (ev.kind === "tool_use") {
      const inp = (ev.input as { file_path?: string; pattern?: string }) ?? {};
      steps.push({ kind: "tool_use", label: `${ev.name} ${inp.file_path ?? inp.pattern ?? ""}`.trim() });
    } else if (ev.kind === "tool_result") {
      steps.push({ kind: "tool_result", label: ev.ok ? "ok" : "error" });
    }
  }

  private async ensureView(): Promise<void> {
    const leaves = this.app.workspace.getLeavesOfType(LLM_WIKI_VIEW_TYPE);
    if (leaves.length === 0) {
      const right = this.app.workspace.getRightLeaf(false);
      if (right) await right.setViewState({ type: LLM_WIKI_VIEW_TYPE, active: true });
    } else {
      this.app.workspace.revealLeaf(leaves[0]);
    }
  }

  private activeView(): LlmWikiView | null {
    const leaves = this.app.workspace.getLeavesOfType(LLM_WIKI_VIEW_TYPE);
    const view = leaves[0]?.view;
    return view instanceof LlmWikiView ? view : null;
  }

  private async toVaultPath(vaultDir: string, savedPath: string): Promise<string | null> {
    const abs = isAbsolute(savedPath) ? savedPath : join(vaultDir, savedPath);
    const rel = relative(vaultDir, abs);
    if (rel.startsWith("..") || isAbsolute(rel)) return null;
    const file = this.app.vault.getAbstractFileByPath(rel);
    return file instanceof TFile ? rel : rel;
  }
}
```

- [ ] **Шаг 2: Запустить все тесты**

```bash
npx vitest run 2>&1 | tail -20
```

Ожидаем: все имеющиеся тесты проходят (ошибки только в runner/prompt тестах, которые удалим в Task 7).

- [ ] **Шаг 3: Коммит**

```bash
git add src/controller.ts
git commit -m "refactor: controller uses ClaudeCliClient for claude-agent backend; remove IclaudeRunner refs"
```

---

## Task 6: Обновить `settings.ts` UI

**Files:**
- Modify: `src/settings.ts`

- [ ] **Шаг 1: Заменить содержимое `src/settings.ts`**

```typescript
import { App, PluginSettingTab, Setting } from "obsidian";
import type LlmWikiPlugin from "./main";
import type { LlmWikiPluginSettings } from "./types";

export class LlmWikiSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: LlmWikiPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    const s = this.plugin.settings;

    containerEl.createEl("h2", { text: "LLM Wiki" });

    new Setting(containerEl)
      .setName("Backend")
      .setDesc("Выберите бэкенд для выполнения операций.")
      .addDropdown((d) =>
        d
          .addOption("claude-agent", "Claude Agent (claude / iclaude.sh)")
          .addOption("native-agent", "Native Agent (OpenAI-compatible)")
          .setValue(s.backend)
          .onChange(async (v) => {
            s.backend = v as LlmWikiPluginSettings["backend"];
            await this.plugin.saveSettings();
            this.display();
          }),
      );

    if (s.backend === "claude-agent") {
      new Setting(containerEl)
        .setName("Путь к Claude Code")
        .setDesc("Обязательно. Полный абсолютный путь к iclaude.sh / iclaude / claude.")
        .addText((t) =>
          t
            .setPlaceholder("/home/user/Documents/Project/iclaude/iclaude.sh")
            .setValue(s.claudeAgent.iclaudePath)
            .onChange(async (v) => {
              s.claudeAgent.iclaudePath = v.trim();
              await this.plugin.saveSettings();
            }),
        );

      new Setting(containerEl)
        .setName("Модель")
        .setDesc("Имя модели: sonnet, opus, claude-sonnet-4-6 и т.п. Пусто — дефолт claude.")
        .addText((t) =>
          t
            .setPlaceholder("sonnet")
            .setValue(s.claudeAgent.model)
            .onChange(async (v) => {
              s.claudeAgent.model = v.trim();
              await this.plugin.saveSettings();
            }),
        );

      new Setting(containerEl)
        .setName("Max tokens")
        .setDesc("Максимум токенов в ответе. Рекомендуется ≥ 4096.")
        .addText((t) =>
          t
            .setPlaceholder("4096")
            .setValue(String(s.claudeAgent.maxTokens))
            .onChange(async (v) => {
              const n = Number(v);
              if (Number.isFinite(n) && n > 0) {
                s.claudeAgent.maxTokens = Math.floor(n);
                await this.plugin.saveSettings();
              }
            }),
        );

      new Setting(containerEl)
        .setName("System prompt")
        .setDesc("Добавляется к системному контенту каждой операции.")
        .addTextArea((t) => {
          t.inputEl.style.minHeight = "96px";
          t.inputEl.style.width = "100%";
          t
            .setValue(s.claudeAgent.systemPrompt)
            .onChange(async (v) => {
              s.claudeAgent.systemPrompt = v;
              await this.plugin.saveSettings();
            });
          return t;
        });

      new Setting(containerEl)
        .setName("Request timeout (сек)")
        .setDesc("Таймаут subprocess. Рекомендуется 300+.")
        .addText((t) =>
          t
            .setPlaceholder("300")
            .setValue(String(s.claudeAgent.requestTimeoutSec))
            .onChange(async (v) => {
              const n = Number(v);
              if (Number.isFinite(n) && n > 0) {
                s.claudeAgent.requestTimeoutSec = Math.floor(n);
                await this.plugin.saveSettings();
              }
            }),
        );

      new Setting(containerEl)
        .setName("Папка domain-map")
        .setDesc("Где хранить domain-map-<vault>.json. Пусто — авто: <vault>/.obsidian/plugins/llm-wiki/")
        .addText((t) =>
          t
            .setPlaceholder("(авто)")
            .setValue(s.claudeAgent.domainMapDir)
            .onChange(async (v) => {
              s.claudeAgent.domainMapDir = v.trim();
              await this.plugin.saveSettings();
            }),
        );
    } else {
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
        .setName("Модель")
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

      new Setting(containerEl)
        .setName("Temperature")
        .setDesc("0.0–1.0.")
        .addText((t) =>
          t
            .setPlaceholder("0.2")
            .setValue(String(s.nativeAgent.temperature))
            .onChange(async (v) => {
              const n = Number(v);
              if (Number.isFinite(n) && n >= 0 && n <= 2) {
                s.nativeAgent.temperature = n;
                await this.plugin.saveSettings();
              }
            }),
        );

      new Setting(containerEl)
        .setName("Max tokens")
        .setDesc("Максимум токенов в ответе.")
        .addText((t) =>
          t
            .setPlaceholder("4096")
            .setValue(String(s.nativeAgent.maxTokens))
            .onChange(async (v) => {
              const n = Number(v);
              if (Number.isFinite(n) && n > 0) {
                s.nativeAgent.maxTokens = Math.floor(n);
                await this.plugin.saveSettings();
              }
            }),
        );

      new Setting(containerEl)
        .setName("Top-p")
        .setDesc("0.0–1.0, или пусто — отключить.")
        .addText((t) =>
          t
            .setPlaceholder("(отключено)")
            .setValue(s.nativeAgent.topP != null ? String(s.nativeAgent.topP) : "")
            .onChange(async (v) => {
              const trimmed = v.trim();
              if (!trimmed) {
                s.nativeAgent.topP = null;
              } else {
                const n = Number(trimmed);
                if (Number.isFinite(n) && n >= 0 && n <= 1) s.nativeAgent.topP = n;
              }
              await this.plugin.saveSettings();
            }),
        );

      new Setting(containerEl)
        .setName("Request timeout (сек)")
        .setDesc("Таймаут HTTP-запроса к LLM.")
        .addText((t) =>
          t
            .setPlaceholder("300")
            .setValue(String(s.nativeAgent.requestTimeoutSec))
            .onChange(async (v) => {
              const n = Number(v);
              if (Number.isFinite(n) && n > 0) {
                s.nativeAgent.requestTimeoutSec = Math.floor(n);
                await this.plugin.saveSettings();
              }
            }),
        );

      new Setting(containerEl)
        .setName("num_ctx (Ollama)")
        .setDesc("Размер контекста. Пусто — дефолт модели.")
        .addText((t) =>
          t
            .setPlaceholder("(дефолт модели)")
            .setValue(s.nativeAgent.numCtx != null ? String(s.nativeAgent.numCtx) : "")
            .onChange(async (v) => {
              const trimmed = v.trim();
              if (!trimmed) {
                s.nativeAgent.numCtx = null;
              } else {
                const n = Number(trimmed);
                if (Number.isFinite(n) && n > 0) s.nativeAgent.numCtx = Math.floor(n);
              }
              await this.plugin.saveSettings();
            }),
        );

      new Setting(containerEl)
        .setName("System prompt")
        .setDesc("Добавляется к системному контенту каждой операции.")
        .addTextArea((t) => {
          t.inputEl.style.minHeight = "96px";
          t.inputEl.style.width = "100%";
          t
            .setValue(s.nativeAgent.systemPrompt)
            .onChange(async (v) => {
              s.nativeAgent.systemPrompt = v;
              await this.plugin.saveSettings();
            });
          return t;
        });

      new Setting(containerEl)
        .setName("Папка domain-map")
        .setDesc("Где хранить domain-map-<vault>.json. Пусто — авто: <vault>/.obsidian/plugins/llm-wiki/")
        .addText((t) =>
          t
            .setPlaceholder("(авто)")
            .setValue(s.nativeAgent.domainMapDir)
            .onChange(async (v) => {
              s.nativeAgent.domainMapDir = v.trim();
              await this.plugin.saveSettings();
            }),
        );
    }

    new Setting(containerEl)
      .setName("Таймауты (секунды)")
      .setDesc("ingest / query / lint / init")
      .addText((t) =>
        t.setValue(`${s.timeouts.ingest}/${s.timeouts.query}/${s.timeouts.lint}/${s.timeouts.init}`)
          .onChange(async (v) => {
            const parts = v.split("/").map((x) => Number(x.trim()));
            if (parts.length === 4 && parts.every((n) => Number.isFinite(n) && n > 0)) {
              s.timeouts = { ingest: parts[0], query: parts[1], lint: parts[2], init: parts[3] };
              await this.plugin.saveSettings();
            }
          }),
      );

    new Setting(containerEl)
      .setName("Лимит истории")
      .setDesc("Максимум операций в истории боковой панели.")
      .addText((t) =>
        t.setValue(String(s.historyLimit))
          .onChange(async (v) => {
            const n = Number(v);
            if (Number.isFinite(n) && n > 0) { s.historyLimit = Math.floor(n); await this.plugin.saveSettings(); }
          }),
      );

    new Setting(containerEl)
      .setName("Лог агента (JSONL)")
      .setDesc("Абсолютный путь к файлу лога. Пусто — отключено.")
      .addText((t) =>
        t
          .setPlaceholder("/tmp/llm-wiki-agent.jsonl")
          .setValue(s.agentLogPath)
          .onChange(async (v) => { s.agentLogPath = v.trim(); await this.plugin.saveSettings(); }),
      );
  }
}
```

- [ ] **Шаг 2: Проверить TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep "settings.ts" | head -10
```

Ожидаем: нет ошибок в `settings.ts`.

- [ ] **Шаг 3: Коммит**

```bash
git add src/settings.ts
git commit -m "feat: settings UI — replace claude-code section with claude-agent"
```

---

## Task 7: Обновить `main.ts` — миграция settings

**Files:**
- Modify: `src/main.ts`

- [ ] **Шаг 1: Заменить `loadSettings` в `src/main.ts`**

Текущий метод (строки 91–101):
```typescript
async loadSettings(): Promise<void> {
  const data = (await this.loadData()) as Partial<LlmWikiPluginSettings> | null;
  this.settings = {
    ...DEFAULT_SETTINGS,
    ...(data ?? {}),
    timeouts: { ...DEFAULT_SETTINGS.timeouts, ...(data?.timeouts ?? {}) },
    nativeAgent: { ...DEFAULT_SETTINGS.nativeAgent, ...(data?.nativeAgent ?? {}) },
    allowedTools: data?.allowedTools ?? DEFAULT_SETTINGS.allowedTools,
    history: data?.history ?? [],
  };
}
```

Заменить на:
```typescript
async loadSettings(): Promise<void> {
  const data = (await this.loadData()) as Record<string, unknown> | null;
  this.settings = {
    ...DEFAULT_SETTINGS,
    ...(data ?? {}),
    timeouts: { ...DEFAULT_SETTINGS.timeouts, ...((data?.timeouts as object) ?? {}) },
    nativeAgent: { ...DEFAULT_SETTINGS.nativeAgent, ...((data?.nativeAgent as object) ?? {}) },
    claudeAgent: { ...DEFAULT_SETTINGS.claudeAgent, ...((data?.claudeAgent as object) ?? {}) },
    history: (data?.history as RunHistoryEntry[]) ?? [],
  } as LlmWikiPluginSettings;

  // Миграция с claude-code backend
  if ((data?.backend as string) === "claude-code" || !this.settings.claudeAgent.iclaudePath) {
    if ((data?.backend as string) === "claude-code") {
      this.settings.backend = "claude-agent";
    }
    if (data?.iclaudePath && !this.settings.claudeAgent.iclaudePath) {
      this.settings.claudeAgent.iclaudePath = data.iclaudePath as string;
    }
    if (data?.model && !this.settings.claudeAgent.model) {
      this.settings.claudeAgent.model = data.model as string;
    }
  }
}
```

Добавить импорт `RunHistoryEntry` если не импортирован:
```typescript
import { DEFAULT_SETTINGS, type LlmWikiPluginSettings, type RunHistoryEntry } from "./types";
```

- [ ] **Шаг 2: Проверить TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep "main.ts" | head -10
```

Ожидаем: нет ошибок в `main.ts`.

- [ ] **Шаг 3: Запустить все тесты**

```bash
npx vitest run 2>&1 | tail -20
```

Ожидаем: все проходят кроме `runner.integration.test.ts` и `prompt.test.ts` (удалим в следующем шаге).

- [ ] **Шаг 4: Коммит**

```bash
git add src/main.ts
git commit -m "feat: loadSettings migration — claude-code backend → claude-agent"
```

---

## Task 8: Удалить старые файлы

**Files:**
- Delete: `src/runner.ts`, `src/prompt.ts`
- Delete: `tests/runner.integration.test.ts`, `tests/prompt.test.ts`

- [ ] **Шаг 1: Удалить файлы**

```bash
rm src/runner.ts src/prompt.ts
rm tests/runner.integration.test.ts tests/prompt.test.ts
```

- [ ] **Шаг 2: Проверить TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Ожидаем: нет ошибок (все импорты runner/prompt уже убраны из controller.ts).

- [ ] **Шаг 3: Запустить все тесты**

```bash
npx vitest run 2>&1 | tail -20
```

Ожидаем: все тесты проходят, runner и prompt тестов больше нет.

- [ ] **Шаг 4: Коммит**

```bash
git add -A
git commit -m "chore: remove IclaudeRunner, buildPrompt and their tests"
```

---

## Task 9: Финальная сборка и проверка

**Files:** нет изменений

- [ ] **Шаг 1: Обновить версию перед сборкой**

Прочитать текущую версию из `package.json`, инкрементировать patch, записать в `package.json` и `manifest.json`.

```bash
node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('package.json'));
const mf = JSON.parse(fs.readFileSync('manifest.json'));
const [ma,mi,pa] = pkg.version.split('.').map(Number);
const v = \`\${ma}.\${mi}.\${pa+1}\`;
pkg.version = v; mf.version = v;
fs.writeFileSync('package.json', JSON.stringify(pkg, null, '\t') + '\n');
fs.writeFileSync('manifest.json', JSON.stringify(mf, null, '\t') + '\n');
console.log('Version:', v);
"
```

- [ ] **Шаг 2: Запустить финальный тест suite**

```bash
npx vitest run 2>&1 | tail -30
```

Ожидаем: `X passed, 0 failed`.

- [ ] **Шаг 3: Production build**

```bash
npm run build 2>&1 | tail -20
```

Ожидаем: `main.js` собирается без ошибок.

- [ ] **Шаг 4: Финальный коммит**

```bash
git add package.json manifest.json main.js
git commit -m "build: bump patch version; claude-agent backend complete"
```
