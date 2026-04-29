# Claude-Agent Backend — Design Spec

**Date:** 2026-04-29  
**Status:** Approved

## Цель

Заменить backend `claude-code` (IclaudeRunner + iclaude.sh + skillPath) на `claude-agent`, который использует тот же процесс `claude`/`iclaude.sh` как LLM-провайдер — без привязки к навыкам и без `skillPath`. Оркестрацию берут на себя TypeScript-фазы (AgentRunner), как в `native-agent`. Итог: два backend — `"claude-agent"` и `"native-agent"`.

## Архитектура

### Схема потока

```
controller.dispatch()
  ├─ "claude-agent"  → AgentRunner(ClaudeCliClient)
  └─ "native-agent"  → AgentRunner(OpenAI client)        ← без изменений
```

`IclaudeRunner` удаляется. `AgentRunner` и все фазы работают через единый тип `LlmClient`.

### Новый тип `LlmClient`

В `src/types.ts` добавляется минимальный интерфейс, описывающий только то, что фазы реально используют:

```typescript
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
```

`OpenAI` из npm удовлетворяет этому типу структурно. `ClaudeCliClient` реализует его явно.

### `AgentRunner`

Конструктор принимает `llm: LlmClient` как первый аргумент вместо создания `OpenAI`-клиента внутри. Создание клиента переносится в `controller.buildAgentRunner()`.

`buildOpts()` становится backend-aware:
```typescript
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
```

Остальное без изменений.

### Фазы (`src/phases/*.ts`)

`llm: OpenAI` → `llm: LlmClient` в сигнатурах. Логика не меняется.

## `ClaudeCliClient`

**Файл:** `src/claude-cli-client.ts`

```typescript
interface ClaudeCliConfig {
  iclaudePath: string;
  model: string;
  maxTokens: number;
  requestTimeoutSec: number;
}
```

### Алгоритм `chat.completions.create(params, opts?)`

1. Из `params.messages` извлечь системный контент (все `role:"system"`) и пользовательский (последний `role:"user"`). Системный промпт из `claudeAgent.systemPrompt` уже включён в messages через `buildOpts()` → `buildChatParams()`.
2. Собрать аргументы spawn (без shell-интерпретации):
   ```
   ["-p", userContent, "--output-format", "stream-json", "--verbose",
    "--model", model, "--max-tokens", String(maxTokens)]
   ```
   Если системный контент непустой: добавить `["--system", systemContent]`.
4. `spawn(iclaudePath, args, { stdio: ["ignore", "pipe", "pipe"] })`.
5. Abort через `signal` → SIGTERM → 3000ms grace → SIGKILL (аналогично существующему `IclaudeRunner`).
6. Построчно читать stdout → `parseStreamLine(line)`.
7. Фильтровать `kind:"assistant_text"` → конвертировать в `ChatCompletionChunk`.
8. При `stream: true` — AsyncGenerator чанков.
9. При `stream: false` (fallback) — накопить весь текст, вернуть `ChatCompletion`.

### Конвертация RunEvent → OpenAI chunk

```
{ kind:"assistant_text", delta:"..." }
→ { id:"cc-...", object:"chat.completion.chunk", model:"", created:0,
    choices:[{ index:0, delta:{ content:"..." }, finish_reason:null }] }
```

Финальный чанк: `finish_reason:"stop"`, `delta:{}`.

### Ограничения

- Multi-turn messages не нужны в текущих фазах (всегда system+user). Берём только последний `user`-message.
- `temperature`, `top_p`, `num_ctx` — не передаются в claude CLI (параметры модели управляются через Claude Code настройки).

## Настройки

### Изменения в `LlmWikiPluginSettings`

**Удалить:**
```typescript
iclaudePath: string;      // переезжает в claudeAgent
cwd: string;              // skillPath — убирается полностью
allowedTools: string[];   // убирается
model: string;            // top-level claude model — убирается
showRawJson: boolean;     // убирается
```

**Добавить:**
```typescript
claudeAgent: {
  iclaudePath: string;        // путь к claude / iclaude.sh
  model: string;              // "sonnet", "claude-sonnet-4-6", ...
  domainMapDir: string;       // "" = авто: <vault>/.obsidian/plugins/llm-wiki/
  systemPrompt: string;       // добавляется к системному контенту через buildOpts()
  maxTokens: number;          // default: 4096
  requestTimeoutSec: number;  // default: 300
};
```

**Изменить:**
```typescript
backend: "claude-agent" | "native-agent";  // дефолт: "claude-agent"
```

### Дефолты `DEFAULT_SETTINGS`

```typescript
backend: "claude-agent",
claudeAgent: {
  iclaudePath: "",
  model: "",
  domainMapDir: "",
  systemPrompt: "",
  maxTokens: 4096,
  requestTimeoutSec: 300,
},
```

### UI (`settings.ts`)

Секция `claude-code` заменяется секцией `claude-agent` с полями: `iclaudePath`, `model`, `maxTokens`, `systemPrompt`, `domainMapDir`, `requestTimeoutSec`. Список `allowedTools` убирается. Таймауты операций (`timeouts.*`) остаются на верхнем уровне (общие для обоих backend).

## `controller.ts`

### Упрощение

**Убираются:**
- `requireSkillPath()`
- `resolveCwd()`
- `cwdOrEmpty()`
- Ветка `backend === "claude-code"` во всех методах
- Импорт `IclaudeRunner`

**`requireClaudeAgent()`** — проверяет только `claudeAgent.iclaudePath`:
```typescript
private requireClaudeAgent(): string | null {
  const p = this.plugin.settings.claudeAgent.iclaudePath;
  if (!p || !existsSync(p)) {
    new Notice("Укажите путь к Claude Code в настройках");
    return null;
  }
  return p;
}
```

**`resolveDomainMapDir()`** — оба backend используют vault-based путь:
```typescript
private resolveDomainMapDir(): string {
  const dir = this.plugin.settings.backend === "claude-agent"
    ? this.plugin.settings.claudeAgent.domainMapDir
    : this.plugin.settings.nativeAgent.domainMapDir;
  if (dir) return dir;
  const base = (this.app.vault.adapter as { getBasePath?: () => string }).getBasePath?.() ?? "";
  return join(base, ".obsidian", "plugins", "llm-wiki");
}
```

**`buildAgentRunner()`** — создаёт нужный LLM-клиент:
```typescript
private buildAgentRunner(): AgentRunner {
  const adapter = this.app.vault.adapter as unknown as VaultAdapter;
  const base = (this.app.vault.adapter as { getBasePath?: () => string }).getBasePath?.() ?? "";
  const vaultTools = new VaultTools(adapter, base);
  const vaultName = this.app.vault.getName();
  const domains = readDomains(this.resolveDomainMapDir(), vaultName);

  const s = this.plugin.settings;
  const llm: LlmClient = s.backend === "claude-agent"
    ? new ClaudeCliClient(s.claudeAgent)
    : new OpenAI({
        baseURL: s.nativeAgent.baseUrl,
        apiKey: s.nativeAgent.apiKey,
        timeout: s.nativeAgent.requestTimeoutSec * 1000,
        dangerouslyAllowBrowser: true,
      });

  return new AgentRunner(llm, s, vaultTools, vaultName, domains);
}
```

**`dispatch()`** — проверка по backend:
```typescript
if (s.backend === "claude-agent" && !this.requireClaudeAgent()) return;
```

**`ingestActive()`** — `spawnCwd` убирается, путь к файлу всегда абсолютный:
```typescript
const abs = (this.app.vault.adapter as { getFullPath: (p: string) => string }).getFullPath(file.path);
await this.dispatch("ingest", [abs], domainId);
```

## Файлы

| Файл | Действие |
|---|---|
| `src/claude-cli-client.ts` | Создать |
| `src/types.ts` | Добавить `LlmClient`, `claudeAgent` settings; удалить `cwd`, `allowedTools`, top-level `model`, `showRawJson` |
| `src/agent-runner.ts` | Принимать `llm: LlmClient` как первый аргумент конструктора |
| `src/phases/ingest.ts` | `llm: OpenAI` → `llm: LlmClient` |
| `src/phases/query.ts` | `llm: OpenAI` → `llm: LlmClient` |
| `src/phases/lint.ts` | `llm: OpenAI` → `llm: LlmClient` |
| `src/phases/init.ts` | `llm: OpenAI` → `llm: LlmClient` |
| `src/controller.ts` | Заменить IclaudeRunner-ветку, упростить helpers |
| `src/settings.ts` | Убрать секцию claude-code, добавить секцию claude-agent |
| `src/runner.ts` | Удалить |
| `src/prompt.ts` | Удалить |
| `tests/runner.integration.test.ts` | Удалить |
| `tests/prompt.test.ts` | Удалить |
| `tests/claude-cli-client.test.ts` | Создать — тест spawn с mock claude процессом |

## Тестирование

| Файл | Что тестирует |
|---|---|
| `tests/claude-cli-client.test.ts` | Spawn с mock-процессом: streaming chunks, abort, ошибка spawn, non-streaming fallback |
| `tests/agent-runner.integration.test.ts` | Обновить — передавать `ClaudeCliClient` mock вместо openai mock |
| `tests/phases/*.test.ts` | Тип меняется `OpenAI` → `LlmClient` в mock-объектах; логика тестов не меняется |

## Обратная совместимость

При миграции настроек: если у пользователя `backend: "claude-code"`, при первой загрузке плагин переключает его на `"claude-agent"` и копирует `iclaudePath` из top-level в `claudeAgent.iclaudePath`.
