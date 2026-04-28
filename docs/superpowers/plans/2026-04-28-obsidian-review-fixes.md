# Obsidian Review Bot Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all ObsidianReviewBot required findings in PR #12351 to unblock community plugin approval.

**Architecture:** 10 categories of mechanical fixes across 6 files — no logic changes. Tasks grouped by theme (type system, async, CSS, i18n) for clean commit boundaries.

**Tech Stack:** TypeScript, Obsidian Plugin API, esbuild, vitest

---

## Task 1: Mechanical one-liners

**Files:**
- Modify: `src/domain-map.ts:70`
- Modify: `src/controller.ts:52`, `src/controller.ts:283`
- Modify: `src/view.ts:49`, `src/view.ts:141`
- Modify: `src/main.ts:71`, `src/main.ts:83`, `src/main.ts:88`
- Modify: `src/settings.ts:17`

- [ ] **Step 1: Verify tests pass before any changes**

```bash
npm test
```
Expected: all tests pass (green).

- [ ] **Step 2: Fix regex escape in domain-map.ts**

In `src/domain-map.ts` line 70, change:
```ts
if (!/^[\p{L}\p{N}_\-]+$/u.test(id)) return { ok: false, error: "ID допускает только буквы/цифры/_/-" };
```
To:
```ts
if (!/^[\p{L}\p{N}_-]+$/u.test(id)) return { ok: false, error: "ID допускает только буквы/цифры/_/-" };
```

- [ ] **Step 3: Fix union type in controller.ts**

In `src/controller.ts` line 52, change:
```ts
async lint(domain: string | "all"): Promise<void> {
```
To:
```ts
async lint(domain: string): Promise<void> {
```

- [ ] **Step 4: Remove async from toVaultPath in controller.ts**

In `src/controller.ts` line 283, change:
```ts
private async toVaultPath(spawnCwd: string | undefined, savedPath: string): Promise<string | null> {
```
To:
```ts
private toVaultPath(spawnCwd: string | undefined, savedPath: string): string | null {
```

The call site at line 252 uses `await this.toVaultPath(...)` — `await` on a non-Promise returns the value directly, so it continues to work without change.

- [ ] **Step 5: Remove async from onOpen and onClose in view.ts**

In `src/view.ts` line 49, change:
```ts
async onOpen(): Promise<void> {
```
To:
```ts
onOpen(): void {
```

In `src/view.ts` line 141, change:
```ts
async onClose(): Promise<void> {
```
To:
```ts
onClose(): void {
```

- [ ] **Step 6: Replace console.log with console.debug in main.ts**

In `src/main.ts` line 83:
```ts
console.debug("[llm-wiki] loaded");
```

In `src/main.ts` line 88:
```ts
console.debug("[llm-wiki] unloaded");
```

- [ ] **Step 7: Remove redundant type assertion in main.ts**

In `src/main.ts` line 71, change:
```ts
(d, f) => void this.controller.init(d as string, f.dryRun ?? false)).open();
```
To:
```ts
(d, f) => void this.controller.init(d, f.dryRun ?? false)).open();
```

- [ ] **Step 8: Replace h2 element with setHeading() in settings.ts**

In `src/settings.ts` line 17, change:
```ts
containerEl.createEl("h2", { text: "LLM Wiki" });
```
To:
```ts
new Setting(containerEl).setName("LLM Wiki").setHeading();
```

- [ ] **Step 9: Run tests**

```bash
npm test
```
Expected: all tests pass.

- [ ] **Step 10: Build check**

```bash
npm run build
```
Expected: no TypeScript errors, `main.js` produced.

- [ ] **Step 11: Commit**

```bash
git add src/domain-map.ts src/controller.ts src/view.ts src/main.ts src/settings.ts
git commit -m "fix: mechanical review fixes — union type, async, console, heading"
```

---

## Task 2: Fix `any` types in stream.ts

**Files:**
- Modify: `src/stream.ts`

- [ ] **Step 1: Add isRecord guard and replace `let obj: any`**

Replace the top of `src/stream.ts` (lines 1–21) with:

```ts
import type { RunEvent } from "./types";

const PREVIEW_MAX = 200;

function isRecord(obj: unknown): obj is Record<string, unknown> {
  return typeof obj === "object" && obj !== null;
}

export function parseStreamLine(raw: string): RunEvent | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // iclaude.sh wrapper и сторонние логгеры могут писать в stdout не-JSON строки
  // (баннеры, ANSI-цвета). Считаем строкой stream-json только те, что начинаются
  // с '{' — остальное молча игнорируем, чтобы не засорять панель.
  if (!trimmed.startsWith("{")) return null;

  let obj: unknown;
  try {
    obj = JSON.parse(trimmed);
  } catch {
    return { kind: "error", message: `stream parse error: ${truncate(trimmed, 120)}` };
  }

  if (!isRecord(obj)) return null;

  switch (obj.type) {
    case "system": {
      const msg = `${obj.subtype ?? "system"}${obj.model ? ` (${obj.model})` : ""}`;
      return { kind: "system", message: msg };
    }
    case "assistant":
      return mapAssistant(obj);
    case "user":
      return mapUserToolResult(obj);
    case "result":
      return mapResult(obj);
    default:
      return null;
  }
}
```

- [ ] **Step 2: Replace mapAssistant signature and body**

Replace `function mapAssistant(obj: any)` (lines 39–61) with:

```ts
function mapAssistant(obj: Record<string, unknown>): RunEvent | null {
  const msg = obj.message;
  if (!isRecord(msg)) return null;
  const content = msg.content;
  if (!Array.isArray(content) || content.length === 0) return null;
  // одна строка stream-json несёт один блок (один tool_use или один text-чанк)
  const block = content[0] as Record<string, unknown>;
  if (block?.type === "tool_use") {
    if (block.name === "AskUserQuestion") {
      const input = isRecord(block.input) ? block.input : {};
      return {
        kind: "ask_user",
        question: String(input.prompt ?? ""),
        options: Array.isArray(input.options)
          ? (input.options as unknown[]).map(String)
          : [],
        toolUseId: String(block.id ?? ""),
      };
    }
    return { kind: "tool_use", name: String(block.name ?? "?"), input: block.input };
  }
  if (block?.type === "text") {
    return { kind: "assistant_text", delta: String(block.text ?? "") };
  }
  return null;
}
```

- [ ] **Step 3: Replace mapUserToolResult signature and body**

Replace `function mapUserToolResult(obj: any)` (lines 63–69) with:

```ts
function mapUserToolResult(obj: Record<string, unknown>): RunEvent | null {
  const msg = obj.message;
  if (!isRecord(msg)) return null;
  const content = msg.content;
  if (!Array.isArray(content)) return null;
  const block = content[0];
  if (!isRecord(block) || block.type !== "tool_result") return null;
  const isErr = Boolean(block.is_error);
  const preview = typeof block.content === "string" ? truncate(block.content, PREVIEW_MAX) : undefined;
  return { kind: "tool_result", ok: !isErr, preview };
}
```

- [ ] **Step 4: Replace mapResult signature and body**

Replace `function mapResult(obj: any)` (lines 71–81) with:

```ts
function mapResult(obj: Record<string, unknown>): RunEvent {
  if (obj.is_error || obj.subtype === "error") {
    return { kind: "error", message: String(obj.result ?? obj.error ?? "claude error") };
  }
  return {
    kind: "result",
    durationMs: Number(obj.duration_ms ?? 0),
    usdCost: typeof obj.total_cost_usd === "number" ? obj.total_cost_usd : undefined,
    text: String(obj.result ?? ""),
  };
}
```

- [ ] **Step 5: Run tests**

```bash
npm test
```
Expected: all tests pass (stream tests especially).

- [ ] **Step 6: Build check**

```bash
npm run build
```
Expected: no TypeScript errors.

- [ ] **Step 7: Verify no `any` remains in stream.ts**

```bash
grep -n ": any" src/stream.ts
```
Expected: no output.

- [ ] **Step 8: Commit**

```bash
git add src/stream.ts
git commit -m "fix: replace any with unknown + isRecord guard in stream.ts"
```

---

## Task 3: Handle unhandled promises

**Files:**
- Modify: `src/view.ts`
- Modify: `src/controller.ts`

The bot flagged 3 locations. Two are fire-and-forget calls that should use `void`; one is a missing `await`.

- [ ] **Step 1: Fix MarkdownRenderer.render in renderHistory (view.ts)**

In `src/view.ts`, in the `renderHistory()` method, find:
```ts
MarkdownRenderer.render(this.app, it.finalText || "(пусто)", this.finalEl, this.plugin.controller.cwdOrEmpty(), comp);
```
Change to:
```ts
void MarkdownRenderer.render(this.app, it.finalText || "(пусто)", this.finalEl, this.plugin.controller.cwdOrEmpty(), comp);
```

- [ ] **Step 2: Scan for remaining unhandled promises in flagged files**

Run:
```bash
grep -n "MarkdownRenderer.render\|\.setViewState\|\.openLinkText\|saveSettings\(\)" src/view.ts src/controller.ts src/main.ts
```

For each line that calls a Promise-returning function without `await` or `void` prefix, add `void`.

- [ ] **Step 3: Run tests**

```bash
npm test
```
Expected: all tests pass.

- [ ] **Step 4: Build check**

```bash
npm run build
```
Expected: no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add src/view.ts src/controller.ts src/main.ts
git commit -m "fix: mark fire-and-forget promises with void"
```

---

## Task 4: Replace inline style.display with CSS class

**Files:**
- Modify: `src/view.ts`
- Modify: `styles.css`

- [ ] **Step 1: Add .llm-wiki-hidden class to styles.css**

Open `styles.css` and add at the end:
```css
.llm-wiki-hidden {
  display: none;
}
```

- [ ] **Step 2: Replace initial hide in onOpen (view.ts line ~131)**

Find:
```ts
this.stepsEl = root.createDiv("llm-wiki-steps");
this.stepsEl.style.display = "none";
```
Replace with:
```ts
this.stepsEl = root.createDiv("llm-wiki-steps");
this.stepsEl.addClass("llm-wiki-hidden");
```

- [ ] **Step 3: Replace show in setRunning (view.ts line ~206)**

Find:
```ts
this.stepsEl.style.display = "";
```
Replace with:
```ts
this.stepsEl.removeClass("llm-wiki-hidden");
```

- [ ] **Step 4: Replace hide in finish() (view.ts line ~293)**

Find:
```ts
this.stepsEl.style.display = "none";
```
(inside `finish()` method — not inside `toggleSteps`)
Replace with:
```ts
this.stepsEl.addClass("llm-wiki-hidden");
```

- [ ] **Step 5: Replace toggle in toggleSteps() (view.ts line ~307)**

Find:
```ts
this.stepsEl.style.display = this.stepsOpen ? "" : "none";
```
Replace with:
```ts
if (this.stepsOpen) {
  this.stepsEl.removeClass("llm-wiki-hidden");
} else {
  this.stepsEl.addClass("llm-wiki-hidden");
}
```

- [ ] **Step 6: Verify no style.display remains**

```bash
grep -n "style\.display" src/view.ts
```
Expected: no output (or only unrelated lines).

- [ ] **Step 7: Run tests**

```bash
npm test
```
Expected: all tests pass.

- [ ] **Step 8: Build check**

```bash
npm run build
```
Expected: no TypeScript errors.

- [ ] **Step 9: Commit**

```bash
git add src/view.ts styles.css
git commit -m "fix: replace style.display with CSS class llm-wiki-hidden"
```

---

## Task 5: Translate settings.ts to English

**Files:**
- Modify: `src/settings.ts`

All `setName()` and `setDesc()` calls currently use Russian. Replace each per the table below.

- [ ] **Step 1: Replace Backend description**

Find: `.setDesc('Выберите бэкенд для выполнения операций.')`
Replace: `.setDesc("Choose the backend for running operations.")`

- [ ] **Step 2: Replace Claude Code section strings**

| Find | Replace |
|------|---------|
| `.setName("Путь к Claude Code")` | `.setName("Claude Code path")` |
| `.setDesc("Обязательно. Полный абсолютный путь к iclaude.sh / iclaude / claude.")` | `.setDesc("Required. Absolute path to iclaude.sh / iclaude / claude.")` |
| `.setName("Путь к навыку llm-wiki")` | `.setName("LLM Wiki skill path")` |
| `.setDesc("Обязательно. Полный абсолютный путь к папке навыка (содержит shared/domain-map.json).")` | `.setDesc("Required. Absolute path to the skill folder (contains shared/domain-map.json).")` |
| `.setDesc("Список через запятую. По умолчанию: Read,Edit,Write,Glob,Grep")` | `.setDesc("Comma-separated list. Default: Read,Edit,Write,Glob,Grep")` |
| `.setName("Модель")` (first occurrence, Claude section) | `.setName("Model")` |
| `.setDesc("Передаётся claude как --model. Пресет, либо введите произвольный ID (claude-opus-4-7 и т.п.).")` | `.setDesc("Passed to claude as --model. Use a preset or enter a custom ID (e.g. claude-opus-4-7).")` |
| `.setName("Таймауты (секунды)")` | `.setName("Timeouts (seconds)")` |
| `.setName("Показывать raw JSON в панели")` | `.setName("Show raw JSON in panel")` |

- [ ] **Step 3: Replace Native Agent section strings**

| Find | Replace |
|------|---------|
| `.setDesc('Для Ollama введите "ollama". Для OpenAI — ключ sk-...')` | `.setDesc('For Ollama enter "ollama". For OpenAI — key sk-...')` |
| `.setName("Модель")` (second occurrence, OpenAI section) | `.setName("Model")` |
| `.setDesc("Имя модели: llama3.2, mistral, gpt-4o и т.п.")` | `.setDesc("Model name: llama3.2, mistral, gpt-4o, etc.")` |
| `.setDesc("0.0–1.0. Низкая (0.1–0.3) — точные факты, высокая — творческий стиль.")` | `.setDesc("0.0–1.0. Low (0.1–0.3) — factual, high — creative.")` |
| `.setDesc("Максимум токенов в ответе. Для вики-страниц рекомендуется ≥ 4096.")` | `.setDesc("Max tokens in response. For wiki pages ≥ 4096 recommended.")` |
| `.setDesc("0.0–1.0, или пусто — отключить. Альтернатива temperature (nucleus sampling).")` | `.setDesc("0.0–1.0, or empty to disable. Alternative to temperature (nucleus sampling).")` |
| `.setName("Request timeout (сек)")` | `.setName("Request timeout (s)")` |
| `.setDesc("Таймаут HTTP-запроса к LLM. Для Ollama на больших моделях рекомендуется 300+.")` | `.setDesc("HTTP request timeout for the LLM. For Ollama on large models 300+ recommended.")` |
| `.setDesc("Размер контекста модели. Только Ollama. Пусто — использовать дефолт модели.")` | `.setDesc("Model context size. Ollama only. Empty — use model default.")` |
| `.setDesc("Добавляется в начало системного промпта каждой операции. Перезаписывает дефолт при изменении.")` | `.setDesc("Prepended to the system prompt for every operation. Overrides the default when set.")` |
| `.setName("Папка domain-map")` | `.setName("Domain map folder")` |
| `.setDesc("Где хранить domain-map-<vault>.json. Пусто — авто: <vault>/.obsidian/plugins/llm-wiki/")` | `.setDesc("Where to store domain-map-<vault>.json. Empty — auto: <vault>/.obsidian/plugins/llm-wiki/")` |

- [ ] **Step 4: Replace shared section strings**

| Find | Replace |
|------|---------|
| `.setName("Лимит истории")` | `.setName("History limit")` |
| `.setDesc("Максимум операций в истории боковой панели.")` | `.setDesc("Maximum operations kept in sidebar history.")` |
| `.setName("Лог агента (JSONL)")` | `.setName("Agent log (JSONL)")` |
| `.setDesc("Абсолютный путь к файлу лога. Каждый RunEvent пишется как одна JSON-строка. Пусто — логирование отключено.")` | `.setDesc("Absolute path to the log file. Each RunEvent written as one JSON line. Empty — logging disabled.")` |

- [ ] **Step 5: Also translate the mobile warning**

Find:
```ts
containerEl.createEl("p", { text: "⚠ Mobile не поддерживается (нет child_process)." });
```
Replace:
```ts
containerEl.createEl("p", { text: "⚠ Mobile is not supported (no child_process)." });
```

- [ ] **Step 6: Verify no Russian text remains in settings.ts**

```bash
grep -Pn "[а-яёА-ЯЁ]" src/settings.ts
```
Expected: no output.

- [ ] **Step 7: Build check**

```bash
npm run build
```
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/settings.ts
git commit -m "i18n: translate settings.ts UI strings to English"
```

---

## Task 6: Translate view.ts, controller.ts, main.ts to English + final verification

**Files:**
- Modify: `src/view.ts`
- Modify: `src/controller.ts`
- Modify: `src/main.ts`

- [ ] **Step 1: Translate view.ts UI strings**

In `src/view.ts`, apply these replacements:

| Find | Replace |
|------|---------|
| `text: "Домен:"` | `text: "Domain:"` |
| `attr: { title: "Перечитать domain-map.json" }` | `attr: { title: "Reload domain-map.json" }` |
| `{ text: "+ Домен" }` | `{ text: "Add domain" }` |
| `{ text: "Спросить" }` | `{ text: "Ask" }` |
| `{ text: "Спросить и сохранить" }` | `{ text: "Ask and save" }` |
| `{ text: "Отменить", cls: "mod-warning" }` | `{ text: "Cancel", cls: "mod-warning" }` |
| `new Notice("Нет активного файла")` | `new Notice("No active file")` |
| `new Notice("Выберите конкретный домен для init")` | `new Notice("Select a specific domain for init")` |
| `new Notice("cwd не задан")` | `new Notice("Working directory is not set")` |
| `new Notice("Введите вопрос")` | `new Notice("Enter a question")` |
| `new Notice("Уже выполняется операция")` | `new Notice("Operation already in progress")` |
| `text: "(вся вики)"` | `text: "(all)"` |
| `attr: { placeholder: "Вопрос по wiki… (Ctrl+Enter — спросить, Ctrl+Shift+Enter — спросить и сохранить)", rows: "3" }` | `attr: { placeholder: "Question… (Ctrl+Enter — ask, Ctrl+Shift+Enter — ask and save)", rows: "3" }` |
| `appendText(" Ход выполнения ")` | `appendText(" Progress ")` |
| `root.createEl("h4", { text: "Результат" })` | `root.createEl("h4", { text: "Result" })` |
| `root.createEl("h4", { text: "История" })` | `root.createEl("h4", { text: "History" })` |
| `contentEl.createEl("h3", { text: "LLM Wiki — требуется ответ" })` | `contentEl.createEl("h3", { text: "LLM Wiki — answer required" })` |
| `contentEl.createEl("button", { text: "ОК" })` | `contentEl.createEl("button", { text: "OK" })` |
| `text: "Отменить",` (in WikiQuestionModal) | `text: "Cancel",` |
| `this.historyEl.createDiv("muted").setText("Истории пока нет.")` | `this.historyEl.createDiv("muted").setText("No history yet.")` |
| `el.createSpan({ text: "⏳ Ожидание ответа…" })` | `el.createSpan({ text: "⏳ Waiting for answer…" })` |

Also translate the ConfirmModal strings in the button listeners. Find in `lintBtn.addEventListener`:
```ts
new ConfirmModal(this.plugin.app, "Lint — подтверждение", [
  `Домен: ${domainLabel}`,
  "Claude проверит wiki-страницы на соответствие стандартам качества.",
```
Replace:
```ts
new ConfirmModal(this.plugin.app, "Lint — confirm", [
  `Domain: ${domainLabel}`,
  "Claude will check wiki pages for quality standards.",
```

Find in `ingestBtn.addEventListener`:
```ts
new ConfirmModal(this.plugin.app, "Ingest — подтверждение", [
  `Файл: ${file.name}`,
  "Claude прочитает файл, извлечёт сущности и обновит wiki-страницы домена.",
```
Replace:
```ts
new ConfirmModal(this.plugin.app, "Ingest — confirm", [
  `File: ${file.name}`,
  "Claude will read the file, extract entities and update domain wiki pages.",
```

Find in `initBtn.addEventListener`:
```ts
new ConfirmModal(this.plugin.app, "Init — подтверждение", [
  `Домен: «${d}»`,
  "Claude создаст структуру папок и базовые wiki-страницы для домена.",
```
Replace:
```ts
new ConfirmModal(this.plugin.app, "Init — confirm", [
  `Domain: «${d}»`,
  "Claude will create the folder structure and base wiki pages for the domain.",
```

- [ ] **Step 2: Translate controller.ts Notice messages**

In `src/controller.ts`, apply:

| Find | Replace |
|------|---------|
| `new Notice("Отмена…")` | `new Notice("Cancelling…")` |
| `new Notice("Нет активного файла")` (if present) | `new Notice("No active file")` |
| `new Notice(\`Домен «${input.id}» добавлен\`)` | `` new Notice(`Domain «${input.id}» added`) `` |
| `new Notice(\`Не удалось добавить домен: ${r.error}\`)` | `` new Notice(`Failed to add domain: ${r.error}`) `` |
| `new Notice("путь к навыку не задан")` | `new Notice("Skill path is not set")` |
| `new Notice("Укажите путь к навыку llm-wiki в настройках")` | `new Notice("Set the LLM Wiki skill path in settings")` |
| `new Notice(\`Папка навыка не найдена: ${sp}\`)` | `` new Notice(`Skill folder not found: ${sp}`) `` |
| `new Notice("Укажите путь к Claude Code в настройках")` | `new Notice("Set the Claude Code path in settings")` |
| `new Notice(\`Claude Code не найден: ${p}\`)` | `` new Notice(`Claude Code not found: ${p}`) `` |
| `new Notice(\`Claude Code недоступен: ${p}\`)` | `` new Notice(`Claude Code unavailable: ${p}`) `` |
| `new Notice("Уже выполняется операция, отмените её сначала")` | `new Notice("Operation in progress, cancel it first")` |
| `finalText = \`Ошибка: ${(err as Error).message}\`` | `finalText = \`Error: ${(err as Error).message}\`` |

- [ ] **Step 3: Translate main.ts command names**

In `src/main.ts`, translate the `name` fields of `addCommand` calls:

| Find | Replace |
|------|---------|
| `name: "Открыть панель"` | `name: "Open panel"` |
| `name: "Ingest активного файла"` | `name: "Ingest active file"` |
| `name: "Query (вопрос)"` | `name: "Query"` |
| `name: "Query + сохранить как страницу"` | `name: "Query and save as page"` |
| `name: "Lint домена"` | `name: "Lint domain"` |
| `name: "Init домена"` | `name: "Init domain"` |
| `name: "Отменить операцию"` | `name: "Cancel operation"` |

Also translate `updateMetrics` in view.ts:
```ts
this.progressCount.setText(`${this.stepCount} steps · ${dur}s`);
```
(find: `шагов`, replace the whole setText string)

- [ ] **Step 4: Translate remaining Russian strings in view.ts helpers**

In `translateSystemEvent()` at the bottom of `src/view.ts`:
```ts
function translateSystemEvent(message: string): string {
  if (message === "hook_started") return "Starting";
  if (message === "hook_response") return "Initialising";
  if (message.startsWith("init")) {
    const model = message.replace(/^init\s*/, "").replace(/[()]/g, "").trim();
    return model ? `Initialising (${model})` : "Initialising";
  }
  return message;
}
```

- [ ] **Step 5: Verify no Russian remains in translated files**

```bash
grep -Pn "[а-яёА-ЯЁ]" src/view.ts src/controller.ts src/main.ts
```
Expected: no output (comments containing Russian are acceptable but should be checked).

- [ ] **Step 6: Run tests**

```bash
npm test
```
Expected: all tests pass.

- [ ] **Step 7: Build check**

```bash
npm run build
```
Expected: no TypeScript errors.

- [ ] **Step 8: Verify no console.log remains**

```bash
grep -rn "console\.log" src/
```
Expected: no output.

- [ ] **Step 9: Bump patch version before final build**

Read current version from `package.json`, increment patch (e.g. `0.1.9` → `0.1.10`), update both `package.json` and `manifest.json`.

- [ ] **Step 10: Final build**

```bash
npm run build
```

- [ ] **Step 11: Commit**

```bash
git add src/view.ts src/controller.ts src/main.ts package.json manifest.json main.js
git commit -m "i18n: translate all UI strings to English (sentence case)"
```
