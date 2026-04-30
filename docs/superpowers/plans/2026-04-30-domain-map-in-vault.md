# Domain-map → data.json Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Перенести хранение доменов из внешнего `domain-map-<vault>.json` в `data.json` Obsidian-плагина, убрать всё файловое I/O из `domain-map.ts`, добавить UI-редактор доменов в настройках.

**Architecture:** Домены хранятся в `LlmWikiPluginSettings.domains[]` и сохраняются через стандартный `saveData()`. Фаза `init` при создании домена выдаёт событие `domain_created`, контроллер перехватывает его в dispatch-цикле и вызывает `saveSettings()`. Редактирование доменов — через новый `EditDomainModal` в секции Domains настроек.

**Tech Stack:** TypeScript, Obsidian Plugin API (`loadData`/`saveData`), Vitest.

---

## File Map

| Файл | Действие |
|------|---------|
| `src/domain-map.ts` | Убрать весь fs I/O; оставить типы + `validateDomainId` |
| `src/types.ts` | Добавить `domains: DomainEntry[]` в settings, `domain_created` в RunEvent, убрать `domainMapDir` |
| `src/phases/init.ts` | Убрать `domainMapDir` параметр, заменить `addDomain` на `yield domain_created` |
| `src/agent-runner.ts` | Убрать `domainMapDir` из конструктора и вызова `runInit` |
| `src/controller.ts` | Переписать `loadDomains`, `registerDomain`, убрать `resolveDomainMapDir`, обработать `domain_created` в dispatch |
| `src/main.ts` | Обновить `loadSettings`: добавить `domains`, убрать миграцию `domainMapDir` |
| `src/i18n.ts` | Убрать ключи `domainMapDir_*`, добавить ключи для UI-редактора доменов (en/ru/es) |
| `src/settings.ts` | Убрать блок `domainMapDir`, добавить секцию Domains с Edit/Delete |
| `src/modals.ts` | Добавить `EditDomainModal` |
| `src/view.ts` | Обработать `domain_created` в `appendEvent`, обновить `refreshTitle` |
| `tests/domain-map.test.ts` | Полностью переписать: только тесты на `validateDomainId` |
| `tests/phases/init.test.ts` | Убрать `domainMapDir` аргумент, добавить тест на `domain_created` |

---

## Task 1: Упростить `src/domain-map.ts` — написать тест, затем реализацию

**Files:**
- Modify: `tests/domain-map.test.ts`
- Modify: `src/domain-map.ts`

- [ ] **Step 1.1: Написать новый тест-файл**

Полностью заменить `tests/domain-map.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { validateDomainId } from "../src/domain-map";

describe("validateDomainId", () => {
  it("returns null for valid ASCII id", () => {
    expect(validateDomainId("projects")).toBeNull();
  });

  it("returns null for valid cyrillic id", () => {
    expect(validateDomainId("ии")).toBeNull();
  });

  it("returns null for id with hyphen and underscore", () => {
    expect(validateDomainId("my-domain_v2")).toBeNull();
  });

  it("returns error string for empty id", () => {
    expect(validateDomainId("")).not.toBeNull();
  });

  it("returns error string for id with slash", () => {
    expect(validateDomainId("bad/slash")).not.toBeNull();
  });

  it("returns error string for id with space", () => {
    expect(validateDomainId("bad id")).not.toBeNull();
  });

  it("returns error string for id with dot", () => {
    expect(validateDomainId("bad.id")).not.toBeNull();
  });
});
```

- [ ] **Step 1.2: Запустить тест — убедиться что падает**

```bash
npx vitest run tests/domain-map.test.ts
```

Ожидаемый результат: ошибки импорта (`validateDomainId` не существует).

- [ ] **Step 1.3: Заменить содержимое `src/domain-map.ts`**

```ts
export interface EntityType {
  type: string;
  description: string;
  extraction_cues: string[];
  min_mentions_for_page?: number;
  wiki_subfolder?: string;
}

export interface DomainEntry {
  id: string;
  name: string;
  wiki_folder: string;
  source_paths?: string[];
  entity_types?: EntityType[];
  language_notes?: string;
}

export interface AddDomainInput {
  id: string;
  name: string;
  wikiFolder: string;
  sourcePaths: string[];
}

/** Returns null if id is valid, or an error message string. */
export function validateDomainId(id: string): string | null {
  if (!id) return "ID домена пуст";
  if (!/^[\p{L}\p{N}_-]+$/u.test(id)) return "ID допускает только буквы/цифры/_/-";
  return null;
}
```

- [ ] **Step 1.4: Запустить тест — убедиться что проходит**

```bash
npx vitest run tests/domain-map.test.ts
```

Ожидаемый результат: 7 тестов PASS.

- [ ] **Step 1.5: Коммит**

```bash
git add tests/domain-map.test.ts src/domain-map.ts
git commit -m "refactor: simplify domain-map.ts to types + validateDomainId only"
```

---

## Task 2: Обновить `src/types.ts` — добавить `domains` и `domain_created`

**Files:**
- Modify: `src/types.ts`

- [ ] **Step 2.1: Добавить импорт DomainEntry и обновить RunEvent и LlmWikiPluginSettings**

В начало файла (после `import type OpenAI from "openai"`):

```ts
import type { DomainEntry } from "./domain-map";
```

В `RunEvent` union добавить новую строку перед закрывающей `;`:

```ts
export type RunEvent =
  | { kind: "system"; message: string }
  | { kind: "tool_use"; name: string; input: unknown }
  | { kind: "tool_result"; ok: boolean; preview?: string }
  | { kind: "assistant_text"; delta: string; isReasoning?: boolean }
  | { kind: "result"; durationMs: number; usdCost?: number; text: string }
  | { kind: "error"; message: string }
  | { kind: "exit"; code: number }
  | { kind: "ask_user"; question: string; options: string[]; toolUseId: string }
  | { kind: "domain_created"; entry: DomainEntry };
```

В `LlmWikiPluginSettings` заменить `domainMapDir: string` на `domains: DomainEntry[]`:

```ts
export interface LlmWikiPluginSettings {
  backend: "claude-agent" | "native-agent";
  systemPrompt: string;
  domains: DomainEntry[];
  maxTokens: number;
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
    perOperation: boolean;
    operations: OpMap<ClaudeOperationConfig>;
  };
  nativeAgent: {
    baseUrl: string;
    apiKey: string;
    model: string;
    temperature: number;
    topP: number | null;
    numCtx: number | null;
    perOperation: boolean;
    operations: OpMap<NativeOperationConfig>;
  };
}
```

В `DEFAULT_SETTINGS` заменить `domainMapDir: ""` на `domains: []`:

```ts
export const DEFAULT_SETTINGS: LlmWikiPluginSettings = {
  backend: "claude-agent",
  systemPrompt: "You are a wiki assistant for a technical knowledge base. Be precise, factual, and concise. Use only the provided sources.",
  domains: [],
  maxTokens: 4096,
  agentLogPath: "",
  historyLimit: 20,
  timeouts: { ingest: 300, query: 300, lint: 600, init: 3600 },
  history: [],
  claudeAgent: {
    iclaudePath: "",
    model: "sonnet",
    perOperation: false,
    operations: {
      ingest: { model: "haiku",  maxTokens: 4096 },
      query:  { model: "sonnet", maxTokens: 4096 },
      lint:   { model: "haiku",  maxTokens: 4096 },
      init:   { model: "sonnet", maxTokens: 8192 },
    },
  },
  nativeAgent: {
    baseUrl: "http://localhost:11434/v1",
    apiKey: "ollama",
    model: "llama3.2",
    temperature: 0.2,
    topP: null,
    numCtx: null,
    perOperation: false,
    operations: {
      ingest: { model: "llama3.2", maxTokens: 4096, temperature: 0.2 },
      query:  { model: "llama3.2", maxTokens: 4096, temperature: 0.2 },
      lint:   { model: "llama3.2", maxTokens: 4096, temperature: 0.2 },
      init:   { model: "llama3.2", maxTokens: 8192, temperature: 0.2 },
    },
  },
};
```

- [ ] **Step 2.2: Коммит**

```bash
git add src/types.ts
git commit -m "feat: add domains[] to settings and domain_created to RunEvent"
```

---

## Task 3: Обновить `src/phases/init.ts` — убрать domainMapDir, yield domain_created

**Files:**
- Modify: `src/phases/init.ts`

- [ ] **Step 3.1: Обновить сигнатуру функции и тело**

Полностью заменить `src/phases/init.ts`:

```ts
import type OpenAI from "openai";
import type { DomainEntry } from "../domain-map";
import type { LlmCallOptions, RunEvent, LlmClient } from "../types";
import type { VaultTools } from "../vault-tools";
import { buildChatParams, extractStreamDeltas } from "./llm-utils";

export async function* runInit(
  args: string[],
  vaultTools: VaultTools,
  llm: LlmClient,
  model: string,
  domains: DomainEntry[],
  repoRoot: string,
  vaultName: string,
  signal: AbortSignal,
  opts: LlmCallOptions = {},
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

  const allFiles = await vaultTools.listFiles("");
  const sampleFiles = allFiles.slice(0, 5);
  const samples = await vaultTools.readAll(sampleFiles);

  const wikiRootGuess = `!Wiki`;
  const [schemaContent, indexContent] = await Promise.all([
    tryRead(vaultTools, `${wikiRootGuess}/_schema.md`),
    tryRead(vaultTools, `${wikiRootGuess}/_index.md`),
  ]);

  const systemContent = [
    `Ты — архитектор wiki-базы знаний. Сгенерируй запись домена для domain-map.json.`,
    `Верни ТОЛЬКО валидный JSON следующей структуры:`,
    `{`,
    `  "id": "${domainId}",`,
    `  "name": "Человекочитаемое название",`,
    `  "wiki_folder": "vaults/${vaultName}/!Wiki/${domainId}",`,
    `  "source_paths": ["relative/source/path"],`,
    `  "entity_types": [{"type":"...","description":"...","extraction_cues":["..."],"min_mentions_for_page":1,"wiki_subfolder":"${domainId}/..."}],`,
    `  "language_notes": ""`,
    `}`,
    schemaContent ? `\nКонвенции вики (_schema.md):\n${schemaContent.slice(0, 1500)}` : "",
    indexContent ? `\nСуществующая структура (_index.md):\n${indexContent.slice(0, 1000)}` : "",
  ].filter(Boolean).join("\n");

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: systemContent },
    {
      role: "user",
      content: [
        `Domain ID: ${domainId}`,
        `Vault name: ${vaultName}`,
        "",
        `Примеры файлов vault:`,
        [...samples.entries()].map(([p, c]) => `${p}:\n${c.slice(0, 400)}`).join("\n\n"),
      ].join("\n"),
    },
  ];

  const params = buildChatParams(model, messages, opts);
  let fullText = "";
  try {
    const stream = await llm.chat.completions.create(
      { ...params, stream: true } as OpenAI.Chat.ChatCompletionCreateParamsStreaming,
      { signal },
    );
    for await (const chunk of stream) {
      const { reasoning, content } = extractStreamDeltas(chunk);
      if (reasoning) yield { kind: "assistant_text", delta: reasoning, isReasoning: true };
      if (content) { fullText += content; yield { kind: "assistant_text", delta: content }; }
    }
  } catch (e) {
    if (signal.aborted || (e as Error).name === "AbortError") return;
    const resp = await llm.chat.completions.create(
      { ...params, stream: false } as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming,
    );
    fullText = resp.choices[0]?.message?.content ?? "";
    if (fullText) yield { kind: "assistant_text", delta: fullText };
  }

  if (signal.aborted) return;

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

  yield { kind: "tool_use", name: "SaveDomain", input: { id: entry.id } };
  yield { kind: "domain_created", entry };
  yield { kind: "tool_result", ok: true };

  await appendLog(vaultTools, wikiRootGuess, domainId);

  yield {
    kind: "result",
    durationMs: Date.now() - start,
    text: `Domain "${domainId}" initialised. Edit entity_types in plugin settings to refine extraction.`,
  };
}

async function appendLog(vaultTools: VaultTools, wikiRoot: string, domainId: string): Promise<void> {
  const logPath = `${wikiRoot}/_log.md`;
  const today = new Date().toISOString().slice(0, 10);
  const entry = `\n## ${today} — init — ${domainId}\n- Домен создан\n`;
  try {
    const existing = await tryRead(vaultTools, logPath);
    await vaultTools.write(logPath, existing + entry);
  } catch { /* не критично */ }
}

async function tryRead(vaultTools: VaultTools, path: string): Promise<string> {
  try { return await vaultTools.read(path); } catch { return ""; }
}
```

- [ ] **Step 3.2: Коммит**

```bash
git add src/phases/init.ts
git commit -m "feat: init phase yields domain_created event instead of writing file"
```

---

## Task 4: Обновить `tests/phases/init.test.ts`

**Files:**
- Modify: `tests/phases/init.test.ts`

- [ ] **Step 4.1: Убрать domainMapDir из всех вызовов runInit, добавить тест domain_created**

Полностью заменить `tests/phases/init.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { runInit } from "../../src/phases/init";
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

function makeLlm(json: string): LlmClient {
  return {
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue({
          [Symbol.asyncIterator]: async function* () {
            yield { choices: [{ delta: { content: json } }] };
          },
        }),
      },
    },
  } as unknown as LlmClient;
}

async function collect<T>(gen: AsyncGenerator<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const e of gen) out.push(e);
  return out;
}

const existingDomain: DomainEntry = {
  id: "existing",
  name: "Existing",
  wiki_folder: "vaults/Test/!Wiki/existing",
  source_paths: [],
};

const validDomainJson = JSON.stringify({
  id: "newdomain",
  name: "New Domain",
  wiki_folder: "vaults/TestVault/!Wiki/newdomain",
  source_paths: [],
  entity_types: [],
  language_notes: "",
});

describe("runInit", () => {
  it("yields error when domainId is empty", async () => {
    const vt = new VaultTools(mockAdapter(), "/vault");
    const events = await collect(
      runInit([], vt, makeLlm("{}"), "model", [], "/vault", "TestVault", new AbortController().signal),
    );
    expect(events.some((e: any) => e.kind === "error")).toBe(true);
  });

  it("yields error when domain already exists", async () => {
    const vt = new VaultTools(mockAdapter(), "/vault");
    const events = await collect(
      runInit(
        ["existing"],
        vt,
        makeLlm("{}"),
        "model",
        [existingDomain],
        "/vault",
        "TestVault",
        new AbortController().signal,
      ),
    );
    expect(events.some((e: any) => e.kind === "error")).toBe(true);
  });

  it("dry-run returns JSON preview without domain_created event", async () => {
    const adapter = mockAdapter({
      list: vi.fn().mockResolvedValue({ files: [], folders: [] }),
    });
    const vt = new VaultTools(adapter, "/vault");
    const events = await collect(
      runInit(
        ["newdomain", "--dry-run"],
        vt,
        makeLlm(validDomainJson),
        "model",
        [],
        "/vault",
        "TestVault",
        new AbortController().signal,
      ),
    );
    const result = events.find((e: any) => e.kind === "result") as any;
    expect(result).toBeDefined();
    expect(result.text).toContain("Dry run");
    expect(events.some((e: any) => e.kind === "domain_created")).toBe(false);
  });

  it("yields domain_created event with parsed entry on success", async () => {
    const adapter = mockAdapter({
      list: vi.fn().mockResolvedValue({ files: [], folders: [] }),
    });
    const vt = new VaultTools(adapter, "/vault");
    const events = await collect(
      runInit(
        ["newdomain"],
        vt,
        makeLlm(validDomainJson),
        "model",
        [],
        "/vault",
        "TestVault",
        new AbortController().signal,
      ),
    );
    const domainCreated = events.find((e: any) => e.kind === "domain_created") as any;
    expect(domainCreated).toBeDefined();
    expect(domainCreated.entry.id).toBe("newdomain");
    expect(domainCreated.entry.wiki_folder).toBe("vaults/TestVault/!Wiki/newdomain");
  });

  it("yields result event after domain_created", async () => {
    const adapter = mockAdapter({
      list: vi.fn().mockResolvedValue({ files: [], folders: [] }),
    });
    const vt = new VaultTools(adapter, "/vault");
    const events = await collect(
      runInit(
        ["newdomain"],
        vt,
        makeLlm(validDomainJson),
        "model",
        [],
        "/vault",
        "TestVault",
        new AbortController().signal,
      ),
    );
    const result = events.find((e: any) => e.kind === "result") as any;
    expect(result).toBeDefined();
    expect(result.text).toContain("newdomain");
  });
});
```

- [ ] **Step 4.2: Запустить тесты init**

```bash
npx vitest run tests/phases/init.test.ts
```

Ожидаемый результат: 5 тестов PASS.

- [ ] **Step 4.3: Коммит**

```bash
git add tests/phases/init.test.ts
git commit -m "test: update init tests for domain_created event, remove domainMapDir arg"
```

---

## Task 5: Обновить `src/agent-runner.ts` — убрать domainMapDir

**Files:**
- Modify: `src/agent-runner.ts`

- [ ] **Step 5.1: Убрать domainMapDir из конструктора и вызова runInit**

Полностью заменить `src/agent-runner.ts`:

```ts
import type { DomainEntry } from "./domain-map";
import { runIngest } from "./phases/ingest";
import { runQuery } from "./phases/query";
import { runLint } from "./phases/lint";
import { runInit } from "./phases/init";
import type { LlmCallOptions, LlmClient, LlmWikiPluginSettings, OpKey, RunEvent, RunRequest } from "./types";
import type { VaultTools } from "./vault-tools";

export class AgentRunner {
  constructor(
    private llm: LlmClient,
    private settings: LlmWikiPluginSettings,
    private vaultTools: VaultTools,
    private vaultName: string,
    private domains: DomainEntry[],
  ) {}

  private buildOptsFor(op: RunRequest["operation"]): { model: string; opts: LlmCallOptions } {
    const key = (op === "query-save" ? "query" : op) as OpKey;
    const s = this.settings;

    if (s.backend === "claude-agent") {
      if (s.claudeAgent.perOperation) {
        const c = s.claudeAgent.operations[key];
        return { model: c.model, opts: { maxTokens: c.maxTokens, systemPrompt: s.systemPrompt } };
      }
      return { model: s.claudeAgent.model, opts: { maxTokens: s.maxTokens, systemPrompt: s.systemPrompt } };
    }

    const na = s.nativeAgent;
    if (na.perOperation) {
      const c = na.operations[key];
      return { model: c.model, opts: { maxTokens: c.maxTokens, temperature: c.temperature, topP: na.topP, numCtx: na.numCtx, systemPrompt: s.systemPrompt } };
    }
    return { model: na.model, opts: { maxTokens: s.maxTokens, temperature: na.temperature, topP: na.topP, numCtx: na.numCtx, systemPrompt: s.systemPrompt } };
  }

  async *run(req: RunRequest): AsyncGenerator<RunEvent, void, void> {
    const { model, opts } = this.buildOptsFor(req.operation);
    yield { kind: "system", message: `${this.settings.backend} / ${model || "claude"}` };

    if (req.signal.aborted) return;

    const repoRoot = req.cwd ?? "";
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
        yield* runInit(req.args, this.vaultTools, this.llm, model, domains, repoRoot, this.vaultName, req.signal, opts);
        break;
      default: {
        const start = Date.now();
        yield { kind: "error", message: `Unknown operation: ${req.operation as string}` };
        yield { kind: "result", durationMs: Date.now() - start, text: "" };
      }
    }
  }
}
```

- [ ] **Step 5.2: Коммит**

```bash
git add src/agent-runner.ts
git commit -m "refactor: remove domainMapDir from AgentRunner"
```

---

## Task 6: Обновить `src/controller.ts`

**Files:**
- Modify: `src/controller.ts`

- [ ] **Step 6.1: Обновить импорты**

Заменить строку:
```ts
import { readDomains, addDomain, type DomainEntry, type AddDomainInput } from "./domain-map";
```
На:
```ts
import { validateDomainId, type DomainEntry, type AddDomainInput } from "./domain-map";
```

- [ ] **Step 6.2: Убрать resolveDomainMapDir(), обновить loadDomains() и registerDomain()**

Удалить метод `resolveDomainMapDir()` (строки 50–55).

Заменить `loadDomains()`:
```ts
loadDomains(): DomainEntry[] {
  return this.plugin.settings.domains ?? [];
}
```

Заменить `registerDomain()`:
```ts
registerDomain(input: AddDomainInput): { ok: true } | { ok: false; error: string } {
  const id = input.id.trim();
  const err = validateDomainId(id);
  if (err) { new Notice(i18n().ctrl.domainAddFailed(err)); return { ok: false, error: err }; }
  const s = this.plugin.settings;
  if (!s.domains) s.domains = [];
  if (s.domains.some((d) => d.id === id)) {
    const msg = `Домен «${id}» уже существует`;
    new Notice(i18n().ctrl.domainAddFailed(msg));
    return { ok: false, error: msg };
  }
  const vaultName = this.app.vault.getName();
  const wikiRoot = `vaults/${vaultName}/!Wiki`;
  const wikiFolder = input.wikiFolder.trim() || `${wikiRoot}/${id}`;
  s.domains.push({
    id,
    name: input.name.trim() || id,
    wiki_folder: wikiFolder,
    source_paths: input.sourcePaths.map((p) => p.trim()).filter(Boolean),
    entity_types: [],
    language_notes: "",
  });
  void this.plugin.saveSettings();
  new Notice(i18n().ctrl.domainAdded(id));
  return { ok: true };
}
```

- [ ] **Step 6.3: Обновить buildAgentRunner() — убрать domainMapDir**

Заменить блок `buildAgentRunner()` (строки 82–102):

```ts
private buildAgentRunner(): AgentRunner {
  const adapter = this.app.vault.adapter as unknown as VaultAdapter;
  const base = (this.app.vault.adapter as { getBasePath?: () => string }).getBasePath?.() ?? "";
  const vaultTools = new VaultTools(adapter, base);
  const vaultName = this.app.vault.getName();
  const domains = this.plugin.settings.domains ?? [];
  const s = this.plugin.settings;

  const maxTimeoutSec = Math.max(...Object.values(s.timeouts));
  const llm = s.backend === "claude-agent"
    ? new ClaudeCliClient({ ...s.claudeAgent, maxTokens: s.maxTokens, requestTimeoutSec: maxTimeoutSec })
    : new OpenAI({
        baseURL: s.nativeAgent.baseUrl,
        apiKey: s.nativeAgent.apiKey,
        timeout: maxTimeoutSec * 1000,
        dangerouslyAllowBrowser: true,
      });

  return new AgentRunner(llm, s, vaultTools, vaultName, domains);
}
```

- [ ] **Step 6.4: Добавить обработку domain_created в dispatch()**

В методе `dispatch()` в цикле `for await (const ev of runGen)` добавить обработчик после `view.appendEvent(ev)`:

```ts
for await (const ev of runGen) {
  this.logEvent(sessionId, op, domainId, ev);
  view.appendEvent(ev);
  if (ev.kind === "domain_created") {
    if (!this.plugin.settings.domains) this.plugin.settings.domains = [];
    this.plugin.settings.domains.push(ev.entry);
    void this.plugin.saveSettings();
  }
  this.collectStep(ev, steps);
  if (ev.kind === "result") finalText = ev.text;
  if (ev.kind === "error") status = "error";
  if (ev.kind === "exit") {
    if (ev.code !== 0 && status === "done") status = "error";
    if (ctrl.signal.aborted) status = "cancelled";
  }
}
```

- [ ] **Step 6.5: Коммит**

```bash
git add src/controller.ts
git commit -m "refactor: controller reads/writes domains from settings, handles domain_created event"
```

---

## Task 7: Обновить `src/main.ts` — loadSettings

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 7.1: Обновить loadSettings()**

В `loadSettings()` в объекте `this.settings = { ... }` добавить явную инициализацию `domains` (рядом с `history`):

```ts
history: (data?.history as RunHistoryEntry[]) ?? [],
domains: Array.isArray(data?.domains) ? (data.domains as DomainEntry[]) : [],
```

Для этого нужно добавить импорт типа `DomainEntry`. Добавить в начало файла:

```ts
import type { DomainEntry } from "./domain-map";
```

Удалить строки миграции `domainMapDir` (сейчас строки 135–136):

```ts
// УДАЛИТЬ эти строки:
if (!data?.domainMapDir && (caData.domainMapDir || naData.domainMapDir))
  this.settings.domainMapDir = (caData.domainMapDir ?? naData.domainMapDir) as string;
```

- [ ] **Step 7.2: Коммит**

```bash
git add src/main.ts
git commit -m "refactor: load domains from data.json, remove domainMapDir migration"
```

---

## Task 8: Обновить `src/i18n.ts` — ключи

**Files:**
- Modify: `src/i18n.ts`

- [ ] **Step 8.1: В секции `settings` объекта `en` — удалить domainMapDir ключи, добавить новые**

Удалить из `settings` (en, ru, es):
- `domainMapDir_name`
- `domainMapDir_desc`
- `domainMapDir_placeholder`

Добавить в `settings` (en):
```ts
domains_heading: "Domains",
editDomain: "Edit",
deleteDomain: "Delete",
domainDeleted: (id: string) => `Domain «${id}» deleted`,
```

- [ ] **Step 8.2: В секции `view` — обновить refreshTitle**

Заменить значение `refreshTitle` во всех трёх локалях:

```ts
// en:
refreshTitle: "Refresh domains",

// ru:
refreshTitle: "Обновить домены",

// es:
refreshTitle: "Actualizar dominios",
```

- [ ] **Step 8.3: В секции `modal` — добавить новые ключи, обновить addDomainNote**

В `modal` объекта `en` добавить:
```ts
editDomainTitle: (id: string) => `Edit domain: ${id}`,
entityTypesLabel: "Entity types (JSON array)",
entityTypesError: "Invalid JSON array — must be an array of objects",
sourcePathsLabel: "Source paths (one per line)",
languageNotesLabel: "Language notes",
save: "Save",
```

Обновить `addDomainNote`:
```ts
addDomainNote: "The entry will be saved in plugin settings with empty entity_types. Edit the domain in Settings → Domains to add entity_types/extraction_cues.",
```

- [ ] **Step 8.4: Дублировать новые ключи в `ru` и `es` локали**

В `ru` добавить в `settings`:
```ts
domains_heading: "Домены",
editDomain: "Редактировать",
deleteDomain: "Удалить",
domainDeleted: (id: string) => `Домен «${id}» удалён`,
```

В `ru` добавить в `modal`:
```ts
editDomainTitle: (id: string) => `Редактирование домена: ${id}`,
entityTypesLabel: "Типы сущностей (JSON-массив)",
entityTypesError: "Невалидный JSON-массив — должен быть массивом объектов",
sourcePathsLabel: "Пути источников (по одному на строку)",
languageNotesLabel: "Заметки о языке",
save: "Сохранить",
```

В `ru` обновить `addDomainNote`:
```ts
addDomainNote: "Запись сохранится в настройках плагина с пустыми entity_types. Отредактируйте домен в Настройки → Домены для добавления entity_types/extraction_cues.",
```

В `es` добавить в `settings`:
```ts
domains_heading: "Dominios",
editDomain: "Editar",
deleteDomain: "Eliminar",
domainDeleted: (id: string) => `Dominio «${id}» eliminado`,
```

В `es` добавить в `modal`:
```ts
editDomainTitle: (id: string) => `Editar dominio: ${id}`,
entityTypesLabel: "Tipos de entidad (array JSON)",
entityTypesError: "Array JSON inválido — debe ser un array de objetos",
sourcePathsLabel: "Rutas de origen (una por línea)",
languageNotesLabel: "Notas de idioma",
save: "Guardar",
```

В `es` обновить `addDomainNote`:
```ts
addDomainNote: "La entrada se guardará en la configuración del plugin con entity_types vacíos. Edita el dominio en Ajustes → Dominios para añadir entity_types/extraction_cues.",
```

- [ ] **Step 8.5: Коммит**

```bash
git add src/i18n.ts
git commit -m "i18n: remove domainMapDir keys, add domain editor keys in en/ru/es"
```

---

## Task 9: Обновить `src/settings.ts` — убрать domainMapDir UI, добавить секцию Domains

**Files:**
- Modify: `src/settings.ts`

- [ ] **Step 9.1: Обновить импорты**

Добавить импорт:
```ts
import { EditDomainModal } from "./modals";
```

- [ ] **Step 9.2: Удалить блок domainMapDir**

Удалить строки 45–52 (блок Setting для `domainMapDir`):
```ts
// УДАЛИТЬ:
new Setting(containerEl)
  .setName(T.settings.domainMapDir_name)
  .setDesc(T.settings.domainMapDir_desc)
  .addText((t) =>
    t.setPlaceholder(T.settings.domainMapDir_placeholder)
      .setValue(s.domainMapDir)
      .onChange(async (v) => { s.domainMapDir = v.trim(); await this.plugin.saveSettings(); }),
  );
```

- [ ] **Step 9.3: Добавить секцию Domains перед секцией Backend**

Вставить перед строкой `new Setting(containerEl).setName(T.settings.h3_backend).setHeading();`:

```ts
// ── Domains ───────────────────────────────────────────────────────────────
new Setting(containerEl).setName(T.settings.domains_heading).setHeading();

const domains = s.domains ?? [];
if (domains.length === 0) {
  containerEl.createEl("p", {
    text: "No domains. Add a domain via the sidebar panel (Add domain button).",
    cls: "setting-item-description",
  });
} else {
  for (let i = 0; i < domains.length; i++) {
    const d = domains[i];
    new Setting(containerEl)
      .setName(`${d.name || d.id}`)
      .setDesc(d.id)
      .addButton((b) =>
        b.setButtonText(T.settings.editDomain).onClick(() => {
          new EditDomainModal(this.plugin.app, d, async (updated) => {
            s.domains[i] = updated;
            await this.plugin.saveSettings();
            this.display();
          }).open();
        }),
      )
      .addButton((b) =>
        b.setButtonText(T.settings.deleteDomain).setWarning().onClick(async () => {
          s.domains.splice(i, 1);
          await this.plugin.saveSettings();
          new Notice(T.settings.domainDeleted(d.id));
          this.display();
        }),
      );
  }
}
```

- [ ] **Step 9.4: Коммит**

```bash
git add src/settings.ts
git commit -m "feat: add Domains section to settings, remove domainMapDir UI"
```

---

## Task 10: Добавить `EditDomainModal` в `src/modals.ts`

**Files:**
- Modify: `src/modals.ts`

- [ ] **Step 10.1: Добавить импорт EntityType**

В строку импорта из `./domain-map` добавить `EntityType`:
```ts
import type { AddDomainInput, DomainEntry, EntityType } from "./domain-map";
```

- [ ] **Step 10.2: Добавить класс EditDomainModal в конец файла**

```ts
export class EditDomainModal extends Modal {
  private nameVal: string;
  private wikiFolderVal: string;
  private sourcePathsVal: string;
  private entityTypesVal: string;
  private languageNotesVal: string;
  private errorEl: HTMLElement | null = null;

  constructor(
    app: App,
    private domain: DomainEntry,
    private onSave: (updated: DomainEntry) => void,
  ) {
    super(app);
    this.nameVal = domain.name;
    this.wikiFolderVal = domain.wiki_folder;
    this.sourcePathsVal = (domain.source_paths ?? []).join("\n");
    this.entityTypesVal = JSON.stringify(domain.entity_types ?? [], null, 2);
    this.languageNotesVal = domain.language_notes ?? "";
  }

  onOpen(): void {
    const T = i18n().modal;
    const { contentEl } = this;
    contentEl.createEl("h3", { text: T.editDomainTitle(this.domain.id) });

    new Setting(contentEl)
      .setName(T.displayName_name)
      .addText((t) => t.setValue(this.nameVal).onChange((v) => { this.nameVal = v; }));

    new Setting(contentEl)
      .setName(T.wikiFolder_name)
      .addText((t) => t.setValue(this.wikiFolderVal).onChange((v) => { this.wikiFolderVal = v; }));

    new Setting(contentEl)
      .setName(T.sourcePathsLabel)
      .setDesc(T.sourcePaths_desc)
      .addTextArea((t) => {
        t.inputEl.rows = 4;
        t.inputEl.style.width = "100%";
        t.setValue(this.sourcePathsVal).onChange((v) => { this.sourcePathsVal = v; });
      });

    new Setting(contentEl)
      .setName(T.entityTypesLabel)
      .addTextArea((t) => {
        t.inputEl.rows = 10;
        t.inputEl.style.width = "100%";
        t.inputEl.style.fontFamily = "monospace";
        t.setValue(this.entityTypesVal).onChange((v) => { this.entityTypesVal = v; });
      });

    new Setting(contentEl)
      .setName(T.languageNotesLabel)
      .addText((t) => t.setValue(this.languageNotesVal).onChange((v) => { this.languageNotesVal = v; }));

    this.errorEl = contentEl.createEl("p", { cls: "mod-warning" });
    this.errorEl.style.display = "none";

    new Setting(contentEl)
      .addButton((b) => b.setButtonText(T.cancel).onClick(() => this.close()))
      .addButton((b) => b.setButtonText(T.save).setCta().onClick(() => this.handleSave()));
  }

  private handleSave(): void {
    let entityTypes: EntityType[];
    try {
      const parsed = JSON.parse(this.entityTypesVal.trim() || "[]");
      if (!Array.isArray(parsed)) throw new Error("not an array");
      entityTypes = parsed as EntityType[];
    } catch {
      if (this.errorEl) {
        this.errorEl.textContent = i18n().modal.entityTypesError;
        this.errorEl.style.display = "";
      }
      return;
    }
    const updated: DomainEntry = {
      ...this.domain,
      name: this.nameVal.trim() || this.domain.name,
      wiki_folder: this.wikiFolderVal.trim() || this.domain.wiki_folder,
      source_paths: this.sourcePathsVal.split("\n").map((s) => s.trim()).filter(Boolean),
      entity_types: entityTypes,
      language_notes: this.languageNotesVal.trim(),
    };
    this.close();
    this.onSave(updated);
  }

  onClose(): void { this.contentEl.empty(); }
}
```

- [ ] **Step 10.3: Коммит**

```bash
git add src/modals.ts
git commit -m "feat: add EditDomainModal for in-settings domain editing"
```

---

## Task 11: Обновить `src/view.ts` — обработать domain_created

**Files:**
- Modify: `src/view.ts`

- [ ] **Step 11.1: Добавить ранний return для domain_created в appendEvent()**

В начало метода `appendEvent(ev: RunEvent)` (строка 229), перед `this.stepCount++`, добавить:

```ts
appendEvent(ev: RunEvent): void {
  if (ev.kind === "domain_created") {
    this.refreshDomains();
    return;
  }
  this.stepCount++;
  // ... остальной код без изменений
```

- [ ] **Step 11.2: Коммит**

```bash
git add src/view.ts
git commit -m "feat: view refreshes domain selector on domain_created event"
```

---

## Task 12: Сборка и полный прогон тестов

**Files:** —

- [ ] **Step 12.1: Запустить все тесты**

```bash
npm test
```

Ожидаемый результат: все тесты PASS (в т.ч. domain-map, init, ingest, lint, query).

- [ ] **Step 12.2: Поднять patch-версию и собрать**

Прочитать текущую версию из `package.json`, инкрементировать patch (X.Y.Z → X.Y.Z+1), записать в `package.json` и `manifest.json`, затем:

```bash
npm run build
```

Ожидаемый результат: `main.js` пересобран без ошибок TypeScript.

- [ ] **Step 12.3: Финальный коммит**

```bash
git add package.json manifest.json main.js
git commit -m "chore: bump version, build domain-map → data.json migration"
```
