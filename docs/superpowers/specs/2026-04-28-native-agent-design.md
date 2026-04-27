# Native Agent — Design Spec

**Date:** 2026-04-28  
**Status:** Approved

## Цель

Добавить в плагин `obsidian-llm-wiki` второй backend — нативный агент, работающий с любым OpenAI-compatible провайдером (Ollama, OpenAI, OpenRouter, LM Studio). Существующий `IclaudeRunner` (через `iclaude.sh`) остаётся без изменений. Пользователь переключается между backend'ами в настройках.

## Архитектура

### Схема потока

```
WikiController.dispatch(op, args)
  ├─ backend = "claude-code"  → IclaudeRunner (существующий, без изменений)
  └─ backend = "native-agent" → AgentRunner (новый)
                                    ├─ VaultTools (Obsidian Vault API)
                                    └─ openai client (configurable baseURL + apiKey)
                                        → Ollama / OpenAI / OpenRouter / LM Studio
```

`LlmWikiView`, история операций, cancel — не изменяются. `AgentRunner` реализует тот же интерфейс что и `IclaudeRunner`:

```typescript
execute(req: RunnerRequest, signal: AbortSignal): AsyncGenerator<RunEvent>
```

### Новые файлы

| Файл | Роль |
|---|---|
| `src/agent-runner.ts` | AgentRunner — фазовая оркестрация + LLM-вызовы |
| `src/vault-tools.ts` | VaultTools — обёртки над `app.vault` API: read, write, list, search (readAll + regex match) |
| `src/phases/ingest.ts` | Фаза ingest: читать источник → LLM синтез → писать wiki |
| `src/phases/query.ts` | Фаза query: поиск по wiki → LLM ответ → опционально сохранить |
| `src/phases/lint.ts` | Фаза lint: структурные проверки (TS) + семантические (LLM) |
| `src/phases/init.ts` | Фаза init: discovery источников → LLM bootstrap domain-map |

### Изменяемые файлы

| Файл | Что меняется |
|---|---|
| `src/types.ts` | Добавить `backend`, `nativeAgent` в `LlmWikiPluginSettings` |
| `src/settings.ts` | Секция "Native Agent" в UI (baseUrl, apiKey, model, переключатель) |
| `src/controller.ts` | Роутинг к `AgentRunner` или `IclaudeRunner` по `settings.backend` |

### Зависимость

Добавить `openai` npm (OpenAI-compatible client, ≈100KB).

## Гибридная оркестрация

TypeScript управляет фазами, LLM делает только "умные" шаги через **прямые completions** (не agentic tool-calling loops). Локальные модели без function calling поддерживаются.

### ingest

```
1. VaultTools.read(sourceFile)
2. VaultTools.read(domain-map.json)
3. VaultTools.listFiles("!Wiki/<domain>/")
4. LLM completion: extractAndSynthesize(source, existingPages) → новый контент страниц
5. VaultTools.write(wikiPages)
```

### query / query-save

```
1. VaultTools.listFiles("!Wiki/<domain>/")
2. VaultTools.readAll(files) → читаем все страницы домена
3. LLM completion: synthesizeAnswer(question, allPages) → ответ
   (для больших доменов — truncate по токенам до context limit)
4. (query-save) VaultTools.write(answerPage)
```

### lint

```
1. VaultTools.listFiles("!Wiki/<domain>/")
2. TypeScript: проверка frontmatter, dead links, orphans
3. LLM completion: evaluateContentQuality(pages) → семантические замечания
4. yield RunEvent{type: "result", text: report}
```

### init

```
1. VaultTools.listFiles(sourcePaths)
2. LLM completion: bootstrapEntityTypes(fileSamples) → domain-map skeleton
3. VaultTools.write(domain-map.json)
```

## RunEvent-поток

`AgentRunner` yields те же события что `IclaudeRunner`:

```
{type: "system",         subtype: "init", model: "...", cwd: "..."}
{type: "tool_use",       name: "Read",    input: {path}}
{type: "tool_result",    ok: true,        preview: "..."}
{type: "assistant_text", delta: "..."}
{type: "result",         durationMs, usdCost: 0, text: "..."}
{type: "error",          message: "..."}
```

## Настройки

### Новые поля в `LlmWikiPluginSettings`

```typescript
backend: "claude-code" | "native-agent";  // default: "claude-code"

nativeAgent: {
  baseUrl: string;   // default: "http://localhost:11434/v1"
  apiKey:  string;   // default: "ollama"
  model:   string;   // default: "llama3.2"
};
```

### Обратная совместимость

Дефолт `backend: "claude-code"` — существующие пользователи не замечают изменений.

## Обработка ошибок и ограничения

### Vault API: только файлы внутри vault

Source-файлы вне vault недоступны. При `backend = "native-agent"`, если путь источника вне vault — операция прерывается с `RunEvent{type: "error", message: "..."}`.

### Стриминг

`openai` client с `stream: true`. Fallback на `stream: false` при ошибке стриминга. В обоих случаях yield `assistant_text` delta-events.

### Таймауты и cancel

Используем существующие `settings.timeouts.*`. `AgentRunner` принимает тот же `AbortSignal` из `WikiController` — cancel работает одинаково для обоих runner'ов.

### Стоимость

`usdCost = 0` для локальных моделей. Для облачных — вычисляется из `usage.prompt_tokens` если провайдер возвращает `usage`.

## Тестирование

| Файл | Что тестирует |
|---|---|
| `tests/vault-tools.test.ts` | VaultTools с mock `app.vault` — read, write, list, search |
| `tests/agent-runner.integration.test.ts` | AgentRunner с mock openai client — события, abort, ошибки |
| `tests/phases/ingest.test.ts` | Фаза ingest: промпт → write-вызовы |
| `tests/phases/query.test.ts` | Фаза query: search → LLM → result event |

### Mock-стратегия

- `app.vault` — мокается через существующий `vitest.mock.ts`
- `openai` client — `vi.mock('openai')`, фиксированные completions
- Никаких внешних HTTP-запросов в тестах
