# Obsidian Plugin Review Fixes — Design Spec

**Date:** 2026-04-28  
**PR:** https://github.com/obsidianmd/obsidian-releases/pull/12351  
**Scope:** Address all ObsidianReviewBot required findings to unblock community plugin approval.

---

## Overview

The PR has 10 categories of required changes flagged by ObsidianReviewBot. All are mechanical fixes — no architectural changes. Additionally, all Russian UI strings must be translated to English with sentence case formatting.

---

## 1. Union type cleanup

**Files:** `src/controller.ts:52`, and any modals using `string | "all"`

`string | "all"` is semantically incorrect — the literal `"all"` is already a subtype of `string` and adds nothing to the union. Replace with plain `string`.

---

## 2. Remove unnecessary `async`

**Files:**
- `src/controller.ts` — `toVaultPath` method: no `await` inside, remove `async`
- `src/view.ts` — `onOpen` (L47) and `onClose` (L141): no `await` inside, remove `async` and change return type from `Promise<void>` to `void`

---

## 3. Unhandled promises — add `void`

**Files:** `src/controller.ts:200`, `src/main.ts:21`, `src/view.ts:329`

These are fire-and-forget calls. Mark with `void` operator to signal intentional non-handling:
```ts
void someAsyncCall();
```
If any of the three actually needs error surfacing, add `.catch(e => console.error("[llm-wiki]", e))` instead.

---

## 4. Replace `console.log` with `console.debug`

**File:** `src/main.ts:83,88`

Obsidian only permits `console.warn`, `console.error`, `console.debug`. Replace both `console.log` calls with `console.debug`.

---

## 5. Remove unnecessary type assertions

**Files:** `src/main.ts:71`, `src/view.ts:247` (line numbers may shift — search by pattern)

- `src/main.ts` — `d as string` in the Init command callback. The `d` parameter comes from `DomainModal` which already types it as `string`; the cast is redundant.
- `src/view.ts` — locate with `grep -n " as "` and remove where TS can infer the type without narrowing loss.

---

## 6. Heading via `setHeading()`

**File:** `src/settings.ts:17`

Replace:
```ts
containerEl.createEl("h2", { text: "LLM Wiki" });
```
With:
```ts
new Setting(containerEl).setName("LLM Wiki").setHeading();
```

---

## 7. Remove inline style manipulation

**File:** `src/view.ts:131,206,293,307`

Replace all `element.style.display = "none"` / `element.style.display = ""` with CSS class toggling:

```ts
// Instead of:
this.stepsEl.style.display = "none";
this.stepsEl.style.display = "";

// Use:
this.stepsEl.addClass("llm-wiki-hidden");
this.stepsEl.removeClass("llm-wiki-hidden");
```

Add to `styles.css`:
```css
.llm-wiki-hidden {
  display: none;
}
```

---

## 8. Fix `any` types in `stream.ts`

**File:** `src/stream.ts:14,39,63,71`

Replace `any` with `unknown`. Add a local type guard for safe field access:

```ts
function isRecord(obj: unknown): obj is Record<string, unknown> {
  return typeof obj === "object" && obj !== null;
}
```

Use `isRecord(obj)` before accessing fields like `obj.type`, `obj.subtype`, etc.

---

## 9. Fix unnecessary escape in regex

**File:** `src/domain-map.ts:62`

`\-` inside a character class `[...]` is unnecessary. Change `[\p{L}\p{N}_\-]` to `[\p{L}\p{N}_-]`.

---

## 10. Translate UI to English with sentence case

**Rule:** All user-visible strings must be in English. Sentence case = only the first word and proper nouns capitalized.

### `src/view.ts` — Notice messages and button labels

| Russian | English |
|---------|---------|
| `"Нет активного файла"` | `"No active file"` |
| `"Выберите конкретный домен для init"` | `"Select a specific domain for init"` |
| `"cwd не задан"` | `"Working directory is not set"` |
| `"Введите вопрос"` | `"Enter a question"` |
| `"Уже выполняется операция"` | `"Operation already in progress"` |
| `"Домен:"` | `"Domain:"` |
| `"↻"` title `"Перечитать domain-map.json"` | `"Reload domain-map.json"` |
| `"+ Домен"` | `"Add domain"` |

### `src/settings.ts` — Setting names and descriptions

| Russian | English |
|---------|---------|
| `'Выберите бэкенд для выполнения операций.'` (setDesc) | `"Choose the backend for running operations."` |
| `"Путь к Claude Code"` | `"Claude Code path"` |
| `"Обязательно. Полный абсолютный путь к iclaude.sh / iclaude / claude."` | `"Required. Absolute path to iclaude.sh / iclaude / claude."` |
| `"Путь к навыку llm-wiki"` | `"LLM Wiki skill path"` |
| `"Обязательно. Полный абсолютный путь к папке навыка (содержит shared/domain-map.json)."` | `"Required. Absolute path to the skill folder (contains shared/domain-map.json)."` |
| `"Список через запятую. По умолчанию: Read,Edit,Write,Glob,Grep"` | `"Comma-separated list. Default: Read,Edit,Write,Glob,Grep"` |
| `"Модель"` (Claude section) | `"Model"` |
| `"Передаётся claude как --model. Пресет, либо введите произвольный ID (claude-opus-4-7 и т.п.)."` | `"Passed to claude as --model. Use a preset or enter a custom ID (e.g. claude-opus-4-7)."` |
| `"Таймауты (секунды)"` | `"Timeouts (seconds)"` |
| `"ingest / query / lint / init"` | keep as-is (already English) |
| `"Показывать raw JSON в панели"` | `"Show raw JSON in panel"` |
| `"OpenAI-compatible endpoint. Ollama: http://localhost:11434/v1"` | keep as-is |
| `'Для Ollama введите "ollama". Для OpenAI — ключ sk-...'` | `'For Ollama enter "ollama". For OpenAI — key sk-...'` |
| `"Модель"` (OpenAI section) | `"Model"` |
| `"Имя модели: llama3.2, mistral, gpt-4o и т.п."` | `"Model name: llama3.2, mistral, gpt-4o, etc."` |
| `"0.0–1.0. Низкая (0.1–0.3) — точные факты, высокая — творческий стиль."` | `"0.0–1.0. Low (0.1–0.3) — factual, high — creative."` |
| `"Максимум токенов в ответе. Для вики-страниц рекомендуется ≥ 4096."` | `"Max tokens in response. For wiki pages ≥ 4096 recommended."` |
| `"0.0–1.0, или пусто — отключить. Альтернатива temperature (nucleus sampling)."` | `"0.0–1.0, or empty to disable. Alternative to temperature (nucleus sampling)."` |
| `"Request timeout (сек)"` | `"Request timeout (s)"` |
| `"Таймаут HTTP-запроса к LLM. Для Ollama на больших моделях рекомендуется 300+."` | `"HTTP request timeout for the LLM. For Ollama on large models 300+ recommended."` |
| `"num_ctx (Ollama)"` | keep as-is |
| `"Размер контекста модели. Только Ollama. Пусто — использовать дефолт модели."` | `"Model context size. Ollama only. Empty — use model default."` |
| `"Добавляется в начало системного промпта каждой операции. Перезаписывает дефолт при изменении."` | `"Prepended to the system prompt for every operation. Overrides the default when set."` |
| `"Папка domain-map"` | `"Domain map folder"` |
| `"Где хранить domain-map-<vault>.json. Пусто — авто: <vault>/.obsidian/plugins/llm-wiki/"` | `"Where to store domain-map-<vault>.json. Empty — auto: <vault>/.obsidian/plugins/llm-wiki/"` |
| `"Лимит истории"` | `"History limit"` |
| `"Максимум операций в истории боковой панели."` | `"Maximum operations kept in sidebar history."` |
| `"Лог агента (JSONL)"` | `"Agent log (JSONL)"` |
| `"Абсолютный путь к файлу лога. Каждый RunEvent пишется как одна JSON-строка. Пусто — логирование отключено."` | `"Absolute path to the log file. Each RunEvent written as one JSON line. Empty — logging disabled."` |

### `src/main.ts` and `src/controller.ts`

Translate any Russian Notice messages or log strings found in these files.

---

## Testing

After all changes:

1. `npm run build` — must complete without TypeScript errors
2. `npm test` — all existing tests must pass
3. Manual smoke: open Obsidian, verify sidebar renders correctly (steps collapse/expand via CSS class, not inline style)
4. Re-check that no `console.log` calls remain: `grep -rn "console\.log" src/`

---

## Out of scope

- No logic changes
- No new features
- No test additions (existing tests cover the affected code paths)
