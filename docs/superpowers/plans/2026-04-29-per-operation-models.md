# Per-Operation Model Configuration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-operation model/maxTokens/temperature configuration to both claude-agent and native-agent backends, with a UI toggle in Obsidian settings.

**Architecture:** New interfaces `ClaudeOperationConfig` / `NativeOperationConfig` + `OpMap<T>` in types.ts. `AgentRunner.buildOpts()` is replaced by `buildOptsFor(op)` that selects model and opts per operation. `ClaudeCliClient` is fixed to use `params.model` so per-operation model flows through to the CLI flag. Settings UI gets a toggle that shows/hides per-operation sections.

**Tech Stack:** TypeScript, Obsidian Plugin API (Setting, PluginSettingTab), esbuild, vitest.

---

## File Map

| File | Change |
|---|---|
| `src/types.ts` | Add `OpKey`, `OpMap<T>`, `ClaudeOperationConfig`, `NativeOperationConfig`; extend backend configs; update `DEFAULT_SETTINGS` |
| `src/i18n.ts` | Add 11 new keys in en/ru/es |
| `src/agent-runner.ts` | Replace `buildOpts()` + `model` var with `buildOptsFor(op)` |
| `src/claude-cli-client.ts` | Use `params.model` instead of `this.cfg.model` |
| `src/main.ts` | Deep-merge `operations` in `loadSettings` to avoid shared mutable references |
| `src/settings.ts` | Add toggle + conditional per-operation sections |

---

### Task 1: Update `src/types.ts`

**Files:**
- Modify: `src/types.ts`

- [ ] **Step 1: Replace the file contents**

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

export type OpKey = "ingest" | "query" | "lint" | "init";
export type OpMap<T> = Record<OpKey, T>;

export interface ClaudeOperationConfig {
  model: string;
  maxTokens: number;
}

export interface NativeOperationConfig {
  model: string;
  maxTokens: number;
  temperature: number;
}

export interface LlmWikiPluginSettings {
  backend: "claude-agent" | "native-agent";
  systemPrompt: string;
  domainMapDir: string;
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

export const DEFAULT_SETTINGS: LlmWikiPluginSettings = {
  backend: "claude-agent",
  systemPrompt: "You are a wiki assistant for a technical knowledge base. Be precise, factual, and concise. Use only the provided sources.",
  domainMapDir: "",
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

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -30`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat: add OpKey/OpMap/ClaudeOperationConfig/NativeOperationConfig types and per-operation defaults"
```

---

### Task 2: Update `src/i18n.ts`

**Files:**
- Modify: `src/i18n.ts`

- [ ] **Step 1: Add 11 new keys to the `settings` object in the `en` locale (after `numCtx_desc`)**

In the `en` constant, inside `settings: { ... }`, add after `numCtx_desc`:

```typescript
    perOperation_name: "Per-operation models",
    perOperation_desc: "Configure separate model and parameters for each operation.",
    op_ingest: "Ingest",
    op_query: "Query",
    op_lint: "Lint",
    op_init: "Init",
    opModel_name: "Model",
    opModel_desc: "Model name for this operation.",
    opMaxTokens_name: "Max tokens",
    opMaxTokens_desc: "Max tokens for this operation.",
    opTemperature_name: "Temperature",
    opTemperature_desc: "Temperature for this operation (0–2).",
```

- [ ] **Step 2: Add the same keys to the `ru` locale (after `numCtx_desc`)**

```typescript
    perOperation_name: "Модели по операциям",
    perOperation_desc: "Настроить отдельную модель и параметры для каждой операции.",
    op_ingest: "Ingest",
    op_query: "Query",
    op_lint: "Lint",
    op_init: "Init",
    opModel_name: "Модель",
    opModel_desc: "Имя модели для этой операции.",
    opMaxTokens_name: "Max tokens",
    opMaxTokens_desc: "Максимум токенов для этой операции.",
    opTemperature_name: "Temperature",
    opTemperature_desc: "Temperature для этой операции (0–2).",
```

- [ ] **Step 3: Add the same keys to the `es` locale (after `numCtx_desc`)**

```typescript
    perOperation_name: "Modelos por operación",
    perOperation_desc: "Configurar modelo y parámetros separados para cada operación.",
    op_ingest: "Ingest",
    op_query: "Query",
    op_lint: "Lint",
    op_init: "Init",
    opModel_name: "Modelo",
    opModel_desc: "Nombre del modelo para esta operación.",
    opMaxTokens_name: "Máx. tokens",
    opMaxTokens_desc: "Máximo de tokens para esta operación.",
    opTemperature_name: "Temperatura",
    opTemperature_desc: "Temperatura para esta operación (0–2).",
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -30`
Expected: no errors (TypeScript enforces that `ru` and `es` satisfy `typeof en` so missing keys would fail)

- [ ] **Step 5: Commit**

```bash
git add src/i18n.ts
git commit -m "feat: add i18n keys for per-operation model settings"
```

---

### Task 3: Update `src/agent-runner.ts`

**Files:**
- Modify: `src/agent-runner.ts`

- [ ] **Step 1: Add `OpKey` to the import line**

Change:
```typescript
import type { LlmCallOptions, LlmClient, LlmWikiPluginSettings, RunEvent, RunRequest } from "./types";
```
To:
```typescript
import type { LlmCallOptions, LlmClient, LlmWikiPluginSettings, OpKey, RunEvent, RunRequest } from "./types";
```

- [ ] **Step 2: Replace `buildOpts()` with `buildOptsFor(op)`**

Remove the entire `private buildOpts()` method and add:

```typescript
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
```

- [ ] **Step 3: Update `run()` to use `buildOptsFor`**

Replace the entire `run()` method body with:

```typescript
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
        yield* runInit(req.args, this.vaultTools, this.llm, model, domains, repoRoot, this.vaultName, this.domainMapDir, req.signal, opts);
        break;
      default: {
        const start = Date.now();
        yield { kind: "error", message: `Unknown operation: ${req.operation}` };
        yield { kind: "result", durationMs: Date.now() - start, text: "" };
      }
    }
  }
```

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: all 51 tests pass (agent-runner integration tests check `kind: "system"` which still works)

- [ ] **Step 5: Commit**

```bash
git add src/agent-runner.ts
git commit -m "feat: replace buildOpts() with buildOptsFor(op) for per-operation model selection"
```

---

### Task 4: Update `src/claude-cli-client.ts`

**Files:**
- Modify: `src/claude-cli-client.ts`

- [ ] **Step 1: Fix `_create` to use `params.model` with cfg fallback**

In the `_create` method, locate:
```typescript
    const { iclaudePath, model, maxTokens, requestTimeoutSec } = this.cfg;
    const args: string[] = ["-p", userText, "--output-format", "stream-json", "--verbose"];
    if (model) args.push("--model", model);
```

Replace with:
```typescript
    const model = (params as { model?: string }).model || this.cfg.model;
    const { iclaudePath, maxTokens, requestTimeoutSec } = this.cfg;
    const args: string[] = ["-p", userText, "--output-format", "stream-json", "--verbose"];
    if (model) args.push("--model", model);
```

- [ ] **Step 2: Run tests**

Run: `npm test`
Expected: all 51 tests pass (existing test calls `create({ model: "sonnet", ... })` so `params.model = "sonnet"` — same behavior as before)

- [ ] **Step 3: Commit**

```bash
git add src/claude-cli-client.ts
git commit -m "fix: use params.model in ClaudeCliClient so per-operation model flows to CLI --model flag"
```

---

### Task 5: Update `src/main.ts` — deep-merge operations in `loadSettings`

**Files:**
- Modify: `src/main.ts`

The current shallow spread `claudeAgent: { ...DEFAULT_SETTINGS.claudeAgent, ...savedClaudeAgent }` shares the `operations` object reference from DEFAULT_SETTINGS when saved data has no `operations` field (fresh install). UI `onChange` handlers mutate `operations[key].model` directly, which would corrupt DEFAULT_SETTINGS. Fix by deep-merging each operation config.

- [ ] **Step 1: Replace the `loadSettings` method**

```typescript
  async loadSettings(): Promise<void> {
    const data = (await this.loadData()) as Record<string, unknown> | null;

    const caData = (data?.claudeAgent as Record<string, unknown>) ?? {};
    const naData = (data?.nativeAgent as Record<string, unknown>) ?? {};
    const caOps = (caData.operations as Record<string, unknown>) ?? {};
    const naOps = (naData.operations as Record<string, unknown>) ?? {};

    const defCA = DEFAULT_SETTINGS.claudeAgent;
    const defNA = DEFAULT_SETTINGS.nativeAgent;

    this.settings = {
      ...DEFAULT_SETTINGS,
      ...(data ?? {}),
      timeouts: { ...DEFAULT_SETTINGS.timeouts, ...((data?.timeouts as object) ?? {}) },
      claudeAgent: {
        ...defCA,
        ...caData,
        operations: {
          ingest: { ...defCA.operations.ingest, ...((caOps.ingest as object) ?? {}) },
          query:  { ...defCA.operations.query,  ...((caOps.query  as object) ?? {}) },
          lint:   { ...defCA.operations.lint,   ...((caOps.lint   as object) ?? {}) },
          init:   { ...defCA.operations.init,   ...((caOps.init   as object) ?? {}) },
        },
      },
      nativeAgent: {
        ...defNA,
        ...naData,
        operations: {
          ingest: { ...defNA.operations.ingest, ...((naOps.ingest as object) ?? {}) },
          query:  { ...defNA.operations.query,  ...((naOps.query  as object) ?? {}) },
          lint:   { ...defNA.operations.lint,   ...((naOps.lint   as object) ?? {}) },
          init:   { ...defNA.operations.init,   ...((naOps.init   as object) ?? {}) },
        },
      },
      history: (data?.history as RunHistoryEntry[]) ?? [],
    } as LlmWikiPluginSettings;

    // Миграция: поля, перенесённые с per-backend уровня на top-level (schema v2)
    if (!data?.systemPrompt && (caData.systemPrompt || naData.systemPrompt))
      this.settings.systemPrompt = (caData.systemPrompt ?? naData.systemPrompt) as string;
    if (!data?.domainMapDir && (caData.domainMapDir || naData.domainMapDir))
      this.settings.domainMapDir = (caData.domainMapDir ?? naData.domainMapDir) as string;
    if (!data?.maxTokens && (caData.maxTokens || naData.maxTokens))
      this.settings.maxTokens = (caData.maxTokens ?? naData.maxTokens) as number;

    // Миграция с claude-code backend
    if ((data?.backend as string) === "claude-code") {
      this.settings.backend = "claude-agent";
      if (data.iclaudePath && !this.settings.claudeAgent.iclaudePath)
        this.settings.claudeAgent.iclaudePath = data.iclaudePath as string;
      if (data.model && !this.settings.claudeAgent.model)
        this.settings.claudeAgent.model = data.model as string;
    }
  }
```

- [ ] **Step 2: Run tests**

Run: `npm test`
Expected: all 51 tests pass

- [ ] **Step 3: Commit**

```bash
git add src/main.ts
git commit -m "fix: deep-merge operations in loadSettings to avoid shared mutable DEFAULT_SETTINGS references"
```

---

### Task 6: Update `src/settings.ts`

**Files:**
- Modify: `src/settings.ts`

- [ ] **Step 1: Add `OpKey` to the types import**

Change:
```typescript
import type { LlmWikiPluginSettings } from "./types";
```
To:
```typescript
import type { LlmWikiPluginSettings, OpKey } from "./types";
```

- [ ] **Step 2: Replace the entire `display()` method with the new implementation**

```typescript
  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    const s = this.plugin.settings;
    const T = i18n();

    containerEl.createEl("h2", { text: "LLM Wiki" });

    // ── General settings ───────────────────────────────────────────────────
    containerEl.createEl("h3", { text: T.settings.h3_general });

    new Setting(containerEl)
      .setName(T.settings.systemPrompt_name)
      .setDesc(T.settings.systemPrompt_desc)
      .addTextArea((t) => {
        t.inputEl.style.minHeight = "96px";
        t.inputEl.style.width = "100%";
        t.setValue(s.systemPrompt)
          .onChange(async (v) => { s.systemPrompt = v; await this.plugin.saveSettings(); });
        return t;
      });

    const isPerOp = s.backend === "claude-agent" ? s.claudeAgent.perOperation : s.nativeAgent.perOperation;
    if (!isPerOp) {
      new Setting(containerEl)
        .setName(T.settings.maxTokens_name)
        .setDesc(T.settings.maxTokens_desc)
        .addText((t) =>
          t.setPlaceholder("4096")
            .setValue(String(s.maxTokens))
            .onChange(async (v) => {
              const n = Number(v);
              if (Number.isFinite(n) && n > 0) { s.maxTokens = Math.floor(n); await this.plugin.saveSettings(); }
            }),
        );
    }

    new Setting(containerEl)
      .setName(T.settings.domainMapDir_name)
      .setDesc(T.settings.domainMapDir_desc)
      .addText((t) =>
        t.setPlaceholder(T.settings.domainMapDir_placeholder)
          .setValue(s.domainMapDir)
          .onChange(async (v) => { s.domainMapDir = v.trim(); await this.plugin.saveSettings(); }),
      );

    new Setting(containerEl)
      .setName(T.settings.timeouts_name)
      .setDesc(T.settings.timeouts_desc)
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
      .setName(T.settings.historyLimit_name)
      .setDesc(T.settings.historyLimit_desc)
      .addText((t) =>
        t.setValue(String(s.historyLimit))
          .onChange(async (v) => {
            const n = Number(v);
            if (Number.isFinite(n) && n > 0) { s.historyLimit = Math.floor(n); await this.plugin.saveSettings(); }
          }),
      );

    new Setting(containerEl)
      .setName(T.settings.agentLog_name)
      .setDesc(T.settings.agentLog_desc)
      .addText((t) =>
        t.setPlaceholder("/tmp/llm-wiki-agent.jsonl")
          .setValue(s.agentLogPath)
          .onChange(async (v) => { s.agentLogPath = v.trim(); await this.plugin.saveSettings(); }),
      );

    // ── Backend settings ───────────────────────────────────────────────────
    containerEl.createEl("h3", { text: T.settings.h3_backend });

    new Setting(containerEl)
      .setName(T.settings.backend_name)
      .setDesc(T.settings.backend_desc)
      .addDropdown((d) =>
        d.addOption("claude-agent", T.settings.claudeCodeAgent)
          .addOption("native-agent", T.settings.nativeAgent)
          .setValue(s.backend)
          .onChange(async (v) => {
            s.backend = v as LlmWikiPluginSettings["backend"];
            await this.plugin.saveSettings();
            this.display();
          }),
      );

    if (s.backend === "claude-agent") {
      new Setting(containerEl)
        .setName(T.settings.iclaudePath_name)
        .setDesc(T.settings.iclaudePath_desc)
        .addText((t) =>
          t.setPlaceholder("/home/user/Documents/Project/iclaude/iclaude.sh")
            .setValue(s.claudeAgent.iclaudePath)
            .onChange(async (v) => { s.claudeAgent.iclaudePath = v.trim(); await this.plugin.saveSettings(); }),
        );

      if (!s.claudeAgent.perOperation) {
        new Setting(containerEl)
          .setName(T.settings.model_name)
          .setDesc(T.settings.model_desc_claude)
          .addText((t) =>
            t.setPlaceholder("sonnet")
              .setValue(s.claudeAgent.model)
              .onChange(async (v) => { s.claudeAgent.model = v.trim(); await this.plugin.saveSettings(); }),
          );
      }

      new Setting(containerEl)
        .setName(T.settings.perOperation_name)
        .setDesc(T.settings.perOperation_desc)
        .addToggle((t) =>
          t.setValue(s.claudeAgent.perOperation)
            .onChange(async (v) => { s.claudeAgent.perOperation = v; await this.plugin.saveSettings(); this.display(); }),
        );

      if (s.claudeAgent.perOperation) {
        const ops: Array<{ key: OpKey; label: string }> = [
          { key: "ingest", label: T.settings.op_ingest },
          { key: "query",  label: T.settings.op_query },
          { key: "lint",   label: T.settings.op_lint },
          { key: "init",   label: T.settings.op_init },
        ];
        for (const { key, label } of ops) {
          containerEl.createEl("h5", { text: label });
          new Setting(containerEl)
            .setName(T.settings.opModel_name)
            .setDesc(T.settings.opModel_desc)
            .addText((t) =>
              t.setValue(s.claudeAgent.operations[key].model)
                .onChange(async (v) => { s.claudeAgent.operations[key].model = v.trim(); await this.plugin.saveSettings(); }),
            );
          new Setting(containerEl)
            .setName(T.settings.opMaxTokens_name)
            .setDesc(T.settings.opMaxTokens_desc)
            .addText((t) =>
              t.setValue(String(s.claudeAgent.operations[key].maxTokens))
                .onChange(async (v) => {
                  const n = Number(v);
                  if (Number.isFinite(n) && n > 0) { s.claudeAgent.operations[key].maxTokens = Math.floor(n); await this.plugin.saveSettings(); }
                }),
            );
        }
      }
    } else {
      new Setting(containerEl)
        .setName(T.settings.baseUrl_name)
        .setDesc(T.settings.baseUrl_desc)
        .addText((t) =>
          t.setPlaceholder("http://localhost:11434/v1")
            .setValue(s.nativeAgent.baseUrl)
            .onChange(async (v) => { s.nativeAgent.baseUrl = v.trim(); await this.plugin.saveSettings(); }),
        );

      new Setting(containerEl)
        .setName(T.settings.apiKey_name)
        .setDesc(T.settings.apiKey_desc)
        .addText((t) =>
          t.setPlaceholder("ollama")
            .setValue(s.nativeAgent.apiKey)
            .onChange(async (v) => { s.nativeAgent.apiKey = v.trim(); await this.plugin.saveSettings(); }),
        );

      if (!s.nativeAgent.perOperation) {
        new Setting(containerEl)
          .setName(T.settings.model_name)
          .setDesc(T.settings.model_desc_native)
          .addText((t) =>
            t.setPlaceholder("llama3.2")
              .setValue(s.nativeAgent.model)
              .onChange(async (v) => { s.nativeAgent.model = v.trim(); await this.plugin.saveSettings(); }),
          );

        new Setting(containerEl)
          .setName(T.settings.temperature_name)
          .setDesc(T.settings.temperature_desc)
          .addText((t) =>
            t.setPlaceholder("0.2")
              .setValue(String(s.nativeAgent.temperature))
              .onChange(async (v) => {
                const n = Number(v);
                if (Number.isFinite(n) && n >= 0 && n <= 2) { s.nativeAgent.temperature = n; await this.plugin.saveSettings(); }
              }),
          );
      }

      new Setting(containerEl)
        .setName(T.settings.perOperation_name)
        .setDesc(T.settings.perOperation_desc)
        .addToggle((t) =>
          t.setValue(s.nativeAgent.perOperation)
            .onChange(async (v) => { s.nativeAgent.perOperation = v; await this.plugin.saveSettings(); this.display(); }),
        );

      if (s.nativeAgent.perOperation) {
        const ops: Array<{ key: OpKey; label: string }> = [
          { key: "ingest", label: T.settings.op_ingest },
          { key: "query",  label: T.settings.op_query },
          { key: "lint",   label: T.settings.op_lint },
          { key: "init",   label: T.settings.op_init },
        ];
        for (const { key, label } of ops) {
          containerEl.createEl("h5", { text: label });
          new Setting(containerEl)
            .setName(T.settings.opModel_name)
            .setDesc(T.settings.opModel_desc)
            .addText((t) =>
              t.setValue(s.nativeAgent.operations[key].model)
                .onChange(async (v) => { s.nativeAgent.operations[key].model = v.trim(); await this.plugin.saveSettings(); }),
            );
          new Setting(containerEl)
            .setName(T.settings.opMaxTokens_name)
            .setDesc(T.settings.opMaxTokens_desc)
            .addText((t) =>
              t.setValue(String(s.nativeAgent.operations[key].maxTokens))
                .onChange(async (v) => {
                  const n = Number(v);
                  if (Number.isFinite(n) && n > 0) { s.nativeAgent.operations[key].maxTokens = Math.floor(n); await this.plugin.saveSettings(); }
                }),
            );
          new Setting(containerEl)
            .setName(T.settings.opTemperature_name)
            .setDesc(T.settings.opTemperature_desc)
            .addText((t) =>
              t.setValue(String(s.nativeAgent.operations[key].temperature))
                .onChange(async (v) => {
                  const n = Number(v);
                  if (Number.isFinite(n) && n >= 0 && n <= 2) { s.nativeAgent.operations[key].temperature = n; await this.plugin.saveSettings(); }
                }),
            );
        }
      }

      new Setting(containerEl)
        .setName(T.settings.topP_name)
        .setDesc(T.settings.topP_desc)
        .addText((t) =>
          t.setPlaceholder("(отключено)")
            .setValue(s.nativeAgent.topP != null ? String(s.nativeAgent.topP) : "")
            .onChange(async (v) => {
              const trimmed = v.trim();
              if (!trimmed) { s.nativeAgent.topP = null; }
              else { const n = Number(trimmed); if (Number.isFinite(n) && n >= 0 && n <= 1) s.nativeAgent.topP = n; }
              await this.plugin.saveSettings();
            }),
        );

      new Setting(containerEl)
        .setName(T.settings.numCtx_name)
        .setDesc(T.settings.numCtx_desc)
        .addText((t) =>
          t.setPlaceholder("(дефолт модели)")
            .setValue(s.nativeAgent.numCtx != null ? String(s.nativeAgent.numCtx) : "")
            .onChange(async (v) => {
              const trimmed = v.trim();
              if (!trimmed) { s.nativeAgent.numCtx = null; }
              else { const n = Number(trimmed); if (Number.isFinite(n) && n > 0) s.nativeAgent.numCtx = Math.floor(n); }
              await this.plugin.saveSettings();
            }),
        );
    }
  }
```

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: all 51 tests pass

- [ ] **Step 4: Commit**

```bash
git add src/settings.ts
git commit -m "feat: add per-operation model/maxTokens/temperature toggle in settings UI"
```

---

### Task 7: Bump version and build

**Files:**
- Modify: `package.json`, `manifest.json`

- [ ] **Step 1: Bump patch version 0.1.12 → 0.1.13 in `package.json`**

In `package.json`, change:
```json
"version": "0.1.12"
```
To:
```json
"version": "0.1.13"
```

- [ ] **Step 2: Bump patch version in `manifest.json`**

In `manifest.json`, change:
```json
"version": "0.1.12"
```
To:
```json
"version": "0.1.13"
```

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: exits 0, `dist/main.js` updated

- [ ] **Step 4: Run final test suite**

Run: `npm test`
Expected: all 51 tests pass

- [ ] **Step 5: Commit**

```bash
git add package.json manifest.json dist/main.js
git commit -m "chore: bump version to 0.1.13, build per-operation models feature"
```
