# Per-Operation Model Configuration

**Date:** 2026-04-29  
**Status:** Approved

## Overview

Add per-operation model configuration to both `claude-agent` and `native-agent` backends. Each backend gets a toggle: "single model for all operations" vs "per-operation models". When per-operation is enabled, each of the four operations (ingest, query, lint, init) has its own model, maxTokens, and temperature (native-agent only).

## Motivation

Different operations have different cost/quality tradeoffs:
- `ingest` — heavy reading, can be fast/cheap (haiku, small local model)
- `query` — user-facing, needs quality (sonnet, larger model)
- `lint` — structural checking, can be fast/cheap
- `init` — one-time, complex reasoning, can afford stronger model (opus)

## Data Structure

### New interfaces in `src/types.ts`

```typescript
interface ClaudeOperationConfig {
  model: string;
  maxTokens: number;
}

interface NativeOperationConfig {
  model: string;
  maxTokens: number;
  temperature: number;
}

type OpMap<T> = { ingest: T; query: T; lint: T; init: T };
```

### Updated `claudeAgent` config

```typescript
claudeAgent: {
  iclaudePath: string;
  model: string;              // used when perOperation = false
  perOperation: boolean;
  operations: OpMap<ClaudeOperationConfig>;
}
```

### Updated `nativeAgent` config

```typescript
nativeAgent: {
  baseUrl: string;
  apiKey: string;
  model: string;              // used when perOperation = false
  temperature: number;        // used when perOperation = false
  topP: number | null;        // always global
  numCtx: number | null;      // always global
  perOperation: boolean;
  operations: OpMap<NativeOperationConfig>;
}
```

### Global `maxTokens`

`LlmWikiPluginSettings.maxTokens` remains global. It is used (and shown in UI) only when the active backend has `perOperation = false`. When `perOperation = true`, each operation's `maxTokens` field is used instead.

### Default values

```typescript
claudeAgent: {
  iclaudePath: "",
  model: "sonnet",
  perOperation: false,
  operations: {
    ingest: { model: "haiku", maxTokens: 4096 },
    query:  { model: "sonnet", maxTokens: 4096 },
    lint:   { model: "haiku", maxTokens: 4096 },
    init:   { model: "sonnet", maxTokens: 8192 },
  },
}

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
}
```

## Component Changes

### `src/agent-runner.ts`

Replace `buildOpts()` with `buildOptsFor(op: WikiOperation)` that returns `{ model: string; opts: LlmCallOptions }`:

```typescript
private buildOptsFor(op: WikiOperation): { model: string; opts: LlmCallOptions } {
  const key = (op === "query-save" ? "query" : op) as keyof OpMap<unknown>;
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

In `run()`, replace the separate `model` variable with the result of `buildOptsFor(req.operation)`.

### `src/claude-cli-client.ts`

`ClaudeCliClient` currently ignores `params.model` and uses `this.cfg.model`. Fix to use `params.model` with cfg fallback:

```typescript
// was
const { iclaudePath, model, maxTokens, requestTimeoutSec } = this.cfg;

// becomes
const model = (params as { model?: string }).model || this.cfg.model;
const { iclaudePath, maxTokens, requestTimeoutSec } = this.cfg;
```

`this.cfg.model` can remain as an empty string (backward compatible fallback).

### `src/settings.ts`

Toggle `perOperation` triggers `this.display()` re-render (same pattern as backend toggle).

**claude-agent section — perOperation = false:**
```
Path to iclaude.sh  [text]
Model               [text]
Per-operation models [toggle]
```

**claude-agent section — perOperation = true:**
```
Path to iclaude.sh  [text]
Per-operation models [toggle]
[h5] Ingest — Model [text], Max tokens [text]
[h5] Query  — Model [text], Max tokens [text]
[h5] Lint   — Model [text], Max tokens [text]
[h5] Init   — Model [text], Max tokens [text]
```

**native-agent section — perOperation = false:** same as now (model, temperature visible).  
**native-agent section — perOperation = true:** model + temperature hidden, 4 sections each with model + maxTokens + temperature. `topP` and `numCtx` remain visible always.

**Global maxTokens:** visible only when active backend has `perOperation = false`.

## Files Touched

| File | Change |
|---|---|
| `src/types.ts` | New interfaces, extended `claudeAgent`/`nativeAgent` in `LlmWikiPluginSettings` and `DEFAULT_SETTINGS` |
| `src/settings.ts` | Toggle + conditional per-operation sections |
| `src/agent-runner.ts` | `buildOpts()` → `buildOptsFor(op)` |
| `src/claude-cli-client.ts` | Use `params.model` instead of `this.cfg.model` |

## Out of Scope

- `topP` and `numCtx` remain global for native-agent (not per-operation)
- No changes to phase files, stream parser, or tests
- No migration script needed — `Object.assign` in plugin load handles missing fields with defaults
